const { getSql, cors, send, requireKitchenAuth } = require("../_lib");
const { notifyCustomer } = require("../_whatsapp");

async function getOrder(sql, id) {
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
    WHERE id = ${id}
    LIMIT 1
  `;
  return rows[0] || null;
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (!["PATCH", "DELETE"].includes(req.method)) {
      return send(res, 405, { error: "Método não permitido" });
    }

    if (!requireKitchenAuth(req, res)) return;

    const id = String(req.query.id || "");
    if (!id) return send(res, 400, { error: "ID ausente" });

    const sql = getSql();

    if (req.method === "DELETE") {
      const rows = await sql`
        DELETE FROM orders
        WHERE id = ${id}
        RETURNING id, number
      `;
      if (!rows.length) return send(res, 404, { error: "Pedido não encontrado" });
      return send(res, 200, {
        ok: true,
        id: rows[0].id,
        number: rows[0].number
      });
    }

    const current = await getOrder(sql, id);
    if (!current) return send(res, 404, { error: "Pedido não encontrado" });

    const status = String(req.body?.status || "");
    const allowed = ["awaiting_whatsapp", "new", "preparing", "ready", "cancelled", "printed"];
    if (!allowed.includes(status)) {
      return send(res, 400, { error: "Status inválido" });
    }

    if (status === "printed" && !["delivered", "read"].includes(String(current.whatsappStatus || ""))) {
      return send(res, 409, {
        error: "O pedido só pode ser impresso depois que o WhatsApp confirmar a entrega da mensagem ao dono.",
        whatsappStatus: current.whatsappStatus || "pending"
      });
    }

    if (status === "preparing" && current.status !== "preparing" && !current.whatsappCustomerPreparingSent) {
      try {
        const wa = await notifyCustomer(current, "preparing");
        if (!wa.configured || !wa.id) {
          return send(res, 503, {
            error: "WhatsApp do cliente não está configurado. O pedido não foi colocado em preparo.",
            detail: "Configure WHATSAPP_ACCESS_TOKEN e WHATSAPP_PHONE_NUMBER_ID."
          });
        }

        const rows = await sql`
          UPDATE orders
          SET
            status = 'preparing',
            whatsapp_customer_preparing_sent = true
          WHERE id = ${id}
          RETURNING
            id, number, status, printed,
            created_at AS "createdAt",
            cart, delivery, payment, notes, total,
            customer_phone AS "customerPhone",
            whatsapp_message_id AS "whatsappMessageId",
            whatsapp_status AS "whatsappStatus",
            whatsapp_delivered_at AS "whatsappDeliveredAt",
            whatsapp_customer_preparing_sent AS "whatsappCustomerPreparingSent",
            whatsapp_customer_ready_sent AS "whatsappCustomerReadySent"
        `;
        return send(res, 200, rows[0]);
      } catch (error) {
        return send(res, 502, {
          error: "Não foi possível avisar o cliente que o pedido está em preparo.",
          detail: error.message
        });
      }
    }

    if (status === "ready" && current.status !== "ready" && !current.whatsappCustomerReadySent) {
      try {
        const wa = await notifyCustomer(current, "ready");
        if (!wa.configured || !wa.id) {
          return send(res, 503, {
            error: "WhatsApp do cliente não está configurado. O pedido não foi marcado como pronto.",
            detail: "Configure WHATSAPP_ACCESS_TOKEN e WHATSAPP_PHONE_NUMBER_ID."
          });
        }

        const rows = await sql`
          UPDATE orders
          SET
            status = 'ready',
            whatsapp_customer_ready_sent = true
          WHERE id = ${id}
          RETURNING
            id, number, status, printed,
            created_at AS "createdAt",
            cart, delivery, payment, notes, total,
            customer_phone AS "customerPhone",
            whatsapp_message_id AS "whatsappMessageId",
            whatsapp_status AS "whatsappStatus",
            whatsapp_delivered_at AS "whatsappDeliveredAt",
            whatsapp_customer_preparing_sent AS "whatsappCustomerPreparingSent",
            whatsapp_customer_ready_sent AS "whatsappCustomerReadySent"
        `;
        return send(res, 200, rows[0]);
      } catch (error) {
        return send(res, 502, {
          error: "Não foi possível avisar o cliente que o pedido está pronto.",
          detail: error.message
        });
      }
    }

    const printed = status === "printed";
    const rows = await sql`
      UPDATE orders
      SET
        status = ${status},
        printed = CASE WHEN ${printed} THEN true ELSE printed END
      WHERE id = ${id}
      RETURNING
        id, number, status, printed,
        created_at AS "createdAt",
        cart, delivery, payment, notes, total,
        customer_phone AS "customerPhone",
        whatsapp_message_id AS "whatsappMessageId",
        whatsapp_status AS "whatsappStatus",
        whatsapp_delivered_at AS "whatsappDeliveredAt",
        whatsapp_customer_preparing_sent AS "whatsappCustomerPreparingSent",
        whatsapp_customer_ready_sent AS "whatsappCustomerReadySent"
    `;

    return send(res, 200, rows[0]);
  } catch (error) {
    console.error(error);
    return send(res, 500, {
      error: "Erro interno",
      detail: error.message
    });
  }
};
