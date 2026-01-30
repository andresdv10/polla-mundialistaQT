import { sb } from "./supabaseClient.js";
import { getSession, signOut, formatBogota } from "./auth.js";

const logout = document.getElementById("logout");
const who = document.getElementById("who");
const stageSel = document.getElementById("stage");
const reloadBtn = document.getElementById("reload");
const matchesDiv = document.getElementById("matches");
const usersDiv = document.getElementById("users");

logout.onclick = signOut;

const session = await getSession();
if (!session) window.location.href = "./index.html";

async function requireAdmin() {
  const { data: prof, error } = await sb
    .from("profiles")
    .select("display_name, role")
    .eq("id", session.user.id)
    .single();

  if (error) throw error;

  who.textContent = `${prof.display_name} · ${prof.role}`;
  if (prof.role !== "admin") {
    alert("No eres admin.");
    window.location.href = "./app.html";
    return false;
  }
  return true;
}

if (!(await requireAdmin())) throw new Error("not admin");

async function loadMatches() {
  matchesDiv.textContent = "Cargando...";
  const stage = stageSel.value;

  const { data, error } = await sb
    .from("matches")
    .select("id, team_home, team_away, kickoff_time, score_home, score_away, qualified_team, is_final, stage")
    .eq("stage", stage)
    .order("kickoff_time", { ascending: true });

  if (error) { matchesDiv.textContent = "Error: " + error.message; return; }

  matchesDiv.innerHTML = data.map(m => {
    const hasResult = (m.score_home !== null && m.score_away !== null);
    const needsQ = m.stage !== "grupos";

    return `
      <div class="card" style="margin:10px 0">
        <div><b>${m.team_home}</b> vs <b>${m.team_away}</b></div>
        <div class="small">${formatBogota(m.kickoff_time)}</div>

        <div class="row" style="margin-top:10px">
          <input type="number" min="0" max="20" value="${m.score_home ?? ""}" data-mid="${m.id}" data-field="score_home" style="width:90px" placeholder="Local">
          <input type="number" min="0" max="20" value="${m.score_away ?? ""}" data-mid="${m.id}" data-field="score_away" style="width:90px" placeholder="Visita">
          ${needsQ ? `<input type="text" value="${m.qualified_team ?? ""}" data-mid="${m.id}" data-field="qualified_team" style="min-width:200px" placeholder="Clasifica (texto)">` : ""}
          <button data-save="${m.id}">${hasResult ? "Actualizar" : "Guardar"}</button>
        </div>

        <div class="small">Finalizado: ${m.is_final ? "Sí" : "No"}</div>
      </div>
    `;
  }).join("");

  matchesDiv.querySelectorAll("button[data-save]").forEach(btn => {
    btn.onclick = async () => {
      const matchId = Number(btn.dataset.save);
      const inputs = matchesDiv.querySelectorAll(`[data-mid="${matchId}"]`);

      const payload = {};
      for (const inp of inputs) {
        payload[inp.dataset.field] = (inp.type === "number")
          ? (inp.value === "" ? null : Number(inp.value))
          : inp.value.trim();
      }

      if (payload.score_home === null || payload.score_away === null) {
        alert("Debes ingresar marcador oficial (local y visita).");
        return;
      }

      // 1) Actualiza match con resultado/qualified_team
      const { error: e1 } = await sb
        .from("matches")
        .update({
          score_home: payload.score_home,
          score_away: payload.score_away,
          qualified_team: payload.qualified_team ? payload.qualified_team : null
        })
        .eq("id", matchId);

      if (e1) { alert("Error guardando resultado: " + e1.message); return; }

      // 2) Ejecuta RPC todo-en-uno (finaliza + recalcula + refresca ranking público)
      const { error: e2 } = await sb.rpc("admin_finalize_match_and_recompute", { p_match_id: matchId });
      if (e2) { alert("Error recalculando puntos: " + e2.message); return; }

      alert("Listo ✅ Resultado guardado y puntos recalculados.");
      await loadMatches();
    };
  });
}

async function loadUsers() {
  usersDiv.textContent = "Cargando...";
  const { data, error } = await sb
    .from("profiles")
    .select("id, display_name, role")
    .order("created_at", { ascending: true });

  if (error) { usersDiv.textContent = "Error: " + error.message; return; }

  usersDiv.innerHTML = `
    <table>
      <thead><tr><th>Nombre</th><th>Rol</th><th>Acción</th></tr></thead>
      <tbody>
        ${data.map(u => `
          <tr>
            <td>${u.display_name}</td>
            <td>${u.role}</td>
            <td>
              ${u.role === "player"
                ? `<button class="secondary" data-promote="${u.id}">Hacer admin</button>`
                : `<span class="badge">Admin</span>`}
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  usersDiv.querySelectorAll("button[data-promote]").forEach(btn => {
    btn.onclick = async () => {
      const target = btn.dataset.promote;
      if (!confirm("¿Promover a admin?")) return;
      const { error } = await sb.rpc("promote_to_admin", { target_user_id: target });
      if (error) alert("Error: " + error.message);
      else { alert("Listo ✅"); await loadUsers(); }
    };
  });
}

reloadBtn.onclick = async () => {
  await loadMatches();
  await loadUsers();
};

stageSel.onchange = loadMatches;

await loadMatches();
await loadUsers();
