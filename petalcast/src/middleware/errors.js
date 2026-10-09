// One place that turns problems into clean JSON answers: { "error": { "message": "..." } }

class HttpError extends Error {
  constructor(status, message, { expose } = {}) {
    super(message);
    this.status = status;
    // Messages for 4xx errors are safe to show. 5xx messages are hidden unless we say so.
    this.expose = expose !== undefined ? expose : status < 500;
  }
}

// Lets route functions use async/await without try/catch everywhere
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function notFound(req, res) {
  res.status(404).json({ error: { message: "That endpoint doesn't exist." } });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: { message: "The request body isn't valid JSON." } });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: { message: "The request body is too large." } });
  }

  const status = err.status || 500;
  const expose = err.expose !== undefined ? err.expose : status < 500;
  if (status >= 500) console.error("[error]", err);

  res.status(status).json({
    error: { message: expose ? err.message : "Something went wrong on our side. Please try again." }
  });
}

module.exports = { HttpError, asyncHandler, notFound, errorHandler };
