const { neon } = require("@neondatabase/serverless");
const crypto = require("crypto");

// ===================== SENHA DA COZINHA =====================
// ALTERE SOMENTE A LINHA ABAIXO para trocar a senha.
const KITCHEN_PASSWORD = "BIGLANCHE123";
const KITCHEN_SESSION_MAX_AGE = 60 * 60 * 8; // 8 horas
const SESSION_COOKIE = "kitchen_session";

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada");
  return neon(url);
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS,DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
}

function send(res, status, data) {
  cors(res);
  res.status(status).json(data);
}

function parseCookies(req) {
  const header = String(req.headers?.cookie || "");
  const out = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function makeSessionToken() {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = String(issuedAt);
  const signature = crypto
    .createHmac("sha256", KITCHEN_PASSWORD)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function isValidSession(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return false;

  const [issuedAtText, signature] = String(token).split(".");
  const issuedAt = Number(issuedAtText);
  if (!Number.isFinite(issuedAt) || !signature) return false;

  const age = Math.floor(Date.now() / 1000) - issuedAt;
  if (age < 0 || age > KITCHEN_SESSION_MAX_AGE) return false;

  const expected = crypto
    .createHmac("sha256", KITCHEN_PASSWORD)
    .update(String(issuedAt))
    .digest("base64url");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

function setSessionCookie(res) {
  const token = makeSessionToken();
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${KITCHEN_SESSION_MAX_AGE}`
  );
}

function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
  );
}

function requireKitchenAuth(req, res) {
  if (isValidSession(req)) return true;
  send(res, 401, { error: "Autenticação necessária" });
  return false;
}

function normalize(x = {}) {
  if (typeof x === "string") {
    try { x = JSON.parse(x); } catch { x = {}; }
  }
  if (Buffer.isBuffer(x)) {
    try { x = JSON.parse(x.toString("utf8")); } catch { x = {}; }
  }
  if (!x || typeof x !== "object") x = {};
  return {
    cart: (Array.isArray(x.cart) ? x.cart : []).slice(0, 50).map(i => ({
      name: String(i.name || "Item").slice(0, 120),
      quantity: Math.max(1, Math.min(999, Number(i.quantity) || 1)),
      price: Math.max(0, Number(i.price) || 0),
      note: String(i.note || "").slice(0, 300),
      additions: (Array.isArray(i.additions) ? i.additions : []).slice(0, 30).map(a => ({
        name: String(a.name || "").slice(0, 100),
        price: Math.max(0, Number(a.price) || 0),
        quantity: Math.max(1, Math.min(99, Number(a.quantity) || 1))
      }))
    })),
    delivery: {
      city: String(x.delivery?.city || "").slice(0, 80),
      fee: Math.max(0, Number(x.delivery?.fee) || 0),
      address: String(x.delivery?.address || "").slice(0, 500)
    },
    payment: String(x.payment || "").slice(0, 80),
    notes: String(x.notes || "").slice(0, 1000),
    total: Math.max(0, Number(x.total) || 0)
  };
}

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

module.exports = {
  getSql,
  cors,
  send,
  normalize,
  makeId,
  KITCHEN_PASSWORD,
  setSessionCookie,
  clearSessionCookie,
  isValidSession,
  requireKitchenAuth
};
