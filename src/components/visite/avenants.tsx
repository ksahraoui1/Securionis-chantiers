"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useOfflineScope } from "@/components/ui/offline-provider";
import { assertOfflineScope } from "@/lib/offline/scope";
import { lireBrouillonsAvenant, sauverBrouillonAvenant, type BrouillonAvenant } from "@/lib/offline/avenant";
import { validerDemandeAvenant, type Avenant, type DemandeAvenant } from "@/lib/visites/avenant";
import { Button } from "@/components/ui/button";
export function AvenantsVisite({ visiteId, archiveId, rapportReference, avenants, erreur, editable }: {
  visiteId: string; archiveId: string | null; rapportReference: string | null; avenants: Avenant[]; erreur: boolean; editable: boolean;
}) {
  const scope = useOfflineScope(); const router = useRouter();
  const [draft, setDraft] = useState<BrouillonAvenant | null>(null);
  const [copies, setCopies] = useState<BrouillonAvenant[]>([]);
  const [review, setReview] = useState<DemandeAvenant | null>(null);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  useEffect(() => { try { setCopies(lireBrouillonsAvenant(scope, visiteId)); } catch { setMessage("Les copies locales ne sont pas accessibles."); } }, [scope, visiteId]);
  function save(next: BrouillonAvenant) { sauverBrouillonAvenant(scope, next); setDraft(next); setCopies(lireBrouillonsAvenant(scope, visiteId)); }
  function newDraft(copy?: BrouillonAvenant) {
    try {
      assertOfflineScope(scope); setMessage(""); setReview(null);
      if (copy?.demande && !copy.publie) { setDraft(copy); setReview(copy.demande); return; }
      save({ id: crypto.randomUUID(), visiteId, userId: scope.userId, entrepriseId: scope.entrepriseId, objet: copy?.objet || "", motif: copy?.motif || "", contenu: copy?.contenu || "", updatedAt: new Date().toISOString(), demande: null, publie: false });
    } catch (e) { setMessage(e instanceof Error ? e.message : "Copie indisponible."); }
  }
  function edit(field: "objet" | "motif" | "contenu", value: string) {
    if (!draft || draft.demande) return;
    const next = { ...draft, [field]: value, updatedAt: new Date().toISOString() };
    setDraft(next);
    try { save(next); setMessage(""); } catch { setMessage("La sauvegarde locale a échoué. Copiez votre texte avant de quitter la page."); }
  }
  function prepare() {
    if (!draft) return;
    try { const demande = validerDemandeAvenant({ id: draft.id, visiteId, auteurId: scope.userId, archiveId, rapportReference, precedentId: avenants.at(-1)?.id ?? null, objet: draft.objet, motif: draft.motif, contenu: draft.contenu }); setReview(demande); setMessage(""); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Avenant incomplet."); }
  }
  async function publish() {
    if (!draft || !review) return;
    setBusy(true); setMessage("");
    try {
      assertOfflineScope(scope);
      const pending = { ...draft, demande: review, updatedAt: new Date().toISOString() };
      save(pending); // Conserver l'UUID et le contenu avant le premier octet réseau.
      const res = await fetch(`/api/visites/${visiteId}/avenants`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", signal: AbortSignal.any([scope.signal, AbortSignal.timeout(90_000)]), body: JSON.stringify(review) });
      assertOfflineScope(scope); const data = await res.json();
      if (!res.ok || data.id !== review.id) {
        if (data.refusConfirme === true) { sauverBrouillonAvenant(scope, { ...pending, demande: null }); save({ ...pending, id: crypto.randomUUID(), demande: null }); setReview(null); router.refresh(); }
        throw new Error(data.error || "Publication non confirmée. Réessayez la même demande.");
      }
      save({ ...pending, publie: true }); setDraft(null); setReview(null); router.refresh(); setMessage(`Avenant n° ${data.numero} conservé. Aucun email n’a été envoyé.`);
    } catch (e) { if (!scope.signal.aborted) setMessage(e instanceof Error ? e.message : "Publication non confirmée."); }
    finally { if (!scope.signal.aborted) setBusy(false); }
  }
  function exportDraft() {
    if (!draft) return;
    assertOfflineScope(scope); const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = `brouillon_avenant_${draft.id}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  return <section className="my-6 rounded-lg border border-gray-300 bg-white p-4" aria-label="Avenants de la visite">
    <h2 className="text-lg font-semibold">Avenants ({avenants.length})</h2>
    <p className="mt-2 text-sm text-gray-600">Un avenant documente une rectification ou un complément après clôture. Il conserve le rapport d’origine et l’historique. Il ne modifie pas automatiquement le suivi des non-conformités.</p>
    {erreur && <p className="mt-2 text-sm text-red-700">Historique indisponible. La validation et l’envoi sont suspendus.</p>}
    <ol className="mt-3 divide-y divide-gray-200">{avenants.map(a => <li key={a.id} className="py-3 text-sm"><p className="font-semibold">N° {a.numero} — {a.objet}</p><p>{a.auteur_nom} — {new Date(a.valide_le).toLocaleString("fr-CH")}</p><p className="mt-1">Motif : {a.motif}</p><details className="my-2"><summary>Lire le complément</summary><p className="mt-2 whitespace-pre-wrap">{a.contenu}</p></details><a className="text-blue-700 underline" href={`/api/visites/${visiteId}/avenants?avenantId=${a.id}`}>Télécharger cet avenant (PDF)</a><details className="mt-2 text-xs text-gray-500"><summary>Empreinte du PDF</summary><code className="break-all">{a.sha256}</code></details></li>)}</ol>
    {editable && !erreur && <div className="mt-3">{archiveId && rapportReference ? <Button onClick={()=>newDraft()} disabled={busy || !!draft?.demande}>Rédiger un avenant</Button> : <p className="text-sm text-amber-800">Archivez les sources et générez un rapport avant de valider un avenant.</p>}</div>}
    {copies.length > 0 && <details className="mt-4 text-sm"><summary>Mes copies locales conservées ({copies.length})</summary><ul>{copies.map(c => <li className="mt-2 flex items-center justify-between gap-2" key={c.id}><span>{c.objet || "Brouillon sans objet"} — {c.publie ? "publié" : c.demande ? "confirmation à vérifier" : "brouillon"}</span><Button size="sm" variant="secondary" disabled={busy} onClick={()=>newDraft(c)}>{c.demande && !c.publie ? "Vérifier la même demande" : "Reprendre une copie"}</Button></li>)}</ul></details>}
    {draft && <div className="mt-5 space-y-3 border-t pt-4">
      <p className="text-sm text-gray-600">Copie conservée sur cet appareil pour votre compte. Indiquez le constat ou l’avenant concerné, ce qui est rectifié et la formulation à retenir.</p>
      {review ? <div className="space-y-2 rounded bg-blue-50 p-3"><h3 className="font-semibold">Relire avant validation</h3><p className="font-medium">{review.objet}</p><p>Motif : {review.motif}</p><p className="whitespace-pre-wrap">{review.contenu}</p><p className="text-xs text-gray-600">La validation conserve définitivement cet avenant. Une rectification ultérieure demandera un nouvel avenant.</p><div className="flex flex-wrap gap-2"><Button onClick={publish} loading={busy} disabled={!editable || erreur}>{draft.demande ? "Vérifier / reprendre la publication" : "Valider et figer l’avenant"}</Button>{!draft.demande && <Button variant="secondary" onClick={()=>setReview(null)} disabled={busy}>Modifier le texte</Button>}</div></div> : <>
        <label className="block text-sm font-medium">Objet (5 à 200 caractères)<input className="mt-1 block w-full rounded border border-gray-400 p-2" maxLength={200} value={draft.objet} onChange={e=>edit("objet",e.target.value)} /></label>
        <label className="block text-sm font-medium">Motif (5 à 1 000 caractères)<textarea className="mt-1 block w-full rounded border border-gray-400 p-2" rows={2} maxLength={1000} value={draft.motif} onChange={e=>edit("motif",e.target.value)} /></label>
        <label className="block text-sm font-medium">Complément ou rectification (20 à 20 000 caractères)<textarea className="mt-1 block w-full rounded border border-gray-400 p-2" rows={7} maxLength={20000} value={draft.contenu} onChange={e=>edit("contenu",e.target.value)} /></label>
        <Button onClick={prepare} disabled={!editable || erreur}>Prévisualiser l’avenant</Button>
      </>}
      <Button variant="secondary" onClick={exportDraft} disabled={busy}>Exporter cette copie</Button>
    </div>}
    {message && <p className="mt-3 text-sm" role="status">{message}</p>}
  </section>;
}
