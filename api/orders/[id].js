const { getSql, cors, send, requireKitchenAuth } = require("../_lib");

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (!["PATCH", "DELETE"].includes(req.method)) return send(res, 405, { error: "Método não permitido" });
    if (!requireKitchenAuth(req, res)) return;
    const id = String(req.query.id || "");
    if (!id) return send(res, 400, { error: "ID ausente" });

    // Exclusão individual do pedido, sempre protegida pela autenticação da cozinha.
    if (req.method === "DELETE") {
      const sql = getSql();
      const rows = await sql`
        DELETE FROM orders
        WHERE id = ${id}
        RETURNING id, number
      `;
      if (!rows.length) return send(res, 404, { error: "Pedido não encontrado" });
      return send(res, 200, { ok: true, id: rows[0].id, number: rows[0].number });
    }

    const status = String(req.body?.status || "");
    const allowed = ["new", "preparing", "ready", "cancelled", "printed"];
    if (!allowed.includes(status)) return send(res, 400, { error: "Status inválido" });

    const sql = getSql();
    const printed = status === "printed";
    const rows = await sql`
      UPDATE orders
      SET status = ${status}, printed = CASE WHEN ${printed} THEN true ELSE printed END
      WHERE id = ${id}
      RETURNING
        id, number, status, printed,
        created_at AS "createdAt",
        cart, delivery, payment, notes, total
    `;
    if (!rows.length) return send(res, 404, { error: "Pedido não encontrado" });
    return send(res, 200, rows[0]);
  } catch (error) {
    console.error(error);
    return send(res, 500, { error: "Erro interno", detail: error.message });
  }
};
