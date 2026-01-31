import { sb } from "./supabaseClient.js";

/** UI helpers */
const $ = (id) => document.getElementById(id);

const who = $("who");
const adminLink = $("adminLink");
const logoutBtn = $("logout");
const note = $("note");
const stageSel = $("stage");
const reloadBtn = $("reload");
const listDiv = $("list");
const leaderDiv = $("leader");

/** App state */
let session = null;
let profile = null;

/** Main */
(async function main() {
  try {
    session = await getSessionOrRedirect();
    profile = await ensureProfile(session);

    // listeners
    logoutBtn.addEventListener("click", onLogout);
    reloadBtn.addEventListener("click", () => refreshAll());
    stageSel.addEventListener("change", () => refreshMatches());

    // initial load
    await refreshAll();

    // keep session in sync (optional but helpful)
    sb.auth.onAuthStateChange((_event, newSession) => {
      session = newSession;
    });
  } catch (e) {
    showError(e);
  }
})();

/** Auth */
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
  try {
    await sb.auth.signOut();
  } catch (_) {
    // ignore
  } finally {
    window.location.href = "./index.html";
  }
}

/** Profile (forces name via modal) */
async function ensureProfile(session) {
  const { data: prof, error } = await sb
    .from("profiles")
    .select("id, display_name, role")
    .eq("id", session.user.id)
    .single();

  if (error) throw error;

  let displayName = (prof.display_name || "").trim();

  // Force name when empty or default "Jugador"
  if (!displayName || displayName.toLowerCase() === "jugador") {
    displayName = await askNameAndSave(session);
  }

  who.textContent = `${displayName} · ${prof.role}`;
  adminLink.style.display = prof.role === "admin" ? "inline-block" : "none";

  return { ...prof, display_name: displayName };
}

async function askNameAndSave(session) {
  const modal = $("nameModal");
  const input = $("nameInput");
  const btn = $("saveNameBtn");
  const err = $("nameErr");

  if (!modal || !input || !btn || !err) {
    throw new Error("No se encontró el modal de nombre en app.html (IDs faltantes).");
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
      // Letras (incluye tildes y ñ) y espacios
      if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]+$/.test(n)) return "Solo letras y espacios.";
      return null;
    };

    const submit = async () => {
      err.textContent = "";
      const name = input.value;
      const msg = validate(name);
      if (msg) {
        err.textContent = msg;
        return;
      }

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

/** Data loading */
async function refreshAll() {
  await refreshMatches();
  await refreshPrivateLeaderboard();
  note.textContent = "";
}

function stageToDb(stage) {
  // Ajusta si tu DB usa otros valores. Mantengo el mismo texto del select.
  // grupos/octavos/cuartos/semis/final
  return stage;
}

async function refreshMatches() {
  try {
    listDiv.innerHTML = "";
    const stage = stageToDb(stageSel.value);

    const { data, error } = await sb
      .from("matches")
      .select("id, kickoff_at, stage, home_team, away_team, home_goals, away_goals, status")
      .eq("stage", stage)
      .order("kickoff_at", { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      listDiv.innerHTML = `<p class="small">No hay partidos cargados para esta fase.</p>`;
      return;
    }

    // Render simple
    const rows = data.map((m) => {
      const date = m.kickoff_at ? new Date(m.kickoff_at).toLocaleString("es-CO", { timeZone: "America/Bogota" }) : "—";
      const score =
        m.home_goals === null || m.away_goals === null
          ? "—"
          : `${m.home_goals} - ${m.away_goals}`;

      const status = m.status || "scheduled";

      return `
        <div class="card" style="margin-top:10px">
          <div class="row" style="justify-content:space-between; gap:12px">
            <div>
              <div><strong>${escapeHtml(m.home_team)} vs ${escapeHtml(m.away_team)}</strong></div>
              <div class="small">${date} · <span class="badge">${escapeHtml(status)}</span></div>
            </div>
            <div class="badge" style="font-size:16px">${score}</div>
          </div>
        </div>
      `;
    });

    listDiv.innerHTML = rows.join("");
  } catch (e) {
    showError(e);
  }
}

async function refreshPrivateLeaderboard() {
  try {
    leaderDiv.innerHTML = "";

    // Si tienes una tabla cache privada (public_leaderboard_cache), úsala
    const { data, error } = await sb
      .from("public_leaderboard_cache")
      .select("player_id, display_name, points_total, exact_score_count, winner_count, qualified_count, updated_at")
      .order("points_total", { ascending: false })
      .limit(50);

    // Si la tabla no existe o RLS la bloquea, mostramos mensaje suave
    if (error) {
      leaderDiv.innerHTML = `<p class="small">Tabla privada no disponible aún.</p>`;
      return;
    }

    if (!data || data.length === 0) {
      leaderDiv.innerHTML = `<p class="small">Sin datos todavía.</p>`;
      return;
    }

    const table = `
      <table class="small" style="width:100%; border-collapse:collapse">
        <thead>
          <tr>
            <th style="text-align:left; padding:6px">#</th>
            <th style="text-align:left; padding:6px">Jugador</th>
            <th style="text-align:right; padding:6px">Puntos</th>
          </tr>
        </thead>
        <tbody>
          ${data
            .map(
              (r, i) => `
            <tr>
              <td style="padding:6px">${i + 1}</td>
              <td style="padding:6px">${escapeHtml(r.display_name || "")}</td>
              <td style="padding:6px; text-align:right"><strong>${r.points_total ?? 0}</strong></td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    `;

    leaderDiv.innerHTML = table;
  } catch (e) {
    // suave
    leaderDiv.innerHTML = `<p class="small">Tabla privada no disponible aún.</p>`;
  }
}

/** Utils */
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


