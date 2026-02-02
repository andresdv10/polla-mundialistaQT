import { sb } from "./supabaseClient.js";

const $ = (id) => document.getElementById(id);

// UI
const who = $("who");
const logoutBtn = $("logout");
const refreshBoardBtn = $("refreshBoard");
const note = $("note");

const stageSel = $("stage");
const reloadBtn = $("reload");
const listDiv = $("list");
const leaderboardAdmin = $("leaderboardAdmin");

const downloadBackupBtn = $("downloadBackup");
const backupMsg = $("backupMsg");

const targetUserId = $("targetUserId");
const targetRole = $("targetRole");
const setRoleBtn = $("setRole");
const roleMsg = $("roleMsg");

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
    note.style.color = "";

    // Eventos
    logoutBtn?.addEventListener("click", onLogout);
    reloadBtn?.addEventListener("click", refreshMatches);
    stageSel?.addEventListener("change", refreshMatches);

    downloadBackupBtn?.addEventListener("click", downloadBackupCSV);
    setRoleBtn?.addEventListener("click", onSetRole);

    // refrescar ranking público
    refreshBoardBtn?.addEventListener("click", onRefreshPublicBoard);

    await loadStagesFromDB();
    await refreshMatches();
    await renderAdminBoard();

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
  if (!refreshBoardBtn) return;

  note.style.color = "";
  const prev = note.textContent;
  note.textContent = "Actualizando ranking público…";

  refreshBoardBtn.disabled = true;
  refreshBoardBtn.textContent = "Actualizando…";

  try {
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

    // (opcional) forzar grupos como default EN ADMIN
    if (st === "grupos") opt.selected = true;

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

    await renderAdminBoard();
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
    <div class="card"
      style="margin-top:12px"
      data-id="${m.id}"
      data-home="${escapeAttr(m.team_home)}"
      data-away="${escapeAttr(m.team_away)}"
      data-kickoff="${escapeAttr(m.kickoff_time ?? "")}">
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

  // ✅ CAMBIO CLAVE:
  // Antes había un bloqueo por kickoff que impedía editar después de iniciar.
  // Tú pediste: "admin puede ingresar resultados sin restricciones".
  // => Se elimina esa validación por completo.

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

  if (status === "finished") {
    if (score_home === null || score_away === null) {
      msgEl.textContent = "Si el partido está finished, debes poner ambos marcadores.";
      msgEl.style.color = "#ffb3b3";
      return;
    }
  } else {
    winner_team = "";
    wtEl.value = "";
  }

  if (status === "finished" && score_home !== null && score_away !== null) {
    if (score_home !== score_away) {
      winner_team = "";
      wtEl.value = "";
    } else {
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

    if (status === "finished") {
      const r = await sb.rpc("refresh_public_leaderboard_cache");
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

/* ---------------- Admin leaderboard render ---------------- */

async function renderAdminBoard() {
  if (!leaderboardAdmin) return;

  try {
    const { data, error } = await sb
      .from("public_leaderboard_cache")
      .select("display_name, points_total, exact_count, updated_at")
      .order("points_total", { ascending: false })
      .order("exact_count", { ascending: false })
      .order("display_name", { ascending: true })
      .limit(50);

    if (error) throw error;

    if (!data || data.length === 0) {
      leaderboardAdmin.innerHTML = `<div class="small">Sin datos todavía.</div>`;
      return;
    }

    const maxUpdated = data
      .map(r => r.updated_at)
      .filter(Boolean)
      .sort()
      .slice(-1)[0];

    const updated = maxUpdated
      ? new Date(maxUpdated).toLocaleString("es-CO", { timeZone: "America/Bogota" })
      : "—";

    leaderboardAdmin.innerHTML = `
      <div class="small" style="margin-bottom:8px; opacity:.85">
        Última actualización: ${updated}
      </div>
      <div style="overflow:auto">
        <table style="width:100%; border-collapse:collapse">
          <thead>
            <tr style="text-align:left; opacity:.85">
              <th style="padding:8px 6px">#</th>
              <th style="padding:8px 6px">Jugador</th>
              <th style="padding:8px 6px">Pts</th>
              <th style="padding:8px 6px">Exactos</th>
            </tr>
          </thead>
          <tbody>
            ${data.map((r, i) => `
              <tr style="border-top:1px solid rgba(255,255,255,.10);">
                <td style="padding:8px 6px">${i + 1}</td>
                <td style="padding:8px 6px">${escapeHtml((r.display_name ?? "Jugador"))}</td>
                <td style="padding:8px 6px">${r.points_total ?? 0}</td>
                <td style="padding:8px 6px">${r.exact_count ?? 0}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  } catch (e) {
    leaderboardAdmin.innerHTML = `<div class="small" style="color:#ffb3b3">Error cargando tabla</div>`;
  }
}

/* ---------------- Backup CSV ---------------- */

async function downloadBackupCSV() {
  backupMsg.textContent = "";
  backupMsg.style.color = "";

  try {
    downloadBackupBtn.disabled = true;
    downloadBackupBtn.textContent = "Generando…";

    const { data, error } = await sb.rpc("admin_export_backup");
    if (error) throw error;

    if (!data || data.length === 0) {
      backupMsg.textContent = "No hay datos para exportar.";
      backupMsg.style.color = "#ffd28a";
      return;
    }

    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(","),
      ...data.map(row => headers.map(h => csvCell(row[h])).join(","))
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `backup_polla_${new Date().toISOString().slice(0,19).replaceAll(":","-")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    backupMsg.textContent = `Backup generado ✅ (${data.length} filas)`;
    backupMsg.style.color = "#b6f7c1";
  } catch (e) {
    backupMsg.textContent = "Error: " + (e?.message ?? e);
    backupMsg.style.color = "#ffb3b3";
  } finally {
    downloadBackupBtn.disabled = false;
    downloadBackupBtn.textContent = "Descargar backup (CSV)";
  }
}

/* ---------------- Role management ---------------- */

async function onSetRole() {
  roleMsg.textContent = "";
  roleMsg.style.color = "";

  const uid = (targetUserId.value || "").trim();
  const role = (targetRole.value || "").trim();

  if (!uid) {
    roleMsg.textContent = "Pega el UUID del usuario.";
    roleMsg.style.color = "#ffb3b3";
    return;
  }

  try {
    setRoleBtn.disabled = true;
    setRoleBtn.textContent = "Aplicando…";

    const { error } = await sb.rpc("admin_set_role", {
      target_user_id: uid,
      new_role: role
    });

    if (error) throw error;

    roleMsg.textContent = `Rol actualizado ✅ (${uid} → ${role})`;
    roleMsg.style.color = "#b6f7c1";
  } catch (e) {
    roleMsg.textContent = "Error: " + (e?.message ?? e);
    roleMsg.style.color = "#ffb3b3";
  } finally {
    setRoleBtn.disabled = false;
    setRoleBtn.textContent = "Aplicar";
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

function csvCell(v) {
  if (v === null || v === undefined) return "";
  const s = String(v).replaceAll('"', '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}
