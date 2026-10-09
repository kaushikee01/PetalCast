// Talks to Open-Meteo for us. Every answer goes through the cache first.
// The frontend never calls Open-Meteo directly any more.
const config = require("../config");
const { TtlCache } = require("../cache");
const { HttpError } = require("../middleware/errors");
const { round2 } = require("../validate");

const GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const AIR_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";

const cache = new TtlCache(500);

function upstreamError(message) {
  return new HttpError(502, message, { expose: true });
}

async function getJson(url) {
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(8000) });   // give up after 8 seconds
  } catch (err) {
    throw upstreamError("The weather service didn't respond. Please try again in a moment.");
  }
  if (!res.ok) throw upstreamError("The weather service had a problem. Please try again in a moment.");
  return res.json();
}

function unitParams(units) {
  const metric = units === "metric";
  return {
    temperature_unit: metric ? "celsius" : "fahrenheit",
    wind_speed_unit: metric ? "kmh" : "mph"
  };
}

// Find cities by name
function geocode(query, count = 5) {
  const key = `geo:${query.toLowerCase()}:${count}`;
  return cache.remember(key, config.cache.geoTtl, async () => {
    const params = new URLSearchParams({ name: query, count, language: "en", format: "json" });
    const data = await getJson(`${GEO_URL}?${params}`);
    // Keep only what the app needs
    const results = (data.results || []).map((r) => ({
      id: r.id,
      name: r.name,
      admin1: r.admin1 || "",
      country: r.country || "",
      latitude: r.latitude,
      longitude: r.longitude,
      timezone: r.timezone || ""
    }));
    return { results };
  });
}

// Current weather + 24h hourly + 7-day daily
function forecast(lat, lon, units = "metric") {
  const la = round2(lat);
  const lo = round2(lon);
  const key = `forecast:${units}:${la},${lo}`;
  return cache.remember(key, config.cache.weatherTtl, () => {
    const params = new URLSearchParams({
      latitude: la,
      longitude: lo,
      current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,pressure_msl,wind_speed_10m,wind_direction_10m",
      hourly: "temperature_2m,precipitation_probability,weather_code,visibility,uv_index,is_day,wind_speed_10m",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,uv_index_max",
      timezone: "auto",
      forecast_days: 7,
      ...unitParams(units)
    });
    return getJson(`${FORECAST_URL}?${params}`);
  });
}

// Air quality
function air(lat, lon) {
  const la = round2(lat);
  const lo = round2(lon);
  const key = `air:${la},${lo}`;
  return cache.remember(key, config.cache.airTtl, () => {
    const params = new URLSearchParams({
      latitude: la,
      longitude: lo,
      current: "us_aqi,pm2_5",
      timezone: "auto"
    });
    return getJson(`${AIR_URL}?${params}`);
  });
}

// Quick current weather for many cities in one request (home screen cards)
function cards(places, units = "metric") {
  const rounded = places.map((p) => ({ lat: round2(p.lat), lon: round2(p.lon) }));
  const key = `cards:${units}:${rounded.map((p) => `${p.lat},${p.lon}`).join(";")}`;
  return cache.remember(key, config.cache.weatherTtl, async () => {
    const params = new URLSearchParams({
      latitude: rounded.map((p) => p.lat).join(","),
      longitude: rounded.map((p) => p.lon).join(","),
      current: "temperature_2m,weather_code,is_day",
      timezone: "auto",
      ...unitParams(units)
    });
    const data = await getJson(`${FORECAST_URL}?${params}`);
    // Open-Meteo returns one object for one place, a list for several
    return Array.isArray(data) ? data : [data];
  });
}

module.exports = { geocode, forecast, air, cards, cache };
