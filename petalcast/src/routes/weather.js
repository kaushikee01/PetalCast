// Public weather endpoints (no login needed).
const express = require("express");
const om = require("../services/openmeteo");
const v = require("../validate");
const { asyncHandler, HttpError } = require("../middleware/errors");

const router = express.Router();

// GET /api/geocode?q=delhi&count=5
router.get("/geocode", asyncHandler(async (req, res) => {
  const q = v.text(req.query.q, "q", { min: 2, max: 80 });
  const count = v.integer(req.query.count, "count", 1, 10, 5);
  res.set("Cache-Control", "public, max-age=3600");
  res.json(await om.geocode(q, count));
}));

// GET /api/weather?lat=28.61&lon=77.21&units=metric
router.get("/weather", asyncHandler(async (req, res) => {
  const data = await om.forecast(v.lat(req.query.lat), v.lon(req.query.lon), v.units(req.query.units));
  res.set("Cache-Control", "public, max-age=300");
  res.json(data);
}));

// GET /api/air?lat=28.61&lon=77.21
router.get("/air", asyncHandler(async (req, res) => {
  const data = await om.air(v.lat(req.query.lat), v.lon(req.query.lon));
  res.set("Cache-Control", "public, max-age=900");
  res.json(data);
}));

// GET /api/cards?lat=28.61,19.07&lon=77.21,72.87&units=metric   (up to 20 places)
router.get("/cards", asyncHandler(async (req, res) => {
  const lats = String(req.query.lat || "").split(",");
  const lons = String(req.query.lon || "").split(",");
  if (lats.length !== lons.length) {
    throw new HttpError(400, "lat and lon must have the same number of values.");
  }
  if (lats.length < 1 || lats.length > 20) {
    throw new HttpError(400, "Send between 1 and 20 places.");
  }
  const places = lats.map((la, i) => ({ lat: v.lat(la), lon: v.lon(lons[i]) }));
  const data = await om.cards(places, v.units(req.query.units));
  res.set("Cache-Control", "public, max-age=300");
  res.json(data);
}));

module.exports = router;
