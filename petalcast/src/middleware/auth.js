// Login tokens (JWT). The browser sends:  Authorization: Bearer <token>
const jwt = require("jsonwebtoken");
const config = require("../config");
const db = require("../db");
const { HttpError } = require("./errors");

function signToken(user) {
  return jwt.sign({ sub: String(user.id) }, config.jwtSecret, {
    algorithm: "HS256",
    expiresIn: config.jwtExpires
  });
}

const findUser = db.prepare("SELECT id, email FROM users WHERE id = ?");

function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization || "").split(" ");
  if (scheme !== "Bearer" || !token) {
    return next(new HttpError(401, "Please log in to do that."));
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] });
    const user = findUser.get(Number(payload.sub));
    if (!user) throw new Error("user gone");
    req.user = user;
    next();
  } catch (err) {
    next(new HttpError(401, "Your session has expired. Please log in again."));
  }
}

module.exports = { signToken, requireAuth };
