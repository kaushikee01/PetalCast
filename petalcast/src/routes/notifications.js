// The in-app inbox where triggered alerts show up. Login required.
const express = require("express");
const db = require("../db");
const v = require("../validate");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler, HttpError } = require("../middleware/errors");

const router = express.Router();
router.use(requireAuth);

const show = (r) => ({
  id: r.id,
  title: r.title,
  body: r.body,
  read: !!r.is_read,
  createdAt: new Date(r.created_at).toISOString()
});

// GET /api/notifications?unread=1
router.get("/", (req, res) => {
  const onlyUnread = req.query.unread === "1" || req.query.unread === "true";
  const rows = db.prepare(`
    SELECT * FROM notifications
    WHERE user_id = ? ${onlyUnread ? "AND is_read = 0" : ""}
    ORDER BY created_at DESC, id DESC LIMIT 50
  `).all(req.user.id);
  const unreadCount = db.prepare(
    "SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0"
  ).get(req.user.id).n;
  res.json({ unreadCount, notifications: rows.map(show) });
});

// POST /api/notifications/read-all
router.post("/read-all", (req, res) => {
  db.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?").run(req.user.id);
  res.json({ ok: true });
});

// POST /api/notifications/:id/read
router.post("/:id/read", asyncHandler(async (req, res) => {
  const id = v.integer(req.params.id, "id", 1, Number.MAX_SAFE_INTEGER);
  const result = db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?").run(id, req.user.id);
  if (result.changes === 0) throw new HttpError(404, "Notification not found.");
  res.json({ ok: true });
}));

// DELETE /api/notifications/:id
router.delete("/:id", asyncHandler(async (req, res) => {
  const id = v.integer(req.params.id, "id", 1, Number.MAX_SAFE_INTEGER);
  const result = db.prepare("DELETE FROM notifications WHERE id = ? AND user_id = ?").run(id, req.user.id);
  if (result.changes === 0) throw new HttpError(404, "Notification not found.");
  res.status(204).end();
}));

module.exports = router;
