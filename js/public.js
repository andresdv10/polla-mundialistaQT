import { sb } from "./supabaseClient.js";

const board = document.getElementById("board");
const updated = document.getElementById("updated");

(async function main() {
  try {
    await refresh();
    // refresca cada 30s
    setInterval(refresh, 30000);
  } catch (e) {
    showError(e);
  }
})();

async function refresh() {
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

  board.innerHTML = `
    <div class="card" style="margin-top:10px">
      ${data.map((r, i) => rowHtml(i + 1, r)).join("")}
    </div>
  `;

  const last = data[0]?.updated_at;
  if (last) {
    updated.textContent =
      "Última actualización: " +
      new Date(last).toLocaleString("es-CO", { timeZone: "America/Bogota" });
  }
}

function rowHtml(pos, r) {
  return `
    <div class="row" style="justify-content:space-between; padding:8px 0; border-bottom:1px solid rgba(255,255,255,.08)">
      <div><strong>#${pos}</strong> ${escapeHtml(r.display_name || "Jugador")}</div>
      <div class="row" style="gap:10px">
        <span class="badge">${r.points_total ?? 0} pts</span>
        <span class="badge">${r.exact_count ?? 0} exactos</span>
      </div>
    </div>
  `;
}

function showError(e) {
  const msg = e?.message ?? String(e);
  board.innerHTML = `<div class="small" style="color:#ffb3b3">${escapeHtml(msg)}</div>`;
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
