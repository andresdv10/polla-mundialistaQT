import { sb } from "./supabaseClient.js";

const $ = (id) => document.getElementById(id);

// IDs del DOM (según tu app.html)
const who = $("who");
const adminLink = $("adminLink");
const logoutBtn = $("logout");
const note = $("note");

const stageSel = $("stage");
const reloadBtn = $("reload");
const listDiv = $("list");
const leaderDiv = $("leader");

// Modal nombre
const nameModal = $("nameModal");
const nameInput = $("nameInput");
const saveNameBtn = $("saveNameBtn");
const nameErr = $("nameErr");

let session = null;
let profile = null;

(async function main() {
  try {
    session = await getSessionOrRedirect();
    profile = await ensureProfile(session.user.id);

    // Pedir nombre si no tiene o quedó "Jugador"
    let displayName = (profile.display_name || "").trim();
    if (!displayName || displayName.toLowerCase() === "jugador") {
      displayName = await askNameAndSave();
      profile.display_name = displayName;
    }

    // Header
    who.textContent = `${profile.display_name} · ${profile.role}`;
    note.textContent = `Tu UUID (user.id): ${session.user.id}`;

    // Link admin solo si admin
    adminLink.style.display = (profile.role === "admin") ? "" : "none";

    // Eventos
    logoutBtn.addEventListener("click", onLogout);
    reloadBtn.addEventListener("click", refresh);
    stageSel.addEventListener("change", refresh);

    // Cargar fases disponibles desde DB
    await loadStagesFromDB();

    // Render inicial
    await refresh();

    // Tabla privada (placeholder)
    await renderPrivateBoard();
  } catch (e) {
    showError(e);
  }
})();

/* ---------------- Auth ---------------- */

async function getSessionOrRedirect() {
  const { data, error } = await sb.auth.getSession();
  if (error) throw error;
  const s = data?.session;
  if (!s) {
    window.location.href = "./index.html";
    throw new Error("Sin sesión, redirigiendo…");
  }
  return s;
}

async function onLogout() {
  try { await sb.auth.signOut(); } catch (_) {}
  window.location.href = "./index.html";
}

/* ---------------- Profile ---------------- */

async function ensureProfile(userId) {
  // 1) intentar leer
  let { data, error } = await sb
    .from("profiles")
    .select("id, display_name, role")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;

  // 2) si no existe, crear
  if (!data) {
    const ins = await sb
      .from("profiles")
      .insert({ id: userId, display_name: "Jugador", role: "player" })
      .select("id, display_name, role")
      .single();

    if (ins.error) throw ins.error;
    data = ins.data;
  }

  return data;
}

async function askNameAndSave() {
  nameErr.textContent = "";
  nameModal.style.display = "block";
  nameInput.value = "";
  nameInput.focus();

  return await new Promise((resolve) => {
    const cleanup = () => {
      saveNameBtn.onclick = null;
      nameInput.onkeydown = null;
    };

    const validate = (name) => {
      const n = name.trim();
      if (n.length < 2) return "Escribe al menos 2 letras.";
      if (n.length > 30) return "Máximo 30 caracteres.";
      if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]+$/.test(n)) return "Solo letras y espacios.";
      return null;
    };

    const submit = async () => {
      nameErr.textContent = "";
      const name = nameInput.value;
      const msg = validate(name);
      if (msg) { nameErr.textContent = msg; return; }

      saveNameBtn.disabled = true;
      try {
        const { error } = await sb
          .from("profiles")
          .update({ display_name: name.trim() })
          .eq("id", session.user.id);

        if (error) throw error;

        nameModal.style.display = "none";
        cleanup();
        resolve(name.trim());
      } catch (e) {
        nameErr.textContent = "Error guardando nombre: " + (e?.message ?? e);
      } finally {
        saveNameBtn.disabled = false;
      }
    };

    saveNameBtn.onclick = submit;
    nameInput.onkeydown = (ev) => {
      if (ev.key === "Enter") submit();
    };
  });
}

/* ---------------- Matches + Predictions ---------------- */

async function loadStagesFromDB() {
  const { data, error } = await sb
    .from("matches")
    .select("stage")
    .order("stage", { ascending: true });

  if (error) throw error;

  const stages = [...new Set((data || []).map(r => r.stage).filter(Boolean))];
  const fallback = ["grupos", "octavos", "cuartos", "semis", "final"];
  const list = stages.length ? stages : fallback;

  stageSel.innerHTML = "";
  for (const st of list) {
    const opt = document.createElement("option");
    opt.value = st;
    opt.textContent = st;
    stageSel.appendChild(opt);
  }
}

async function refresh() {
  try {
    listDiv.innerHTML = `<div class="small" style="opacity:.8">Cargando…</div>`;
    note.style.color = "";

    const stage = stageSel.value;

    // 1) traer partidos de la fase
    const { data: matches, error: mErr } = await sb
      .from("matches")
      .select("id, stage, match_number, team_home, team_away, kickoff_time, status, score_home, score_away, winner_team")
      .eq("stage", stage)
      .order("kickoff_time", { ascending: true });

    if (mErr) throw mErr;

    if (!matches || matches.length === 0) {
      listDiv.innerHTML = `<div class="small">No hay partidos para <strong>${escapeHtml(stage)}</strong>.</div>`;
      return;
    }

    // 2) traer mis predicciones de esos partidos (OJO: columnas reales pred_home/pred_away)
    const matchIds = matches.map(m => m.id);

    const { data: preds, error: pErr } = await sb
      .from("predictions")
      .select("match_id, pred_home, pred_away")
      .eq("user_id", session.user.id)
      .in("match_id", matchIds);

    if (pErr) throw pErr;

    const predMap = new Map((preds || []).map(p => [p.match_id, p]));

    // 3) render
    listDiv.innerHTML = matches.map(m => renderMatchWithPrediction(m, predMap.get(m.id))).join("");

    // 4) wire eventos guardar
    wirePredictionEvents();
  } catch (e) {
    showError(e);
  }
}

