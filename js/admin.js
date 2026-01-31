import { sb } from "./supabaseClient.js";

const $ = (id) => document.getElementById(id);

// UI
const who = $("who");
const logoutBtn = $("logout");
const note = $("note");
const stageSel = $("stage");
const reloadBtn = $("reload");
const listDiv = $("list");

let session = null;
let isAdmin = false;

(async function main() {
  try {
    session = await getSessionOrRedirect();

    // validar admin
    const prof = await getMyProfile(session.user.id);
    if (!prof) throw new Error("No existe tu perfil (profiles).");
    isAdmin = (prof.role === "admin");
    if (!isAdmin) {
      throw new Error("Acceso denegado: tu usuario no es admin.");
    }

    who.textContent = `${prof.display_name || "Admin"} · admin`;
    note.textContent = `Tu UUID: ${session.user.id}`;

    logoutBtn.addEventListener("click", onLogout);
    reloadBtn.addEventListener("click", refreshMatches);
    stageSel.addEventListener("change", refreshMatches);

    await loadStagesFromDB();
    await refreshMatches();
  } catch (e) {
    showError(e);
  }
})();

/* ---------------- Auth / Profile ---------------- */

async function getSessionOrRedirect() {
  const { data, error } = await sb.auth.getSession();
  if (error) throw error;
  const s = data?.session;
  if (!s) {
    window.location.href = "./index.html";
    throw new Error("Sin sesión. Redirigiendo a login.");
  }
  return s;
}

async function onLogout() {
  try { await sb.auth.signOut(); } catch (_) {}
  window.location.href = "./index.html";
}

