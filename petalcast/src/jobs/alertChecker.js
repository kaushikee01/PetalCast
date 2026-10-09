// Runs on a schedule. Looks at every enabled alert, checks the weather, and creates a
// notification (plus an optional email) when the alert's rule is met.
const cron = require("node-cron");
const db = require("../db");
const config = require("../config");
const om = require("../services/openmeteo");
const { evaluate, isOnCooldown } = require("../services/alertRules");
const { sendMail } = require("../services/mailer");

const insertNotification = db.prepare(
  "INSERT INTO notifications (user_id, alert_id, title, body, created_at) VALUES (?, ?, ?, ?, ?)"
);
const markTriggered = db.prepare("UPDATE alerts SET last_triggered_at = ? WHERE id = ?");
const pruneNotifications = db.prepare(`
  DELETE FROM notifications WHERE user_id = ? AND id NOT IN (
    SELECT id FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 100
  )`);

let running = false;   // stops two checks from overlapping

async function runAlertCheck() {
  if (running) return { skipped: true };
  running = true;

  let checked = 0;
  let sent = 0;

  try {
    const alerts = db.prepare(`
      SELECT a.*, u.email, COALESCE(s.email_alerts, 0) AS email_alerts
      FROM alerts a
      JOIN users u ON u.id = a.user_id
      LEFT JOIN settings s ON s.user_id = a.user_id
      WHERE a.enabled = 1
    `).all();

    for (const alert of alerts) {
      checked++;
      try {
        if (isOnCooldown(alert)) continue;

        // The cache means 100 alerts for the same city cost only one request
        const forecast = await om.forecast(alert.lat, alert.lon, "metric");
        const air = alert.type === "aqi" ? await om.air(alert.lat, alert.lon).catch(() => null) : null;

        const result = evaluate(alert, forecast, air);
        if (!result) continue;

        const now = Date.now();
        insertNotification.run(alert.user_id, alert.id, result.title, result.body, now);
        markTriggered.run(now, alert.id);
        pruneNotifications.run(alert.user_id, alert.user_id);
        sent++;

        if (alert.email_alerts) {
          await sendMail(alert.email, `PetalCast: ${result.title}`, result.body);
        }
      } catch (err) {
        console.error(`[alerts] alert ${alert.id} failed:`, err.message);
      }
    }
  } finally {
    running = false;
  }

  console.log(`[alerts] checked ${checked}, sent ${sent}`);
  return { checked, sent };
}

function startAlertJob() {
  if (!config.alerts.enabled) {
    console.log("[alerts] scheduled checks are turned off (RUN_ALERTS=false)");
    return null;
  }
  if (!cron.validate(config.alerts.cron)) {
    console.error(`[alerts] ALERT_CRON "${config.alerts.cron}" isn't valid, alerts are not scheduled.`);
    return null;
  }
  console.log(`[alerts] checking on schedule: ${config.alerts.cron}`);
  return cron.schedule(config.alerts.cron, () => {
    runAlertCheck().catch((err) => console.error("[alerts] run failed:", err));
  });
}

module.exports = { runAlertCheck, startAlertJob };
