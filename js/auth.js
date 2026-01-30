import { sb } from "./supabaseClient.js";

export async function getSession() {
  const { data } = await sb.auth.getSession();
  return data.session;
}

export async function signOut() {
  await sb.auth.signOut();
  window.location.href = "./index.html";
}

export async function signInWithMagicLink(email) {
  const emailRedirectTo = new URL("./app.html", window.location.href).toString();
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo }
  });
  if (error) throw error;
}

export function formatBogota(isoString) {
  const dt = new Date(isoString);
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "medium",
    timeStyle: "short"
  }).format(dt);
}
