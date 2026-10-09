// Builds the Express app: security, rate limits, routes, then error handling.
const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const config = require("./config");
const db = require("./db");
const { notFound, errorHandler } = require("./middleware/errors");

function limiter(options) {
  return rateLimit({
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: { message: "Too many requests. Please slow down and try again shortly." } },
    ...options
  });
}

function createApp() {
  const app = express();

  app.disable("x-powered-by");
  if (config.trustProxy) app.set("trust proxy", 1);   // needed on most hosting services

  // Safe default headers (the Content-Security-Policy is off because the page loads Google Fonts)
  app.use(helmet({ contentSecurityPolicy: false }));

  // CORS: which websites may call this API from a browser
  app.use(cors({
    origin(origin, callback) {
      const allowed =
        !origin ||                                         // same-origin or tools like curl
        config.corsOrigins.includes(origin) ||
        (!config.isProd && origin === "null");             // page opened straight from a file (dev only)
      callback(null, allowed);
    }
  }));

  app.use(express.json({ limit: "10kb" }));

  // Rate limits: how many requests one visitor may make
  app.use("/api", limiter({ windowMs: 60 * 1000, limit: 120 }));
  app.use(["/api/auth/login", "/api/auth/register"], limiter({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true     // only failed attempts count
  }));

  // ---- API routes ----
  app.get("/api/health", (req, res) => {
    db.prepare("SELECT 1").get();    // proves the database answers
    res.json({ ok: true, uptimeSeconds: Math.round(process.uptime()), time: new Date().toISOString() });
  });

  app.use("/api", require("./routes/weather"));
  app.use("/api/auth", require("./routes/auth"));
  app.use("/api/places", require("./routes/places"));
  app.use("/api/recents", require("./routes/recents"));
  app.use("/api/settings", require("./routes/settings"));
  app.use("/api/alerts", require("./routes/alerts"));
  app.use("/api/notifications", require("./routes/notifications"));

  app.use("/api", notFound);

  // ---- The PetalCast website itself ----
  app.use(express.static(path.join(__dirname, "..", "public"), { index: "weather.html" }));

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
