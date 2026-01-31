import { sb } from "./supabaseClient.js";

const board = document.getElementById("board");
const updated = document.getElementById("updated");

(async function main() {
  try {
    board.innerHTML = `<div class="small" style="opacity:.8">Cargando…</div>`;
    updated.textContent = "";

    const { data, error } = await sb
      .from("public_leaderboard_cache")
      .select("display_name, points_total, exact_count, updated_at")
      .order("points_total", { ascending: false })
      .order("exact_count", { ascending: false })
      .order("display_name", { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      board.innerHTML = `<div class="small">Aún no hay datos en el ranking.</div>`;
      return;
    }

    board.innerHTML = renderTable(data);

    // mostrar fecha última actualización (tomamos la más reciente)
    const last = data
      .map(r => r.updated_at)
      .filter(Boolean)
      .sort()
      .pop();

    if (last) {
      const dt = new Date(last).toLocaleString("es-CO", { timeZone: "America/Bogota" });
      updated.textContent = `Actualizado: ${dt}`;
    }
  } catch (e) {
    const msg = e?.message ?? String(e);
    board.innerHTML = `<div class="small" style="color:#ffb3b3">${escapeHtml(msg)}</div>`;
    console.error(e);
  }
})();

function renderTable(rows) {
  const header = `
    <div class="row" style="font-weight:700; opacity:.9; padding:8px 0; border-bottom:1px solid rgba(255,255,255,.12)">
      <div style="flex:1">Jugador</div>
      <div style="width:110px; text-align:right">Puntos</div>
      <div style="width:110px; text-align:right">Exactos</div>
    </div>
  `;

  const body = rows
    .map((r, i) => `
      <div class="row" style="padding:10px 0; border-bottom:1px solid rgba(255,255,255,.08)">
        <div style="flex:1">${i + 1}. ${escapeHtml(r.display_name || "Jugador")}</div>
        <div style="width:110px; text-align:right">${r.points_total ?? 0}</div>
        <div style="width:110px; text-align:right">${r.exact_count ?? 0}</div>
      </div>
    `)
    .join("");

  return `<div class="card" style="padding:12px">${header}${body}</div>`;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
