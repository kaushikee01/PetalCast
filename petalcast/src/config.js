// All settings live here. Everything comes from environment variables (.env file),
// so secrets never appear in the code.
require("dotenv").config();
const crypto = require("crypto");
const path = require("path");

const nodeEnv = process.env.NODE_ENV || "development";
const isProd = nodeEnv === "production";

function list(value, fallback) {
  if (!value) return fallback;
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}
function bool(value, fallback) {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes"].includes(String(value).toLowerCase());
}

// The secret that signs login tokens. In production it MUST be set.
let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.startsWith("change-me")) {
  if (isProd) {
    console.error("[config] JWT_SECRET is missing. Set a long random value in your environment.");
    process.exit(1);
  }
  jwtSecret = crypto.randomBytes(32).toString("hex");
  console.warn("[config] No JWT_SECRET set, using a temporary one. Everyone is logged out when the server restarts.");
}

module.exports = {
  nodeEnv,
  isProd,
  port: Number(process.env.PORT) || 3000,
  jwtSecret,
  jwtExpires: "7d",
  dbPath: path.resolve(__dirname, "..", process.env.DB_PATH || "data/petalcast.db"),
  corsOrigins: list(process.env.CORS_ORIGINS, ["http://localhost:3000"]),
  trustProxy: bool(process.env.TRUST_PROXY, false),

  // How long we keep a weather answer before asking Open-Meteo again
  cache: {
    weatherTtl: 10 * 60 * 1000,        // 10 minutes
    airTtl: 30 * 60 * 1000,            // 30 minutes
    geoTtl: 24 * 60 * 60 * 1000        // 24 hours (city coordinates don't change)
  },

  alerts: {
    enabled: bool(process.env.RUN_ALERTS, true),
    cron: process.env.ALERT_CRON || "*/30 * * * *"
  },

  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || "PetalCast <no-reply@localhost>"
  }
};
