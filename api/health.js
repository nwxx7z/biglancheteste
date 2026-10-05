const { cors, send } = require("./_lib");
module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  return send(res, 200, { ok: true });
};
