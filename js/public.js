import { sb } from "./supabaseClient.js";

const board = document.getElementById("board");
const updated = document.getElementById("updated");

async function load() {
  board.textContent = "Cargando...";
  const { data, error } = await sb
    .from("public_leaderboard_cache")
    .select("display_name, points_total, exact_count, result_count, one_team_goals_count, qualified_count, updated_at")
    .order("points_total", { ascending: false })
    .order("exact_count", { ascending: false })
    .order("result_count", { ascending: false })
    .order("one_team_goals_count", { ascending: false })
    .order("qualified_count", { ascending: false })
    .order("display_name", { ascending: true });

  if (error) { board.textContent = "Error: " + error.message; return; }

  board.innerHTML = `
    <table>
      <thead><tr><th>#</th><th>Nombre</th><th>Puntos</th><th>Exactos</th><th>Resultado</th><th>1 equipo</th><th>Clasifica</th></tr></thead>
      <tbody>
        ${data.map((r,i)=>`
          <tr>
            <td>${i+1}</td>
            <td>${r.display_name}</td>
            <td>${r.points_total}</td>
            <td>${r.exact_count}</td>
            <td>${r.result_count}</td>
            <td>${r.one_team_goals_count}</td>
            <td>${r.qualified_count}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  const ts = data?.[0]?.updated_at;
  updated.textContent = ts ? `Última actualización: ${new Date(ts).toLocaleString("es-CO")}` : "";
}

await load();
setInterval(load, 60000);
