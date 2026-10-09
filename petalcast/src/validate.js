// Never trust what arrives from the internet. Every input is checked here first.
const { HttpError } = require("./middleware/errors");

function number(value, name, min, max) {
  if (value === undefined || value === null || value === "") {
    throw new HttpError(400, `${name} is required.`);
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new HttpError(400, `${name} must be a number between ${min} and ${max}.`);
  }
  return n;
}

const lat = (v) => number(v, "lat", -90, 90);
const lon = (v) => number(v, "lon", -180, 180);

function integer(value, name, min, max, fallback) {
  if (value === undefined && fallback !== undefined) return fallback;
  const n = number(value, name, min, max);
  if (!Number.isInteger(n)) throw new HttpError(400, `${name} must be a whole number.`);
  return n;
}

function units(value) {
  if (value === undefined) return "metric";
  if (value !== "metric" && value !== "imperial") {
    throw new HttpError(400, "units must be 'metric' or 'imperial'.");
  }
  return value;
}

function text(value, name, { min = 1, max = 100, optional = false } = {}) {
  if ((value === undefined || value === null) && optional) return "";
  if (typeof value !== "string") throw new HttpError(400, `${name} must be text.`);
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw new HttpError(400, `${name} must be between ${min} and ${max} characters.`);
  }
  return trimmed;
}

function email(value) {
  const e = text(value, "email", { min: 5, max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
    throw new HttpError(400, "Enter a valid email address.");
  }
  return e;
}

function password(value) {
  if (typeof value !== "string") throw new HttpError(400, "password must be text.");
  // bcrypt only reads the first 72 bytes, so we cap the length
  if (value.length < 8 || Buffer.byteLength(value) > 72) {
    throw new HttpError(400, "Password must be 8 to 72 characters long.");
  }
  return value;
}

function boolean(value, name) {
  if (typeof value !== "boolean") throw new HttpError(400, `${name} must be true or false.`);
  return value;
}

// Round to ~1 km so nearby requests share one cached answer
const round2 = (n) => Math.round(n * 100) / 100;
// A short text id for a place, used to spot duplicates
const placeKey = (la, lo) => `${Number(la).toFixed(2)},${Number(lo).toFixed(2)}`;

module.exports = { number, lat, lon, integer, units, text, email, password, boolean, round2, placeKey };
