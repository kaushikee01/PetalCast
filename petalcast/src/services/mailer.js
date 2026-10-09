// Optional email. If SMTP_HOST isn't set in .env, nothing is sent and alerts
// only appear as in-app notifications.
const config = require("../config");

let transporter = null;

function getTransporter() {
  if (!config.smtp.host) return null;
  if (!transporter) {
    const nodemailer = require("nodemailer");   // loaded only when needed
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined
    });
  }
  return transporter;
}

async function sendMail(to, subject, text) {
  const t = getTransporter();
  if (!t) return false;
  try {
    await t.sendMail({ from: config.smtp.from, to, subject, text });
    return true;
  } catch (err) {
    console.error("[mail] couldn't send:", err.message);   // never crash because of email
    return false;
  }
}

module.exports = { sendMail };
