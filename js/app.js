  // Si no tiene nombre (o es "Jugador"), pedirlo con modal (sin prompt)
  let displayName = (prof.display_name || "").trim();
  if (!displayName || displayName.toLowerCase() === "jugador") {
    displayName = await askNameAndSave();
  }

