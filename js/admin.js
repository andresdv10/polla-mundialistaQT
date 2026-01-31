import { sb } from "./supabaseClient.js";

const $ = (id) => document.getElementById(id);

// UI
const who = $("who");
const logoutBtn = $("logout");
const refreshBoardBtn = $("refreshBoard"); // nuevo
const note = $("note");
const stageSel = $("stage");
const reloadBtn = $("reload");
const listDiv = $("list");

let session = null;

(async function main() {
  try {
    session = await getSessionOrRedirect();

    // validar admin
    const prof = await getMyProfile(session.user.id);
    if (!prof) throw new Error("No existe tu perfil (profiles).");
    if (prof.role !== "admin") throw new Error("Acceso denegado: tu usuario no es admin.");

    who.textContent = `${prof.display_name || "Admin"} · admin`;
    note.textContent = `Tu UUID: ${session.user.id}`;

    logoutBtn.addEventListener("click", onLogout);
    reloadBtn.addEventListener("click", refreshMatches);
    stageSel.addEventListener("change", refreshMatches);

    // nuevo: refrescar ranking cache
    refreshBoardBtn.addEventListener("click", onRefreshPublicBoard);

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

/* ---------------- Public board refresh ---------------- */

async function onRefreshPublicBoard() {
  note.style.color = "";
  const prev = note.textContent;
  note.textContent = "Actualizando ranking público…";

  refreshBoardBtn.disabled = true;
  refreshBoardBtn.textContent = "Actualizando…";

  try {
    // RPC (función SQL) que ya creaste
    const { error } = await sb.rpc("refresh_public_leaderboard_cache");
    if (error) throw error;

    note.textContent = "Ranking actualizado ✅ (revisa public.html)";
    note.style.color = "#b6f7c1";
  } catch (e) {
    note.textContent = "Error actualizando ranking: " + (e?.message ?? e);
    note.style.color = "#ffb3b3";
    console.error(e);
  } finally {
    refreshBoardBtn.disabled = false;
    refreshBoardBtn.textContent = "Actualizar ranking";

    // si quieres, volver al texto anterior después de 4s
    setTimeout(() => {
      if (note.textContent?.startsWith("Ranking actualizado")) {
        note.textContent = prev || "";
        note.style.color = "";
      }
    }, 4000);
  }
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
    wireRowEvents();
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

  const winnerOptions = `
    <option value="">(sin ganador)</option>
    <option value="${escapeAttr(m.team_home)}"${wt === m.team_home ? " selected" : ""}>${escapeHtml(m.team_home)}</option>
    <option value="${escapeAttr(m.team_away)}"${wt === m.team_away ? " selected" : ""}>${escapeHtml(m.team_away)}</option>
  `;

  return `
    <div class="card" style="margin-top:12px" data-id="${m.id}" data-home="${escapeAttr(m.team_home)}" data-away="${escapeAttr(m.team_away)}">
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
  const home = card.getAttribute("data-home");
  const away = card.getAttribute("data-away");

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

  // Validaciones básicas
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

  // finished => exigir ambos
  if (status === "finished") {
    if (score_home === null || score_away === null) {
      msgEl.textContent = "Si el partido está finished, debes poner ambos marcadores.";
      msgEl.style.color = "#ffb3b3";
      return;
    }
  } else {
    // si NO finished, winner no tiene sentido
    winner_team = "";
    wtEl.value = "";
  }

  // Si finished y hay marcadores:
  if (status === "finished" && score_home !== null && score_away !== null) {
    if (score_home !== score_away) {
      // NO empate: winner_team se limpia (según tu regla)
      winner_team = "";
      wtEl.value = "";
    } else {
      // empate: si no eligió ganador, advertimos (pero guardamos)
      if (!winner_team) {
        msgEl.textContent = "Empate: si es eliminación, selecciona ganador (winner_team). Guardaré igual.";
        msgEl.style.color = "#ffd28a";
      } else if (winner_team !== home && winner_team !== away) {
        msgEl.textContent = "Ganador inválido (debe ser local o visitante).";
        msgEl.style.color = "#ffb3b3";
        return;
      }
    }
  }

  btn.disabled = true;
  btn.textContent = "Guardando…";

  try {
    const payload = {
      score_home,
      score_away,
      status,
      winner_team: winner_team || null
    };

    const { error } = await sb
      .from("matches")
      .update(payload)
      .eq("id", id);

    if (error) throw error;

    msgEl.textContent = "Guardado ✅";
    msgEl.style.color = "#b6f7c1";
    // Si quedó finished, recalcula ranking público (cache)
if (status === "finished") {
  const r = await sb.rpc("refresh_public_leaderboard_cache");
  // Si falla, no tumbamos el guardado; solo lo avisamos
  if (r.error) console.warn("No se pudo refrescar leaderboard cache:", r.error);
}

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
