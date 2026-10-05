const { getSql, cors, send, normalize, makeId, requireKitchenAuth } = require("../_lib");

function brasiliaMinutes() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date());

  const h = Number(parts.find(p => p.type === "hour")?.value || 0);
  const m = Number(parts.find(p => p.type === "minute")?.value || 0);

  return h * 60 + m;
}

function automaticOpen() {
  const now = brasiliaMinutes();

  // Horário automático oficial da loja: 17:30 até 23:45 (Brasília).
  return now >= (17 * 60 + 30) &&
         now <= (23 * 60 + 45);
}

module.exports = async function handler(req, res) {
  cors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    const sql = getSql();

    if (req.method === "GET") {
      if (!requireKitchenAuth(req, res)) return;

      const rows = await sql`
        SELECT
          id,
          number,
          status,
          printed,
          created_at AS "createdAt",
          cart,
          delivery,
          payment,
          notes,
          total
        FROM orders
        ORDER BY created_at DESC
        LIMIT 100
      `;

      return send(res, 200, rows);
    }

    if (req.method === "POST") {

      // Verifica se a loja está aberta
      const settingsRows = await sql`
        SELECT mode
        FROM store_settings
        WHERE id = 1
        LIMIT 1
      `;

      const mode = String(settingsRows[0]?.mode || "auto");

      const open =
        mode === "open"
          ? true
          : mode === "closed"
            ? false
            : automaticOpen();

      if (!open) {
        return send(res, 403, {
          error: "Pedidos encerrados",
          mode,
          schedule: {
            start: "17:30",
            end: "23:45",
            timezone: "America/Sao_Paulo"
          }
        });
      }

      // Continua com a criação normal do pedido
      const data = normalize(req.body || {});

      if (!data.cart.length) {
        return send(res, 400, {
          error: "Pedido vazio"
        });
      }

      const numberRows = await sql`
        SELECT COALESCE(MAX(number), 1000) + 1 AS next_number
        FROM orders
      `;

      const number = Number(numberRows[0].next_number);
      const id = makeId();

      const rows = await sql`
        INSERT INTO orders (
          id,
          number,
          status,
          printed,
          cart,
          delivery,
          payment,
          notes,
          total
        )
        VALUES (
          ${id},
          ${number},
          'new',
          false,
          ${JSON.stringify(data.cart)}::jsonb,
          ${JSON.stringify(data.delivery)}::jsonb,
          ${data.payment},
          ${data.notes},
          ${data.total}
        )
        RETURNING
          id,
          number,
          status,
          printed,
          created_at AS "createdAt",
          cart,
          delivery,
          payment,
          notes,
          total
      `;

      return send(res, 201, rows[0]);
    }

    return send(res, 405, {
      error: "Método não permitido"
    });

  } catch (error) {
    console.error(error);

    return send(res, 500, {
      error: "Erro interno",
      detail: error.message
    });
  }
};
