const { getSql, cors, send, requireKitchenAuth } = require("./_lib");

const CATALOG = [
  ["Hambúrgueres artesanais", ["SPAS12","AUG","PARAFAL","SKS","LANÇA GRANADAS","SVD","K98","VECTOR","THOMPSON","CARAPINA","MAG-7","MAC-10","BIZON","G-36","AN-94","M500"]],
  ["Hambúrgueres tradicionais", ["BIG LANCHE","MP5","UMP","VSS","SCAR","XM8","P90","AK-47","M4A1","AWM","MP40","FAMAS","M60"]],
  ["Cachorro quente", ["Cachorro quente de carne","Cachorro quente de frango","Cachorro quente misto"]],
  ["Combos", ["Combo petiscos","Combo hambúrguer","Combo 03"]],
  ["Petiscos e acompanhamentos", ["Batatas fritas 250g","Batata gourmet de calabresa","Batata gourmet de strogonoff","Batata gourmet de carne de sol","Filé com fritas"]],
  ["Espetinhos", ["Espetinho de carne","Espetinho de frango"]],
  ["Bebidas", ["Coca cola Júnior","Água mineral sem gás 500ml","Água mineral com gás 500ml","Guaraná júnior","Refrigerante 1L","Refrigerante 2L","Refrigerante lata","Suco sem leite 500ml","H2O","Suco com leite 500ml","Suco de laranja natural 500ml","Vitamina de açaí","Vitamina de guaraná","Milkshake"]],
  ["Tapiocas", ["Tapioca de carne de sol com queijo","Tapioca de camarão","Tapioca de frango com queijo","Tapioca de presunto e queijo","Tapioca de muçarela","Tapioca de queijo coalho","Tapioca de coco","Tapioca de coco e queijo","Tapioca de coco com leite condensado","Tapioca romeu e julieta","Tapioca de Nutella","Tapioca de banana com queijo"]],
  ["Mini pizzas", ["Mini pizza de muçarela","Mini pizza de calabresa","Mini pizza de frango com catupiry","Mini pizza de carne de sol","Mini pizza 3 queijos","Mini pizza mista"]],
  ["Pastéis", ["Pastel de queijo","Pastel misto completo","Pastel de frango completo","Pastel de carne de sol completo","Pastel de carne moída completo","Pastel de frango com carne moída completo","Pastel de pizza","Pastel de carne moída com carne de sol completo","Pastel de frango com carne de sol completo","Pastel de camarão completo","Pastel de Nutella","Pastel mistão"]]
];

function catalogRows() {
  return CATALOG.flatMap(([category, items]) =>
    items.map(name => ({ key: name, name, category }))
  );
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const sql = getSql();

    await sql`
      CREATE TABLE IF NOT EXISTS menu_availability (
        item_key TEXT PRIMARY KEY,
        category TEXT NOT NULL DEFAULT '',
        available BOOLEAN NOT NULL DEFAULT TRUE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    const catalog = catalogRows();

    for (const item of catalog) {
      await sql`
        INSERT INTO menu_availability (item_key, category, available)
        VALUES (${item.key}, ${item.category}, TRUE)
        ON CONFLICT (item_key) DO NOTHING
      `;
    }

    if (req.method === "GET") {
      const rows = await sql`
        SELECT item_key AS "key", category, available, updated_at AS "updatedAt"
        FROM menu_availability
        ORDER BY category, item_key
      `;
      return send(res, 200, { items: rows });
    }

    if (req.method !== "PATCH") {
      return send(res, 405, { error: "Método não permitido" });
    }

    if (!requireKitchenAuth(req, res)) return;

    const key = String(req.body?.key || "").trim();
    const available = req.body?.available;

    if (!key || typeof available !== "boolean") {
      return send(res, 400, { error: "Informe item_key e available." });
    }

    const known = catalog.find(x => x.key === key);
    if (!known) return send(res, 404, { error: "Item não encontrado no cardápio." });

    const rows = await sql`
      UPDATE menu_availability
      SET available = ${available}, updated_at = NOW()
      WHERE item_key = ${key}
      RETURNING item_key AS "key", category, available, updated_at AS "updatedAt"
    `;

    return send(res, 200, rows[0]);
  } catch (error) {
    console.error(error);
    return send(res, 500, { error: "Erro interno", detail: error.message });
  }
};
