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

// Modal name
const nameModal = $("nameModal");
const nameInput = $("nameInput");
const saveNameBtn = $("saveNameBtn");
const nameErr = $("nameErr");

let session = null;

(async function main() {
  try {
    // 1) obtener sesión
    session = await getSessionOrRedirect();

    // Mostrar UUID SIEMPRE (esto te desbloquea lo de admin)
    note.style.color = "";
    note.textContent = `Tu UUID (user.id): ${session.user.id}`;

    // 2) asegurar perfil + nombre
    const prof = await ensureProfileAndName(session);

    // UI header
    who.textContent = `${prof.display_name} · ${prof.role}`;
    adminLink.style.display = (prof.role === "admin") ? "inline-block" : "none";

    // listeners
    logoutBtn.addEventListener("click", onLogout);
    reloadBtn.addEventListener("click", () => refreshMatches());
    stageSel.addEventListener("change", () => refreshMatches());

    // 3) cargar fases reales desde BD (sin suponer "grupos")
    await loadStagesFromDB();

    // 4) cargar partidos de la fase seleccionada
    await refreshMatches();

    // tabla privada placeholder por ahora
    leaderDiv.innerHTML = `<p class="small">Tabla privada: la conectamos después de que el flujo esté estable.</p>`;
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
    throw new Error("Sin sesión. Redirigiendo a login.");
  }
  return s;
}

async function onLogout() {
  try { await sb.auth.signOut(); } catch (_) {}
  window.location.href = "./index.html";
}

/* ---------------- Profile + Nombre ---------------- */

async function ensureProfileAndName(session) {
  // 1) intentar leer perfil
  let prof = await getMyProfile(session.user.id);

  // 2) si no existe, crearlo (esto es clave)
  if (!prof) {
    await createMyProfileIfMissing(session.user.id);
    prof = await getMyProfile(session.user.id);
  }

  if (!prof) {
    // si todavía no existe, casi seguro es RLS bloqueando
    throw new Error("No pude leer/crear tu perfil. Esto suele ser por políticas RLS en public.profiles.");
  }

  // 3) si no tiene nombre o es Jugador, pedirlo
  const dn = (prof.display_name || "").trim();
  if (!dn || dn.toLowerCase() === "jugador") {
    const newName = await askNameAndSave(session);
    prof.display_name = newName;
  }

  return prof;
}

async function getMyProfile(userId) {
  const { data, error } = await sb
    .from("profiles")
    .select("id, display_name, role")
    .eq("id", userId)
    .maybeSingle();

  // maybeSingle devuelve null si no hay fila, sin error
  if (error) throw error;
  return data || null;
}

async function createMyProfileIfMissing(userId) {
  // Insert mínimo. Si ya existe, no pasa nada (upsert).
  const { error } = await sb
    .from("profiles")
    .upsert({ id: userId, display_name: "Jugador", role: "player" }, { onConflict: "id" });

  if (error) throw error;
}

async function askNameAndSave(session) {
  if (!nameModal || !nameInput || !saveNameBtn || !nameErr) {
    throw new Error("Falta el modal de nombre en app.html (IDs: nameModal/nameInput/saveNameBtn/nameErr).");
  }

  nameErr.textContent = "";
  nameInput.value = "";
  nameModal.style.display = "block";
  setTimeout(() => nameInput.focus(), 50);

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
        const cleanName = name.trim();

        const { error } = await sb
          .from("profiles")
          .update({ display_name: cleanName })
          .eq("id", session.user.id);

        if (error) throw error;

        nameModal.style.display = "none";
        cleanup();
        resolve(cleanName);
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

/* ---------------- Matches ---------------- */

async function loadStagesFromDB() {
  // Trae stages reales
  const { data, error } = await sb
    .from("matches")
    .select("stage")
    .order("stage", { ascending: true });

  if (error) throw error;

  const stages = [...new Set((data || []).map(r => r.stage).filter(Boolean))];

  stageSel.innerHTML = "";
  if (stages.length === 0) {
    stageSel.innerHTML = `<option value="">(sin partidos)</option>`;
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
    const stage = stageSel.value;

    if (!stage) {
      listDiv.innerHTML = `<p class="small">No hay fases disponibles (tabla matches vacía o sin permiso de lectura).</p>`;
      return;
    }

    const { data, error } = await sb
      .from("matches")
      .select("id, stage, match_number, team_home, team_away, kickoff_time")
      .eq("stage", stage)
      .order("kickoff_time", { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      listDiv.innerHTML = `<p class="small">No hay partidos para la fase: <strong>${escapeHtml(stage)}</strong>.</p>`;
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
        (Marcadores/edición van en el panel Admin; primero estabilizamos nombre + carga)
      </div>
    </div>
  `;
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
