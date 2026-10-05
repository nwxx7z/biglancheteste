const { getSql, cors, send, requireKitchenAuth } = require("./_lib");

const MODES = new Set(["auto", "automatic", "open", "closed"]);

function normalizeMode(mode) {
  const value = String(mode || "").trim().toLowerCase();

  if (value === "automatic") return "auto";
  if (value === "open") return "open";
  if (value === "closed") return "closed";

  return "auto";
}

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

  // Horário automático:
  // 17:30 até 23:45
  return now >= (17 * 60 + 30) && now <= (23 * 60 + 45);
}

module.exports = async function handler(req, res) {
  cors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    if (req.method === "GET") {
      const sql = getSql();

      const rows = await sql`
        SELECT mode
        FROM store_settings
        WHERE id = 1
        LIMIT 1
      `;

      const rawMode = String(rows[0]?.mode || "auto");
      const mode = normalizeMode(rawMode);

      const open =
        mode === "open"
          ? true
          : mode === "closed"
            ? false
            : automaticOpen();

      return send(res, 200, {
        mode,
        open,
        schedule: {
          start: "17:30",
          end: "23:45",
          timezone: "America/Sao_Paulo"
        }
      });
    }

    if (req.method !== "PATCH") {
      return send(res, 405, {
        error: "Método não permitido"
      });
    }

    if (!requireKitchenAuth(req, res)) {
      return;
    }

    const requestedMode = String(req.body?.mode || "")
      .trim()
      .toLowerCase();

    if (!MODES.has(requestedMode)) {
      return send(res, 400, {
        error: "Modo inválido",
        received: requestedMode,
        allowed: ["auto", "automatic", "open", "closed"]
      });
    }

    const mode = normalizeMode(requestedMode);

    const sql = getSql();

    const rows = await sql`
      INSERT INTO store_settings (
        id,
        mode,
        updated_at
      )
      VALUES (
        1,
        ${mode},
        NOW()
      )
      ON CONFLICT (id)
      DO UPDATE SET
        mode = EXCLUDED.mode,
        updated_at = NOW()
      RETURNING mode
    `;

    const savedMode = normalizeMode(
      String(rows[0]?.mode || mode)
    );

    const open =
      savedMode === "open"
        ? true
        : savedMode === "closed"
          ? false
          : automaticOpen();

    return send(res, 200, {
      mode: savedMode,
      open,
      schedule: {
        start: "17:30",
        end: "23:45",
        timezone: "America/Sao_Paulo"
      }
    });

  } catch (error) {
    console.error(error);

    return send(res, 500, {
      error: "Erro interno",
      detail: error.message
    });
  }
};
