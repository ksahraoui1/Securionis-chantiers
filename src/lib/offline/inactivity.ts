export const INACTIVITE_MAX_MS = 30 * 60 * 1000;
/** Protection locale de l'écran, distincte de l'expiration Auth côté serveur. */
export function surveillerInactivite(expirer: () => void, cible: Window = window, maintenant = Date.now) {
  let dernier = maintenant(), fini = false;
  const verifier = () => {
    if (!fini && maintenant() - dernier >= INACTIVITE_MAX_MS) { fini = true; expirer(); }
    return fini;
  };
  const interaction = (event: Event) => { if (event.isTrusted && !verifier()) dernier = maintenant(); };
  const evenements = ["pointerdown", "keydown", "wheel", "touchstart"];
  evenements.forEach(nom => cible.addEventListener(nom, interaction, { passive: true }));
  cible.document.addEventListener("visibilitychange", verifier);
  const timer = cible.setInterval(verifier, 15000);
  return () => {
    fini = true; cible.clearInterval(timer);
    evenements.forEach(nom => cible.removeEventListener(nom, interaction));
    cible.document.removeEventListener("visibilitychange", verifier);
  };
}
