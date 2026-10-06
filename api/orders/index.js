const { getSql, cors, send, normalize, makeId, requireKitchenAuth } = require("../_lib");
const { notifyOwner } = require("../_whatsapp");

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
  return now >= (17 * 60 + 30) && now <= (23 * 60 + 45);
}

function selectFields() {
  return `
    id,
    number,
    status,
    printed,
    created_at AS "createdAt",
    cart,
    delivery,
    payment,
    notes,
    total,
    customer_phone AS "customerPhone",
    whatsapp_message_id AS "whatsappMessageId",
    whatsapp_status AS "whatsappStatus",
    whatsapp_delivered_at AS "whatsappDeliveredAt",
    whatsapp_customer_preparing_sent AS "whatsappCustomerPreparingSent",
    whatsapp_customer_ready_sent AS "whatsappCustomerReadySent"
  `;
}

module.exports = async function handler(req, res) {
  cors(res);

  if (req.method === "OPTIONS") return res.status(204).end();

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
          total,
          customer_phone AS "customerPhone",
          whatsapp_message_id AS "whatsappMessageId",
          whatsapp_status AS "whatsappStatus",
          whatsapp_delivered_at AS "whatsappDeliveredAt",
          whatsapp_customer_preparing_sent AS "whatsappCustomerPreparingSent",
          whatsapp_customer_ready_sent AS "whatsappCustomerReadySent"
        FROM orders
        ORDER BY created_at DESC
        LIMIT 100
      `;

      return send(res, 200, rows);
    }

    if (req.method === "POST") {
      const settingsRows = await sql`
        SELECT mode
        FROM store_settings
        WHERE id = 1
        LIMIT 1
      `;

      const mode = String(settingsRows[0]?.mode || "auto");
      const open = mode === "open"
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

      const data = normalize(req.body || {});

      if (!data.cart.length) {
        return send(res, 400, { error: "Pedido vazio" });
      }

      const unavailableRows = await sql`
        SELECT item_key
        FROM menu_availability
        WHERE available = FALSE
          AND item_key = ANY(${data.cart.map(item => item.name)}::text[])
      `;
      if (unavailableRows.length) {
        return send(res, 409, {
          error: "Um ou mais itens escolhidos ficaram indisponíveis.",
          unavailableItems: unavailableRows.map(row => row.item_key)
        });
      }

      if (!data.customerPhone) {
        return send(res, 400, {
          error: "Informe seu WhatsApp para receber as atualizações do pedido."
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
          total,
          customer_phone,
          whatsapp_status
        )
        VALUES (
          ${id},
          ${number},
          'awaiting_whatsapp',
          false,
          ${JSON.stringify(data.cart)}::jsonb,
          ${JSON.stringify(data.delivery)}::jsonb,
          ${data.payment},
          ${data.notes},
          ${data.total},
          ${data.customerPhone},
          'pending'
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
          total,
          customer_phone AS "customerPhone",
          whatsapp_message_id AS "whatsappMessageId",
          whatsapp_status AS "whatsappStatus",
          whatsapp_delivered_at AS "whatsappDeliveredAt"
      `;

      const order = rows[0];

      try {
        const wa = await notifyOwner(order);

        if (wa.configured && wa.id) {
          const updated = await sql`
            UPDATE orders
            SET
              whatsapp_message_id = ${wa.id},
              whatsapp_status = 'sent'
            WHERE id = ${id}
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
              total,
              customer_phone AS "customerPhone",
              whatsapp_message_id AS "whatsappMessageId",
              whatsapp_status AS "whatsappStatus",
              whatsapp_delivered_at AS "whatsappDeliveredAt"
          `;
          return send(res, 201, updated[0]);
        }

        return send(res, 201, {
          ...order,
          whatsappStatus: "not_configured",
          whatsappWarning: "WhatsApp Cloud API ainda não está configurada. O pedido ficará aguardando e não será impresso."
        });
      } catch (error) {
        await sql`
          UPDATE orders
          SET whatsapp_status = 'failed'
          WHERE id = ${id}
        `;

        return send(res, 502, {
          error: "Não foi possível enviar o pedido ao WhatsApp da lanchonete.",
          detail: error.message,
          orderNumber: number
        });
      }
    }

    return send(res, 405, { error: "Método não permitido" });
  } catch (error) {
    console.error(error);
    return send(res, 500, {
      error: "Erro interno",
      detail: error.message
    });
  }
};
