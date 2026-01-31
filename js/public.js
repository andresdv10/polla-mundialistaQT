import { sb } from "./supabaseClient.js";

const $ = (id) => document.getElementById(id);

const board = $("board");
const updated = $("updated");

(async function main() {
  try {
    await loadBoard();
  } catch (e) {
    showError(e);
  }
})();

async function loadBoard() {
  updated.textContent = "";
  updated.style.color = "";
  board.innerHTML = `<div class="small" style="opacity:.8">Cargando…</div>`;

  const { data, error } = await sb
    .from("public_leaderboard_cache")
    .select("display_name, points_total, exact_count, result_count, updated_at")
    .order("points_total", { ascending: false })
    .order("exact_count", { ascending: false })
    .order("display_name", { ascending: true });

  if (error) throw error;

  if (!data || data.length === 0) {
    board.innerHTML = `<div class="small">Aún no hay datos. Cuando el admin cargue resultados y haga refresh, aparecerá aquí.</div>`;
    return;
  }

  // timestamp (toma el mayor updated_at que venga)
  const latest = data
    .map(r => r.updated_at)
    .filter(Boolean)
    .map(t => new Date(t))
    .sort((a,b) => b - a)[0];

  if (latest) {
    updated.textContent =
      "Actualizado: " +
      latest.toLocaleString("es-CO", { timeZone: "America/Bogota" });
  }

  board.innerHTML = renderTable(data);
}

function renderTable(rows) {
  const header = `
    <div class="row small" style="justify-content:space-between; opacity:.85; margin-top:8px">
      <span style="flex:2"><strong>Jugador</strong></span>
      <span style="width:70px; text-align:right"><strong>Puntos</strong></span>
      <span style="width:80px; text-align:right"><strong>Exactos</strong></span>
    </div>
    <div style="height:8px"></div>
  `;

  const items = rows
    .map((r, idx) => {
      const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "";
      return `
        <div class="card" style="margin-top:10px">
          <div class="row" style="justify-content:space-between; align-items:center">
            <div style="flex:2"><strong>${medal} ${escapeHtml(r.display_name)}</strong></div>
            <div style="width:70px; text-align:right">${r.points_total ?? 0}</div>
            <div style="width:80px; text-align:right">${r.exact_count ?? 0}</div>
          </div>
        </div>
      `;
    })
    .join("");

  return header + items;
}

function showError(e) {
  const msg = e?.message ?? String(e);
  updated.textContent = msg;
  updated.style.color = "#ffb3b3";
  board.innerHTML = "";
  console.error(e);
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
