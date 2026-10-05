const GRAPH_VERSION = String(process.env.WHATSAPP_GRAPH_VERSION || "v23.0").replace(/^v?/i, "v");
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

function configured() {
  return !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

function normalizePhone(value) {
  let p = String(value || "").replace(/\D/g, "");
  if (!p) return "";
  if (!p.startsWith("55") && (p.length === 10 || p.length === 11)) p = "55" + p;
  return p.slice(0, 20);
}

async function sendText(to, text) {
  if (!configured()) {
    return { configured: false, id: "", status: "not_configured" };
  }

  const recipient = normalizePhone(to);
  if (!recipient) throw new Error("Número de WhatsApp inválido");

  const response = await fetch(`${GRAPH_BASE}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipient,
      type: "text",
      text: { preview_url: false, body: String(text || "").slice(0, 4096) }
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.error?.message || data?.error?.error_data?.details || `HTTP ${response.status}`;
    throw new Error(`WhatsApp API: ${detail}`);
  }

  return {
    configured: true,
    id: data?.messages?.[0]?.id || "",
    status: "sent",
    raw: data
  };
}

function ownerNumber() {
  return normalizePhone(process.env.WHATSAPP_OWNER_NUMBER || "");
}

function ownerMessage(order) {
  const lines = [
    "🍔 *NOVO PEDIDO — BIG LANCHE*",
    `Pedido #${order.number}`,
    "",
    ...(Array.isArray(order.cart) ? order.cart.map(item => {
      const adds = Array.isArray(item.additions) && item.additions.length
        ? " | " + item.additions.map(a => `+${a.quantity || 1}x ${a.name}`).join(", ")
        : "";
      const note = item.note ? ` | Obs: ${item.note}` : "";
      return `• ${item.quantity}x ${item.name}${adds}${note}`;
    }) : []),
    "",
    `📍 Entrega: ${order.delivery?.city || ""}`,
    `🏠 Endereço: ${order.delivery?.address || ""}`,
    `💳 Pagamento: ${order.payment || ""}`,
    `💰 Total: R$ ${Number(order.total || 0).toFixed(2).replace(".", ",")}`,
    order.notes ? `📝 Observação: ${order.notes}` : "",
    "",
    "O pedido só será impresso quando o WhatsApp confirmar a entrega desta mensagem."
  ];
  return lines.filter(Boolean).join("\n");
}

async function notifyOwner(order) {
  const to = ownerNumber();
  if (!configured() || !to) {
    return { configured: false, id: "", status: "not_configured" };
  }
  return sendText(to, ownerMessage(order));
}

async function notifyCustomer(order, stage) {
  const to = normalizePhone(order.customer_phone || order.customerPhone);
  if (!to || !configured()) return { configured: false, id: "", status: "not_configured" };

  const text = stage === "preparing"
    ? `🍔 BIG LANCHE\n\nSeu pedido #${order.number} já está em preparo! Em breve avisaremos quando estiver pronto. 😊`
    : `🍔 BIG LANCHE\n\nSeu pedido #${order.number} está pronto e já saiu para entrega! 🛵\n\nObrigado pela preferência! ❤️`;

  return sendText(to, text);
}

module.exports = {
  configured,
  normalizePhone,
  sendText,
  ownerNumber,
  notifyOwner,
  notifyCustomer
};
