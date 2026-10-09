// Run the alert check one time by hand:  npm run alerts:run
const { runAlertCheck } = require("./alertChecker");

runAlertCheck()
  .then((result) => {
    console.log("Done:", result);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
