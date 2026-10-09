// Saved places (the star button). Login required.
const express = require("express");
const db = require("../db");
const v = require("../validate");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler, HttpError } = require("../middleware/errors");

const router = express.Router();
router.use(requireAuth);

const MAX_SAVED = 8;

const show = (r) => ({ id: r.id, name: r.name, region: r.region, lat: r.lat, lon: r.lon });

// GET /api/places
router.get("/", (req, res) => {
  const rows = db.prepare("SELECT * FROM saved_places WHERE user_id = ? ORDER BY id").all(req.user.id);
  res.json({ places: rows.map(show) });
});

// POST /api/places   { name, region, lat, lon }
router.post("/", asyncHandler(async (req, res) => {
  const name = v.text(req.body.name, "name", { max: 80 });
  const region = v.text(req.body.region, "region", { max: 80, optional: true });
  const lat = v.lat(req.body.lat);
  const lon = v.lon(req.body.lon);
  const key = v.placeKey(lat, lon);

  // Saving the same place twice just returns the one we already have
  const existing = db.prepare("SELECT * FROM saved_places WHERE user_id = ? AND place_key = ?").get(req.user.id, key);
  if (existing) return res.json({ place: show(existing) });

  const count = db.prepare("SELECT COUNT(*) AS n FROM saved_places WHERE user_id = ?").get(req.user.id).n;
  if (count >= MAX_SAVED) throw new HttpError(400, `You can save up to ${MAX_SAVED} places. Remove one first.`);

  const id = db.prepare(
    "INSERT INTO saved_places (user_id, name, region, lat, lon, place_key) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(req.user.id, name, region, lat, lon, key).lastInsertRowid;

  const row = db.prepare("SELECT * FROM saved_places WHERE id = ?").get(id);
  res.status(201).json({ place: show(row) });
}));

// DELETE /api/places/:id
router.delete("/:id", asyncHandler(async (req, res) => {
  const id = v.integer(req.params.id, "id", 1, Number.MAX_SAFE_INTEGER);
  // "AND user_id = ?" makes sure you can only delete your own places
  const result = db.prepare("DELETE FROM saved_places WHERE id = ? AND user_id = ?").run(id, req.user.id);
  if (result.changes === 0) throw new HttpError(404, "That place isn't in your saved list.");
  res.status(204).end();
}));

module.exports = router;
