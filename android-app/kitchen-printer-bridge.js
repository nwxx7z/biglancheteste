/* Cole este arquivo no /kitchen, depois do seu JS principal. */
(() => {
  const KEY = "biglanche_printed_orders_v1";
  const printed = new Set(JSON.parse(localStorage.getItem(KEY) || "[]"));
  const save = () => localStorage.setItem(KEY, JSON.stringify([...printed].slice(-200)));

  window.imprimirNoAndroid = (order) => {
    if (!window.BIGLANCHE_ANDROID_PRINTER || !window.bigLanchePrint) return false;
    window.bigLanchePrint(order);
    return true;
  };

  async function verificarPedidosParaImpressao() {
    if (!window.BIGLANCHE_ANDROID_PRINTER) return;
    try {
      const r = await fetch("/api/orders", { credentials: "include" });
      if (!r.ok) return;
      const data = await r.json();
      const orders = Array.isArray(data) ? data : (data.orders || []);
      for (const order of orders) {
        const id = String(order.id ?? order.orderId ?? "");
        if (!id || printed.has(id)) continue;

        // Se o seu backend usa outro status para pedido novo, ajuste aqui.
        const status = String(order.status ?? "pending").toLowerCase();
        if (["pending","new","novo","received"].includes(status)) {
          imprimirNoAndroid(order);
          printed.add(id);
        }
      }
      save();
    } catch (_) {}
  }

  setTimeout(verificarPedidosParaImpressao, 2500);
  setInterval(verificarPedidosParaImpressao, 5000);
})();
