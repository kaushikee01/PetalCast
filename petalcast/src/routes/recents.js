// Recent searches (the chips on the home screen). Login required.
const express = require("express");
const db = require("../db");
const v = require("../validate");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errors");

const router = express.Router();
router.use(requireAuth);

const MAX_RECENTS = 6;

const show = (r) => ({ name: r.name, region: r.region, lat: r.lat, lon: r.lon });

// GET /api/recents
router.get("/", (req, res) => {
  const rows = db.prepare(
    "SELECT * FROM recent_searches WHERE user_id = ? ORDER BY searched_at DESC LIMIT ?"
  ).all(req.user.id, MAX_RECENTS);
  res.json({ recents: rows.map(show) });
});

// POST /api/recents   { name, region, lat, lon }
router.post("/", asyncHandler(async (req, res) => {
  const name = v.text(req.body.name, "name", { max: 80 });
  const region = v.text(req.body.region, "region", { max: 80, optional: true });
  const lat = v.lat(req.body.lat);
  const lon = v.lon(req.body.lon);

  // Add it, or move it to the front if it's already there
  db.prepare(`
    INSERT INTO recent_searches (user_id, name, region, lat, lon, place_key, searched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (user_id, place_key)
    DO UPDATE SET searched_at = excluded.searched_at, name = excluded.name, region = excluded.region
  `).run(req.user.id, name, region, lat, lon, v.placeKey(lat, lon), Date.now());

  // Keep only the newest few
  db.prepare(`
    DELETE FROM recent_searches WHERE user_id = ? AND id NOT IN (
      SELECT id FROM recent_searches WHERE user_id = ? ORDER BY searched_at DESC LIMIT ?
    )`).run(req.user.id, req.user.id, MAX_RECENTS);

  res.status(201).json({ ok: true });
}));

// DELETE /api/recents   (the "Clear" button)
router.delete("/", (req, res) => {
  db.prepare("DELETE FROM recent_searches WHERE user_id = ?").run(req.user.id);
  res.status(204).end();
});

module.exports = router;
