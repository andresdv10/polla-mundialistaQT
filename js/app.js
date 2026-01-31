  // Si no tiene nombre (o es "Jugador"), pedirlo con modal (sin prompt)
  let displayName = (prof.display_name || "").trim();
  if (!displayName || displayName.toLowerCase() === "jugador") {
    displayName = await askNameAndSave();
  }
async function askNameAndSave() {
  const modal = document.getElementById("nameModal");
  const input = document.getElementById("nameInput");
  const btn = document.getElementById("saveNameBtn");
  const err = document.getElementById("nameErr");

  modal.style.display = "block";
  input.value = "";
  input.focus();

  return await new Promise((resolve) => {
    const cleanup = () => {
      btn.onclick = null;
      input.onkeydown = null;
    };

    const validate = (name) => {
      const n = name.trim();
      if (n.length < 2) return "Escribe al menos 2 letras.";
      if (n.length > 30) return "Máximo 30 caracteres.";
      // Solo letras/espacios (con acentos). Permite ñ, tildes.
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
        const { error } = await sb
          .from("profiles")
          .update({ display_name: name.trim() })
          .eq("id", session.user.id);

        if (error) throw error;

        modal.style.display = "none";
        cleanup();
        resolve(name.trim());
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

