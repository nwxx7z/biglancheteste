const { getSql, cors, send } = require("../_lib");

module.exports = async function handler(req, res) {
  cors(res);

  try {
    if (req.method === "GET") {
      const mode = String(req.query["hub.mode"] || "");
      const token = String(req.query["hub.verify_token"] || "");
      const challenge = String(req.query["hub.challenge"] || "");
      const expected = String(process.env.WHATSAPP_VERIFY_TOKEN || "");

      if (mode === "subscribe" && expected && token === expected) {
        return res.status(200).send(challenge);
      }

      return res.status(403).send("Forbidden");
    }

    if (req.method !== "POST") {
      return send(res, 405, { error: "Método não permitido" });
    }

    const body = req.body || {};
    const sql = getSql();
    let processed = 0;

    for (const entry of Array.isArray(body.entry) ? body.entry : []) {
      for (const change of Array.isArray(entry.changes) ? entry.changes : []) {
        const value = change?.value || {};
        const metadataPhoneId = String(value?.metadata?.phone_number_id || "");

        if (
          process.env.WHATSAPP_PHONE_NUMBER_ID &&
          metadataPhoneId &&
          metadataPhoneId !== String(process.env.WHATSAPP_PHONE_NUMBER_ID)
        ) {
          continue;
        }

        for (const item of Array.isArray(value.statuses) ? value.statuses : []) {
          const messageId = String(item?.id || "");
          const status = String(item?.status || "").toLowerCase();

          if (!messageId || !status) continue;

          const deliveredAt = ["delivered", "read"].includes(status)
            ? new Date()
            : null;

          const rows = await sql`
            UPDATE orders
            SET
              whatsapp_status = ${status},
              whatsapp_delivered_at = COALESCE(${deliveredAt}, whatsapp_delivered_at),
              status = CASE
                WHEN ${status} IN ('delivered', 'read')
                  AND status = 'awaiting_whatsapp'
                THEN 'new'
                ELSE status
              END
            WHERE whatsapp_message_id = ${messageId}
            RETURNING id
          `;

          if (rows.length) processed++;
        }
      }
    }

    return send(res, 200, { ok: true, processed });
  } catch (error) {
    console.error(error);
    // Webhooks devem receber 2xx quando o payload foi aceito; erros internos
    // ficam registrados para diagnóstico e a Meta poderá reenviar quando necessário.
    return send(res, 500, { error: "Erro interno" });
  }
};
