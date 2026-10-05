const {
  cors,
  send,
  KITCHEN_PASSWORD,
  setSessionCookie,
  clearSessionCookie,
  isValidSession
} = require("./_lib");

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET") {
    return send(res, isValidSession(req) ? 200 : 401, {
      ok: isValidSession(req)
    });
  }

  if (req.method === "POST") {
    let body = req.body || {};
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }

    const password = String(body.password || "");
    if (password !== KITCHEN_PASSWORD) {
      return send(res, 401, { error: "Senha incorreta" });
    }

    setSessionCookie(res);
    return send(res, 200, { ok: true });
  }

  if (req.method === "DELETE") {
    clearSessionCookie(res);
    return send(res, 200, { ok: true });
  }

  return send(res, 405, { error: "Método não permitido" });
};
