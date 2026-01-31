import { sb } from "./supabaseClient.js";

const $ = (id) => document.getElementById(id);

const listDiv = $("publicList");
const note = $("notePublic");
const refreshBtn = $("refreshPublic"); // opcional, si existe

(async function main() {
  try {
    if (refreshBtn) refreshBtn.addEventListener("click", load);
    await load();
  } catch (e) {
    showError(e);
  }
})();

async function load() {
  try {
    if (note) { note.textContent = ""; note.style.color = ""; }
    if (listDiv) listDiv.innerHTML = `<div class="small" style="opacity:.8">Cargando…</div>`;

    const { data, error } = await sb
      .from("public_leaderboard_cache")
      .select("display_name, points_total, exact_count, updated_at")
      .order("points_total", { ascending: false })
      .order("exact_count", { ascending: false })
      .order("display_name", { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      listDiv.innerHTML = `<div class="small">Aún no hay datos. Cuando el admin cargue resultados y ejecute refresh, aparecerá aquí.</div>`;
      return;
    }

    const updatedAt = data[0]?.updated_at ? new Date(data[0].updated_at) : null;
    if (note && updatedAt) {
      note.textContent =
        "Actualizado: " +
        updatedAt.toLocaleString("es-CO", { timeZone: "America/Bogota" });
    }

    listDiv.innerHTML = renderTable(data);
  } catch (e) {
    showError(e);
  }
}

function renderTable(rows) {
  const header = `
    <div class="row small" style="justify-content:space-between; opacity:.85; margin-top:8px">
      <span><strong>Jugador</strong></span>
      <span><strong>Puntos</strong></span>
      <span><strong>Exactos</strong></span>
    </div>
    <div style="height:8px"></div>
  `;

  const items = rows
    .map((r, idx) => {
      const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "";
      return `
        <div class="card" style="margin-top:10px">
          <div class="row" style="justify-content:space-between; align-items:center">
            <div><strong>${medal} ${escapeHtml(r.display_name)}</strong></div>
            <div>${r.points_total ?? 0}</div>
            <div>${r.exact_count ?? 0}</div>
          </div>
        </div>
      `;
    })
    .join("");

  return header + items;
}

function showError(e) {
  const msg = e?.message ?? String(e);
  if (note) {
    note.textContent = msg;
    note.style.color = "#ffb3b3";
  }
  if (listDiv) listDiv.innerHTML = "";
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
