// Sign up, log in, who am I, delete my account.
const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const v = require("../validate");
const { signToken, requireAuth } = require("../middleware/auth");
const { asyncHandler, HttpError } = require("../middleware/errors");

const router = express.Router();
const BCRYPT_ROUNDS = 12;

// Used so a wrong email takes as long to reject as a wrong password
// (stops people from guessing which emails have accounts by timing).
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS);

const findByEmail = db.prepare("SELECT * FROM users WHERE email = ?");
const insertUser = db.prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)");
const insertSettings = db.prepare("INSERT INTO settings (user_id) VALUES (?)");

// POST /api/auth/register   { "email": "...", "password": "..." }
router.post("/register", asyncHandler(async (req, res) => {
  const email = v.email(req.body.email);
  const password = v.password(req.body.password);

  if (findByEmail.get(email)) {
    throw new HttpError(409, "An account with this email already exists.");
  }

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);   // never store the real password
  const create = db.transaction(() => {
    const id = insertUser.run(email, hash).lastInsertRowid;
    insertSettings.run(id);
    return Number(id);
  });
  const id = create();

  const user = { id, email };
  res.status(201).json({ token: signToken(user), user });
}));

// POST /api/auth/login   { "email": "...", "password": "..." }
router.post("/login", asyncHandler(async (req, res) => {
  const email = v.email(req.body.email);
  const password = typeof req.body.password === "string" ? req.body.password : "";

  const row = findByEmail.get(email);
  const ok = await bcrypt.compare(password, row ? row.password_hash : DUMMY_HASH);
  if (!row || !ok) throw new HttpError(401, "Incorrect email or password.");

  const user = { id: row.id, email: row.email };
  res.json({ token: signToken(user), user });
}));

// GET /api/auth/me
router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// DELETE /api/auth/me   { "password": "..." }   removes the account and all its data
router.delete("/me", requireAuth, asyncHandler(async (req, res) => {
  const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(req.user.id);
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!(await bcrypt.compare(password, row.password_hash))) {
    throw new HttpError(401, "Incorrect password.");
  }
  db.prepare("DELETE FROM users WHERE id = ?").run(req.user.id);   // cascades to everything else
  res.status(204).end();
}));

module.exports = router;
