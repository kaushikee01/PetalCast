// Per-user settings: units and whether alerts are also emailed. Login required.
const express = require("express");
const db = require("../db");
const v = require("../validate");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler, HttpError } = require("../middleware/errors");

const router = express.Router();
router.use(requireAuth);

function read(userId) {
  const row = db.prepare("SELECT units, email_alerts FROM settings WHERE user_id = ?").get(userId)
    || { units: "metric", email_alerts: 0 };
  return { units: row.units, emailAlerts: !!row.email_alerts };
}

// GET /api/settings
router.get("/", (req, res) => res.json({ settings: read(req.user.id) }));

// PUT /api/settings   { "units": "imperial", "emailAlerts": true }   (send only what changed)
router.put("/", asyncHandler(async (req, res) => {
  const body = req.body || {};
  const current = read(req.user.id);

  const units = body.units !== undefined ? v.units(body.units) : current.units;
  const emailAlerts = body.emailAlerts !== undefined ? v.boolean(body.emailAlerts, "emailAlerts") : current.emailAlerts;
  if (body.units === undefined && body.emailAlerts === undefined) {
    throw new HttpError(400, "Send units and/or emailAlerts.");
  }

  db.prepare(`
    INSERT INTO settings (user_id, units, email_alerts) VALUES (?, ?, ?)
    ON CONFLICT (user_id) DO UPDATE SET units = excluded.units, email_alerts = excluded.email_alerts
  `).run(req.user.id, units, emailAlerts ? 1 : 0);

  res.json({ settings: { units, emailAlerts } });
}));

module.exports = router;
