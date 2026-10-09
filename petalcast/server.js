// Start here:  npm start
const config = require("./src/config");
const db = require("./src/db");
const { createApp } = require("./src/app");
const { startAlertJob } = require("./src/jobs/alertChecker");

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`PetalCast is running at http://localhost:${config.port}  (${config.nodeEnv})`);
});

const alertJob = startAlertJob();

// Shut down cleanly when you press Ctrl+C or the host stops the app
function shutdown() {
  console.log("\nShutting down...");
  if (alertJob) alertJob.stop();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();   // force quit if something hangs
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
