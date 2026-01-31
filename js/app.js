import { sb } from "./supabaseClient.js";

const $ = (id) => document.getElementById(id);

// UI
const who = $("who");
const adminLink = $("adminLink");
const logoutBtn = $("logout");
const note = $("note");
const stageSel = $("stage");
const reloadBtn = $("reload");
const listDiv = $("list");
const leaderDiv = $("leader");

// Estado
let session = null;

(async function main() {
  try {
    // 1) session
    session = await getSessionOrRedirect();

    // 2) profile (y forzar nombre)
    await ensureProfile(session);

    // listeners
    logoutBtn.addEventListener("click", onLogout);
    reloadBtn.addEventListener("click", refreshMatches);
    stageSel.addEventListener("change", refreshMatches);

    // 3) carga inicial
    await refreshMatches();
    renderLeaderPlaceholder();

    note.textContent = "";
  } catch (e) {
    showError(e);
  }
})();

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

async function ensureProfile(session) {
  const { data: prof, error } = await sb
    .from("profiles")
    .select("id, display_name, role")
    .eq("id", session.user.id)
    .single();

  if (error) throw error;

  let displayName = (prof.display_name || "").trim();
  if (!displayName || displayName.toLowerCase() === "jugador") {
    displayName = await askNameAndSave(session);
  }

  who.textContent = `${displayName} · ${prof.role}`;
  adminLink.style.display = (prof.role === "admin") ? "inline-block" : "none";
}

async function askNameAndSave(session) {
  const modal = $("nameModal");
  const input = $("nameInput");
  const btn = $("saveNameBtn");
  const err = $("nameErr");

  if (!modal || !input || !btn || !err) {
    throw new Error("Falta el modal de nombre en app.html (IDs: nameModal/nameInput/saveNameBtn/nameErr).");
  }

  modal.style.display = "block";
  err.textContent = "";
  input.value = "";
  setTimeout(() => input.focus(), 50);

  return await new Promise((resolve) => {
    const cleanup = () => {
      btn.onclick = null;
      input.onkeydown = null;
    };

    const validate = (name) => {
      const n = name.trim();
      if (n.length < 2) return "Escribe al menos 2 letras.";
      if (n.length > 30) return "Máximo 30 caracteres.";
      if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]+$/.test(n)) return "Solo letras y espacios.";
      return null;
    };

    const submit = async () => {
      err.textContent = "";
      const name = input.value;
      const msg = validate(name);
      if (msg) { err.textContent = msg; return; }

      btn.disabled = true;
      try {
        const cleanName = name.trim();

        const { error } = await sb
          .from("profiles")
          .update({ display_name: cleanName })
          .eq("id", session.user.id);

        if (error) throw error;

        modal.style.display = "none";
        cleanup();
        resolve(cleanName);
      } catch (e) {
        err.textContent = "Error guardando nombre: " + (e?.message ?? e);
      } finally {
        btn.disabled = false;
      }
    };

    btn.onclick = submit;
    input.onkeydown = (ev) => {
      if (ev.key === "Enter") submit();
    };
  });
}

async function refreshMatches() {
  try {
    listDiv.innerHTML = "";
    note.textContent = "";

    const stage = stageSel.value; // usa exactamente lo que tengas en el select: grupos/octavos/...

    // SOLO columnas confirmadas que existen:
    const { data, error } = await sb
      .from("matches")
      .select("id, stage, match_number, team_home, team_away, kickoff_time")
      .eq("stage", stage)
      .order("kickoff_time", { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      listDiv.innerHTML = `<p class="small">No hay partidos para la fase <strong>${escapeHtml(stage)}</strong>.</p>`;
      return;
    }

    listDiv.innerHTML = data.map(renderMatchCard).join("");
  } catch (e) {
    showError(e);
  }
}

function renderMatchCard(m) {
  const dt = m.kickoff_time
    ? new Date(m.kickoff_time).toLocaleString("es-CO", { timeZone: "America/Bogota" })
    : "—";

  return `
    <div class="card" style="margin-top:10px">
      <div class="row" style="justify-content:space-between; gap:12px; align-items:center">
        <div>
          <div><strong>#${m.match_number ?? ""} ${escapeHtml(m.team_home)} vs ${escapeHtml(m.team_away)}</strong></div>
          <div class="small">${dt} · <span class="badge">${escapeHtml(m.stage)}</span></div>
        </div>
        <div class="badge">—</div>
      </div>
      <div class="small" style="opacity:.8; margin-top:8px">
        (Marcador real y puntos se verán cuando carguemos la parte de resultados/admin)
      </div>
    </div>
  `;
}

function renderLeaderPlaceholder() {
  leaderDiv.innerHTML = `
    <p class="small">
      Tabla privada: pendiente de conectar a tu vista/cache real.
      (Primero dejemos estable: login + nombre + lista de partidos)
    </p>
  `;
}

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