async function getMyProfile(userId) {
  const { data, error } = await sb
    .from("profiles")
    .select("id, display_name, role")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

/* ---------------- Stages / Matches ---------------- */

async function loadStagesFromDB() {
  const { data, error } = await sb
    .from("matches")
    .select("stage")
    .order("stage", { ascending: true });

  if (error) throw error;

  const stages = [...new Set((data || []).map(r => r.stage).filter(Boolean))];

  stageSel.innerHTML = "";
  if (stages.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "(sin partidos)";
    stageSel.appendChild(opt);
    return;
  }

  for (const st of stages) {
    const opt = document.createElement("option");
    opt.value = st;
    opt.textContent = st;
    stageSel.appendChild(opt);
  }
}

async function refreshMatches() {
  try {
    listDiv.innerHTML = "";
    note.style.color = "";
    const stage = stageSel.value;

    if (!stage) {
      listDiv.innerHTML = `<p class="small">No hay fases disponibles.</p>`;
      return;
    }

    const { data, error } = await sb
      .from("matches")
      .select("id, stage, match_number, team_home, team_away, kickoff_time, score_home, score_away, status, winner_team, is_final")
      .eq("stage", stage)
      .order("kickoff_time", { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      listDiv.innerHTML = `<p class="small">No hay partidos para la fase <strong>${escapeHtml(stage)}</strong>.</p>`;
      return;
    }

    listDiv.innerHTML = data.map(renderAdminMatchRow).join("");
    wireRowEvents(); // activar botones save
  } catch (e) {
    showError(e);
  }
}

/* ---------------- Render + Save ---------------- */

function renderAdminMatchRow(m) {
  const dt = m.kickoff_time
    ? new Date(m.kickoff_time).toLocaleString("es-CO", { timeZone: "America/Bogota" })
    : "—";

  const sh = (m.score_home ?? "");
  const sa = (m.score_away ?? "");
  const st = (m.status ?? "scheduled");
  const wt = (m.winner_team ?? "");

  // Dropdown winner solo útil en eliminación. Aquí lo mostramos siempre, pero lo validamos:
  // - si empate -> requerido
  // - si no empate -> lo limpiamos
  const winnerOptions = `
    <option value="">(sin ganador)</option>
    <option value="${escapeAttr(m.team_home)}"${wt === m.team_home ? " selected" : ""}>${escapeHtml(m.team_home)}</option>
    <option value="${escapeAttr(m.team_away)}"${wt === m.team_away ? " selected" : ""}>${escapeHtml(m.team_away)}</option>
  `;

  return `
    <div class="card" style="margin-top:12px" data-id="${m.id}">
      <div class="row" style="justify-content:space-between; gap:10px; align-items:center">
        <div>
          <div><strong>#${m.match_number ?? ""} ${escapeHtml(m.team_home)} vs ${escapeHtml(m.team_away)}</strong></div>
          <div class="small">${dt} · <span class="badge">${escapeHtml(m.stage)}</span></div>
        </div>
        <div class="badge">${m.is_final ? "final" : "—"}</div>
      </div>

      <div class="row" style="margin-top:10px; gap:10px; flex-wrap:wrap; align-items:flex-end">
        <div style="min-width:140px">
          <div class="small">Status</div>
          <select class="st">
            <option value="scheduled"${st === "scheduled" ? " selected" : ""}>scheduled</option>
            <option value="finished"${st === "finished" ? " selected" : ""}>finished</option>
          </select>
        </div>

        <div style="min-width:120px">
          <div class="small">${escapeHtml(m.team_home)}</div>
          <input class="sh" type="number" min="0" step="1" value="${escapeAttr(sh)}" placeholder="0" />
        </div>

        <div style="min-width:120px">
          <div class="small">${escapeHtml(m.team_away)}</div>
          <input class="sa" type="number" min="0" step="1" value="${escapeAttr(sa)}" placeholder="0" />
        </div>

        <div style="min-width:220px">
          <div class="small">Ganador (si empate en eliminación)</div>
          <select class="wt">
            ${winnerOptions}
          </select>
        </div>

        <button class="save">Guardar</button>
        <span class="msg small" style="opacity:.85"></span>
      </div>
    </div>
  `;
}

function wireRowEvents() {
  const cards = Array.from(listDiv.querySelectorAll("[data-id]"));
  for (const card of cards) {
    const btn = card.querySelector(".save");
    btn.addEventListener("click", () => saveRow(card));
  }
}

async function saveRow(card) {
  const id = card.getAttribute("data-id");
  const shEl = card.querySelector(".sh");
  const saEl = card.querySelector(".sa");
  const stEl = card.querySelector(".st");
  const wtEl = card.querySelector(".wt");
  const msgEl = card.querySelector(".msg");
  const btn = card.querySelector(".save");

  msgEl.textContent = "";
  msgEl.style.color = "";

  const shRaw = shEl.value;
  const saRaw = saEl.value;

  const score_home = shRaw === "" ? null : parseInt(shRaw, 10);
  const score_away = saRaw === "" ? null : parseInt(saRaw, 10);
  const status = stEl.value || "scheduled";
  let winner_team = (wtEl.value || "").trim();

  // Validaciones
  if (score_home !== null && (Number.isNaN(score_home) || score_home < 0)) {
    msgEl.textContent = "Score local inválido.";
    msgEl.style.color = "#ffb3b3";
    return;
  }
  if (score_away !== null && (Number.isNaN(score_away) || score_away < 0)) {
    msgEl.textContent = "Score visitante inválido.";
    msgEl.style.color = "#ffb3b3";
    return;
  }

  // Si status finished, exigir marcador completo
  if (status === "finished") {
    if (score_home === null || score_away === null) {
      msgEl.textContent = "Si el partido está finished, debes poner ambos marcadores.";
      msgEl.style.color = "#ffb3b3";
      return;
    }
  }

  // Si hay marcadores y NO hay empate, winner_team debe ir vacío
  if (score_home !== null && score_away !== null && score_home !== score_away) {
    winner_team = "";
    wtEl.value = "";
  }

  // Si hay empate y está finished, winner_team es requerido (para eliminación).
  // No sabemos aquí si es eliminación o grupos, así que lo dejamos como:
  // - Si empate + finished y el admin eligió ganador -> ok
  // - Si empate + finished y NO eligió ganador -> advertir (pero permitir guardar)
  // Puedes endurecer esto después.
  if (status === "finished" && score_home !== null && score_away !== null && score_home === score_away && !winner_team) {
    msgEl.textContent = "Empate: si es eliminación, selecciona ganador (winner_team). Guardaré igual.";
    msgEl.style.color = "#ffd28a";
  }

  btn.disabled = true;
  btn.textContent = "Guardando…";

  try {
    const payload = { score_home, score_away, status, winner_team: (winner_team || null) };

    const { error } = await sb
      .from("matches")
      .update(payload)
      .eq("id", id);

    if (error) throw error;

    msgEl.textContent = "Guardado ✅";
    msgEl.style.color = "#b6f7c1";
  } catch (e) {
    msgEl.textContent = "Error guardando: " + (e?.message ?? e);
    msgEl.style.color = "#ffb3b3";
  } finally {
    btn.disabled = false;
    btn.textContent = "Guardar";
  }
}

/* ---------------- Utils ---------------- */

function showError(e) {
  const msg = e?.message ?? String(e);
  note.textContent = msg;
  note.style.color = "#ffb3b3";
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

function escapeAttr(s) {
  return escapeHtml(String(s));
}
