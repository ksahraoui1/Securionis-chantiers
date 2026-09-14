import { assertOfflineScope, offlinePreferenceKey, type OfflineScope } from "@/lib/offline/scope";
import { validerDemandeAvenant, type DemandeAvenant } from "@/lib/visites/avenant";
export type BrouillonAvenant = {
  id: string; visiteId: string; userId: string; entrepriseId: string | null;
  objet: string; motif: string; contenu: string; updatedAt: string;
  demande: DemandeAvenant | null; publie: boolean;
};
function prefix(scope: OfflineScope, visiteId: string) { return offlinePreferenceKey(scope, `avenants:${visiteId}:`); }
export function sauverBrouillonAvenant(scope: OfflineScope, draft: BrouillonAvenant) {
  assertOfflineScope(scope);
  if (draft.userId !== scope.userId || draft.entrepriseId !== scope.entrepriseId || !/^[0-9a-f-]{36}$/i.test(draft.id) || !/^[0-9a-f-]{36}$/i.test(draft.visiteId)) throw new Error("Brouillon d’un autre compte ou identifiant invalide.");
  localStorage.setItem(prefix(scope, draft.visiteId) + draft.id, JSON.stringify(draft));
}
export function lireBrouillonsAvenant(scope: OfflineScope, visiteId: string): BrouillonAvenant[] {
  const start = prefix(scope, visiteId); const drafts: BrouillonAvenant[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i); if (!key?.startsWith(start)) continue;
    try {
      const d = JSON.parse(localStorage.getItem(key) || "null") as BrouillonAvenant;
      if (d && d.visiteId === visiteId && d.userId === scope.userId && d.entrepriseId === scope.entrepriseId && typeof d.objet === "string" && typeof d.motif === "string" && typeof d.contenu === "string" && typeof d.updatedAt === "string" && typeof d.publie === "boolean") {
        if (d.demande) { const demande = validerDemandeAvenant(d.demande); if (demande.id !== d.id || demande.auteurId !== scope.userId || demande.visiteId !== visiteId) continue; }
        drafts.push(d);
      }
    } catch { /* Une copie illisible reste stockée et n'est jamais supprimée. */ }
  }
  assertOfflineScope(scope); return drafts.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
}