function renderMatchWithPrediction(m, pred) {
  const dt = m.kickoff_time
    ? new Date(m.kickoff_time).toLocaleString("es-CO", { timeZone: "America/Bogota" })
    : "—";

  const ph = pred?.pred_home ?? "";
  const pa = pred?.pred_away ?? "";

  const locked = (m.status === "finished");
  const disabledAttr = locked ? "disabled" : "";

  const officialLine = (m.status === "finished" && m.score_home !== null && m.score_away !== null)
    ? `<div class="small" style="opacity:.85">Resultado oficial: <strong>${m.score_home} - ${m.score_away}</strong></div>`
    : `<div class="small" style="opacity:.75">Status: ${escapeHtml(m.status ?? "scheduled")}</div>`;

  return `
    <div class="card" style="margin-top:12px" data-match-id="${m.id}">
      <div>
        <div><strong>#${m.match_number ?? ""} ${escapeHtml(m.team_home)} vs ${escapeHtml(m.team_away)}</strong></div>
        <div class="small">${dt} · <span class="badge">${escapeHtml(m.stage)}</span></div>
        ${officialLine}
      </div>

      <div class="row" style="margin-top:10px; gap:10px; flex-wrap:wrap; align-items:flex-end">
        <div style="min-width:130px">
          <div class="small">${escapeHtml(m.team_home)}</div>
          <input class="ph" type="number" min="0" step="1" value="${escapeAttr(ph)}" placeholder="0" ${disabledAttr}/>
        </div>

        <div style="min-width:130px">
          <div class="small">${escapeHtml(m.team_away)}</div>
          <input class="pa" type="number" min="0" step="1" value="${escapeAttr(pa)}" placeholder="0" ${disabledAttr}/>
        </div>

        <button class="savePred" ${disabledAttr}>Guardar</button>
        <span class="msg small" style="opacity:.85"></span>
      </div>

      ${locked ? `<div class="small" style="opacity:.7; margin-top:6px">Predicción bloqueada (partido finalizado).</div>` : ``}
    </div>
  `;
}

function wirePredictionEvents() {
  const cards = Array.from(listDiv.querySelectorAll("[data-match-id]"));
  for (const card of cards) {
    const btn = card.querySelector(".savePred");
    if (!btn) continue;
    btn.addEventListener("click", () => savePrediction(card));
  }
}

async function savePrediction(card) {
  const matchId = parseInt(card.getAttribute("data-match-id"), 10);
  const phEl = card.querySelector(".ph");
  const paEl = card.querySelector(".pa");
  const msgEl = card.querySelector(".msg");
  const btn = card.querySelector(".savePred");

  msgEl.textContent = "";
  msgEl.style.color = "";

  const phRaw = phEl.value;
  const paRaw = paEl.value;

  const pred_home = phRaw === "" ? null : parseInt(phRaw, 10);
  const pred_away = paRaw === "" ? null : parseInt(paRaw, 10);

  // validar
  if (pred_home === null || pred_away === null) {
    msgEl.textContent = "Pon ambos marcadores para guardar.";
    msgEl.style.color = "#ffb3b3";
    return;
  }
  if (Number.isNaN(pred_home) || pred_home < 0 || Number.isNaN(pred_away) || pred_away < 0) {
    msgEl.textContent = "Marcadores inválidos (solo enteros >= 0).";
    msgEl.style.color = "#ffb3b3";
    return;
  }

  btn.disabled = true;
  btn.textContent = "Guardando…";

  try {
    const { error } = await sb
      .from("predictions")
      .upsert(
        {
          user_id: session.user.id,
          match_id: matchId,
          pred_home,
          pred_away,
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id,match_id" }
      );

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
async function renderPrivateBoard() {
  leaderDiv.innerHTML = `<div class="small" style="opacity:.8">Cargando tabla…</div>`;
const myName = (profile?.display_name || "").trim();

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
      leaderDiv.innerHTML = `<div class="small">Sin datos todavía.</div>`;
      return;
    }

    // Tomamos el máximo updated_at (por si no es el primero)
    const maxUpdated = data
      .map(r => r.updated_at)
      .filter(Boolean)
      .sort()
      .slice(-1)[0];

    const updated = maxUpdated
      ? new Date(maxUpdated).toLocaleString("es-CO", { timeZone: "America/Bogota" })
      : "—";

    leaderDiv.innerHTML = `
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
              <tr style="border-top:1px solid rgba(255,255,255,.10)">
                <td style="padding:8px 6px">${i + 1}</td>
                <td style="padding:8px 6px">${escapeHtml(r.display_name ?? "Jugador")}</td>
                <td style="padding:8px 6px">${r.points_total ?? 0}</td>
                <td style="padding:8px 6px">${r.exact_count ?? 0}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  } catch (e) {
    leaderDiv.innerHTML = `<div class="small" style="color:#ffb3b3">Error cargando tabla: ${escapeHtml(e?.message ?? e)}</div>`;
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
