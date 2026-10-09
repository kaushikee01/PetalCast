// Weather alerts ("tell me if rain is coming"). Login required.
const express = require("express");
const db = require("../db");
const v = require("../validate");
const { ALERT_TYPES } = require("../services/alertRules");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler, HttpError } = require("../middleware/errors");

const router = express.Router();
const MAX_ALERTS = 10;

// GET /api/alerts/types   (public: what kinds of alert exist, and their limits)
router.get("/types", (req, res) => res.json({ types: ALERT_TYPES }));

router.use(requireAuth);

const show = (r) => ({
  id: r.id,
  name: r.name,
  region: r.region,
  lat: r.lat,
  lon: r.lon,
  type: r.type,
  threshold: r.threshold,
  enabled: !!r.enabled,
  lastTriggeredAt: r.last_triggered_at ? new Date(r.last_triggered_at).toISOString() : null
});

function checkThreshold(type, value) {
  const rule = ALERT_TYPES[type];
  if (type === "daily") return null;                       // morning summary has no threshold
  if (value === undefined || value === null) return rule.default;
  return v.number(value, "threshold", rule.min, rule.max);
}

// GET /api/alerts
router.get("/", (req, res) => {
  const rows = db.prepare("SELECT * FROM alerts WHERE user_id = ? ORDER BY id").all(req.user.id);
  res.json({ alerts: rows.map(show) });
});

// POST /api/alerts   { name, region, lat, lon, type, threshold? }
router.post("/", asyncHandler(async (req, res) => {
  const type = req.body.type;
  if (!Object.prototype.hasOwnProperty.call(ALERT_TYPES, type)) {
    throw new HttpError(400, `type must be one of: ${Object.keys(ALERT_TYPES).join(", ")}.`);
  }
  const name = v.text(req.body.name, "name", { max: 80 });
  const region = v.text(req.body.region, "region", { max: 80, optional: true });
  const lat = v.lat(req.body.lat);
  const lon = v.lon(req.body.lon);
  const threshold = checkThreshold(type, req.body.threshold);

  const count = db.prepare("SELECT COUNT(*) AS n FROM alerts WHERE user_id = ?").get(req.user.id).n;
  if (count >= MAX_ALERTS) throw new HttpError(400, `You can have up to ${MAX_ALERTS} alerts.`);

  const id = db.prepare(
    "INSERT INTO alerts (user_id, name, region, lat, lon, type, threshold) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(req.user.id, name, region, lat, lon, type, threshold).lastInsertRowid;

  res.status(201).json({ alert: show(db.prepare("SELECT * FROM alerts WHERE id = ?").get(id)) });
}));

// PATCH /api/alerts/:id   { enabled?, threshold? }
router.patch("/:id", asyncHandler(async (req, res) => {
  const id = v.integer(req.params.id, "id", 1, Number.MAX_SAFE_INTEGER);
  const alert = db.prepare("SELECT * FROM alerts WHERE id = ? AND user_id = ?").get(id, req.user.id);
  if (!alert) throw new HttpError(404, "Alert not found.");

  const enabled = req.body.enabled !== undefined ? (v.boolean(req.body.enabled, "enabled") ? 1 : 0) : alert.enabled;
  let threshold = alert.threshold;
  if (req.body.threshold !== undefined) {
    if (alert.type === "daily") throw new HttpError(400, "The morning summary has no threshold.");
    threshold = checkThreshold(alert.type, req.body.threshold);
  }

  db.prepare("UPDATE alerts SET enabled = ?, threshold = ? WHERE id = ?").run(enabled, threshold, id);
  res.json({ alert: show(db.prepare("SELECT * FROM alerts WHERE id = ?").get(id)) });
}));

// DELETE /api/alerts/:id
router.delete("/:id", asyncHandler(async (req, res) => {
  const id = v.integer(req.params.id, "id", 1, Number.MAX_SAFE_INTEGER);
  const result = db.prepare("DELETE FROM alerts WHERE id = ? AND user_id = ?").run(id, req.user.id);
  if (result.changes === 0) throw new HttpError(404, "Alert not found.");
  res.status(204).end();
}));

module.exports = router;
