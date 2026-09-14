"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { useOfflineScope } from "@/components/ui/offline-provider";
import { archiveUnusedPhotos, pendingPhotoPath, readLocalSnapshot, type LocalSnapshot } from "@/lib/offline/db";
import { createOfflineBackup } from "@/lib/offline/backup";
import { applyBackupImport, prepareBackupImport, type PreparedImport } from "@/lib/offline/import-backup";
import { compareResponse, resolveResponse, type ResponseComparison, type ResponseContent } from "@/lib/offline/resolution";
import { createOfflineClient } from "@/lib/offline/client";
import { referenceStockage } from "@/lib/utils/storage-reference";
import { signerUrl } from "@/lib/utils/url-signee";

const labels: Record<string, string> = { conforme: "Conforme", non_conforme: "Non conforme", pas_necessaire: "Pas nécessaire", remarques: "Remarques" };
const empty: LocalSnapshot = { responses: [], recovery: [], photos: [], copies: [] };
function message(error: unknown) { return error instanceof Error ? error.message : "Opération impossible. Les copies sont conservées."; }
function date(value: string) { const d = new Date(value); return Number.isNaN(d.getTime()) ? "Date inconnue" : d.toLocaleString("fr-CH"); }
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function GestionSaisies() {
  const scope = useOfflineScope();
  const [snapshot, setSnapshot] = useState<LocalSnapshot>(empty);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [comparison, setComparison] = useState<ResponseComparison | null>(null);
  const [merge, setMerge] = useState<ResponseContent | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [prepared, setPrepared] = useState<PreparedImport | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    const data = await readLocalSnapshot(scope); setSnapshot(data);
    const points = [...new Set([...data.responses.filter(r => r.synced === 0), ...data.recovery].map(r => r.point_controle_id))];
    if (navigator.onLine && points.length) {
      try {
        const client = await createOfflineClient(scope);
        const result = await client.from("points_controle").select("id,intitule").in("id", points);
        if (!scope.signal.aborted && !result.error) setTitles(Object.fromEntries((result.data ?? []).map(p => [p.id, p.intitule])));
      } catch { /* La liste locale reste consultable sans connexion. */ }
    }
  }, [scope]);
  useEffect(() => { void refresh().catch(err => setError(message(err))); }, [refresh]);
  useEffect(() => {
    let active = true; const localUrls: string[] = [];
    setPreviews({});
    if (comparison) void (async () => {
      const all = [...new Set([...comparison.drafts.flatMap(d => d.photos), ...(comparison.remote?.photos ?? [])])];
      const client = await createOfflineClient(scope);
      const results = await Promise.all(all.map(async url => {
        const path = referenceStockage(url)?.chemin;
        const local = snapshot.photos.find(p => pendingPhotoPath(p) === path);
        if (local) { const preview = URL.createObjectURL(local.blob); localUrls.push(preview); return [url, preview]; }
        return [url, (await signerUrl(client, url)) ?? ""];
      }));
      if (active && !scope.signal.aborted) setPreviews(Object.fromEntries(results));
      else localUrls.forEach(url => URL.revokeObjectURL(url));
    })().catch(() => { /* Une photo non accessible reste signalée sans URL externe de secours. */ });
    return () => { active = false; localUrls.forEach(url => URL.revokeObjectURL(url)); };
  }, [comparison, scope, snapshot.photos]);
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(null); setNotice(null);
    try { await action(); } catch (err) { if (!scope.signal.aborted) setError(message(err)); }
    finally { if (!scope.signal.aborted) setBusy(false); }
  }
  async function open(key: string) {
    await run(async () => {
      const current = await readLocalSnapshot(scope); setSnapshot(current);
      const result = await compareResponse(scope, key, current); setComparison(result);
      const chosen = result.drafts[0] ?? result.remote;
      setMerge(chosen ? { valeur: chosen.valeur, remarque: chosen.remarque, photos: [...chosen.photos] } : null);
    });
  }
  async function choose(decision: Parameters<typeof resolveResponse>[2]) {
    if (!comparison) return;
    await run(async () => {
      try {
        const result = await resolveResponse(scope, comparison, decision);
        setNotice(result.sent ? "Choix enregistré sur le serveur. Les brouillons précédents restent dans vos copies locales." : "Saisies classées dans vos copies locales. Aucune réponse serveur n’a été supprimée.");
        setComparison(null); setMerge(null);
      } finally { await refresh(); }
    });
  }
  async function exportCopy(id?: string) {
    await run(async () => download(await createOfflineBackup(scope, id), `securionis-saisies-${new Date().toISOString().slice(0, 10)}.json`));
  }
  const drafts = [...snapshot.responses.filter(r => r.synced === 0), ...snapshot.recovery];
  const keys = [...new Set(drafts.map(r => r.key))];
  const visibleCopies = snapshot.copies.filter(c => c.responses.length || c.photos.length);
  const photos = comparison ? [...new Set([...comparison.drafts.flatMap(d => d.photos), ...(comparison.remote?.photos ?? [])])] : [];
  const button = "min-h-11 rounded border border-blue-300 px-3 py-2 text-sm font-medium text-blue-800 disabled:opacity-50";
  const primary = "min-h-11 rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
  function content(value: ResponseContent) {
    return <><p className="font-semibold">{labels[value.valeur] ?? "Constat inconnu"}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm">{value.remarque || "Aucune remarque"}</p><p className="mt-2 text-xs text-gray-500">{value.photos.length} photo(s)</p>
      {!!value.photos.length && <div className="mt-2 grid grid-cols-2 gap-2">{value.photos.map((url, index) => previews[url]
        ? <Image key={url} unoptimized src={previews[url]} width={160} height={120} className="h-28 w-full object-contain" alt={`Photo ${index + 1} de cette version`} onError={() => setPreviews(current => ({ ...current, [url]: "" }))} />
        : <span key={url} className="text-xs text-gray-500">Photo {index + 1} : aperçu indisponible, référence conservée.</span>)}</div>}</>;
  }
  return <div className="mx-auto max-w-5xl space-y-6">
    <header><h1 className="text-2xl font-bold">Saisies conservées</h1><p className="mt-2 text-gray-600">Comparez les versions avant de reprendre un envoi. Les copies restent liées à votre compte et à votre entreprise sur cet appareil.</p></header>
    {error && <p role="alert" className="rounded bg-red-50 p-3 text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded bg-green-50 p-3 text-green-800">{notice}</p>}
    <div className="flex flex-wrap gap-3">
      <button className={button} disabled={busy} onClick={() => void run(refresh)}>Actualiser la liste</button>
      <button className={button} disabled={busy} onClick={() => void exportCopy()}>Exporter toutes mes copies</button>
      <label className={`${button} cursor-pointer`}>Importer une sauvegarde<input type="file" accept=".json,application/json" disabled={busy} className="sr-only" onChange={e => {
        const file = e.target.files?.[0]; e.target.value = "";
        if (file) { setPrepared(null); void run(async () => setPrepared(await prepareBackupImport(scope, file))); }
      }} /></label>
    </div>
    {prepared && <section className="rounded border bg-blue-50 p-4" aria-label="Vérification de la sauvegarde">
      <p>{prepared.responses.length} saisie(s), {prepared.photos.length} photo(s) et {prepared.copies.length} copie(s) archivées. Le compte et l’entreprise correspondent.</p>
      <p className="mt-2 text-sm">Les saisies importées demanderont une comparaison. Elles ne remplaceront pas vos saisies actuelles.</p>
      <div className="mt-3 flex gap-3"><button className={primary} disabled={busy} onClick={() => void run(async () => {
        const imported = await applyBackupImport(scope, prepared); setPrepared(null); await refresh();
        setNotice(imported ? "Sauvegarde importée. Comparez les saisies avant de les envoyer." : "Cette sauvegarde a déjà été importée.");
      })}>Confirmer l’importation</button><button className={button} disabled={busy} onClick={() => setPrepared(null)}>Annuler</button></div>
    </section>}
    <section aria-label="Saisies en attente"><h2 className="text-lg font-semibold">{keys.length} constat(s) à reprendre</h2>
      {!keys.length && <p className="mt-2 text-gray-600">Aucune saisie en attente sur cet appareil.</p>}
      <ul className="mt-3 space-y-2">{keys.map(key => {
        const rows = drafts.filter(r => r.key === key), first = rows[0];
        return <li key={key} className="flex flex-wrap items-center justify-between gap-3 rounded border p-3"><div><p className="font-medium">{titles[first.point_controle_id] ?? "Saisie à récupérer"}</p><p className="text-sm text-gray-500">{rows.length} brouillon(s) · {date(first.updated_at)}</p></div><button className={button} disabled={busy} onClick={() => void open(key)}>Comparer les versions</button></li>;
      })}</ul>
    </section>
    {comparison && <section className="space-y-4 rounded-xl border-2 border-blue-300 bg-white p-4 sm:p-6" aria-label="Comparaison des versions">
      <div><h2 className="text-xl font-semibold">{comparison.title}</h2><p className="text-sm text-gray-500">{comparison.visitLabel} · {comparison.closed ? "Visite clôturée" : "Visite ouverte"}</p><a className="text-sm text-blue-700 underline" href={`/chantiers/${comparison.chantier_id}/visites/${comparison.visite_id}${comparison.closed ? "/rapport" : ""}`}>Ouvrir la visite</a></div>
      {comparison.closed && <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">La visite est clôturée. Les constats serveur restent figés ; conservez les brouillons pour préparer un avenant.</p>}
      <p className="text-sm text-gray-600">Votre choix traitera les {comparison.drafts.length} brouillon(s) affichés pour ce constat. Leurs anciennes valeurs et photos resteront dans les copies locales.</p>
      <div className="grid gap-4 md:grid-cols-2">
        <article className="rounded border bg-gray-50 p-4"><h3 className="mb-3 font-semibold">Version serveur</h3>{comparison.remote ? content(comparison.remote) : <p>Aucune réponse enregistrée.</p>}
          {comparison.remote && <button className={`${button} mt-4`} disabled={busy} onClick={() => void choose({ type: "server" })}>Conserver la version serveur</button>}
        </article>
        {comparison.drafts.map((draft, index) => <article key={draft.revision} className="rounded border bg-amber-50 p-4"><h3 className="mb-3 font-semibold">Brouillon local {index + 1}</h3>{content(draft)}
          {!comparison.closed && <div className="mt-4 flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={() => void choose({ type: "content", content: draft })}>Utiliser cette saisie</button><button className={button} disabled={busy} onClick={() => setMerge({ valeur: draft.valeur, remarque: draft.remarque, photos: [...draft.photos] })}>Partir de ce brouillon pour fusionner</button></div>}
        </article>)}
      </div>
      {!comparison.closed && merge && <fieldset className="space-y-3 rounded border p-4" disabled={busy}><legend className="px-2 font-semibold">Fusionner les contenus</legend>
        <label className="block text-sm">Constat<select className="mt-1 block w-full rounded border p-2" value={merge.valeur} onChange={e => setMerge({ ...merge, valeur: e.target.value })}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="block text-sm">Remarque<textarea className="mt-1 block w-full rounded border p-2" rows={5} maxLength={20000} value={merge.remarque ?? ""} onChange={e => setMerge({ ...merge, remarque: e.target.value || null })} /></label>
        {!!photos.length && <div><p className="mb-2 text-sm">Photos à conserver — {merge.photos.length}/10</p><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{photos.map((url, index) => <label key={url} className="rounded border p-2 text-sm">
          {previews[url] ? <Image unoptimized src={previews[url]} width={160} height={120} className="mb-2 h-28 w-full object-contain" alt={`Photo ${index + 1} du constat`} /> : <span className="mb-2 block text-xs text-gray-500">Aperçu indisponible. La référence est conservée.</span>}
          <input type="checkbox" checked={merge.photos.includes(url)} onChange={e => setMerge({ ...merge, photos: e.target.checked ? [...merge.photos, url] : merge.photos.filter(p => p !== url) })} /> Photo {index + 1}<span className="block text-xs text-gray-500">{[...(comparison.remote?.photos.includes(url) ? ["Serveur"] : []), ...comparison.drafts.flatMap((d, i) => d.photos.includes(url) ? [`Brouillon ${i + 1}`] : [])].join(" · ")}</span>
        </label>)}</div></div>}
        <button className={primary} disabled={busy || merge.photos.length > 10} onClick={() => void choose({ type: "content", content: merge })}>Envoyer cette fusion</button>
      </fieldset>}
      <div className="flex flex-wrap gap-3"><button className={button} disabled={busy} onClick={() => void open(comparison.key)}>Actualiser la comparaison</button><button className={button} disabled={busy} onClick={() => void choose({ type: "archive" })}>Classer les brouillons sans nouvel envoi</button><button className={button} disabled={busy} onClick={() => { setComparison(null); setMerge(null); }}>Fermer</button></div>
      <p className="text-xs text-gray-500">Classer conserve les brouillons et leurs photos dans les copies locales. Cela n’annule pas un envoi déjà arrivé au serveur.</p>
    </section>}
    {!!snapshot.photos.length && <section className="rounded border p-4"><h2 className="font-semibold">{snapshot.photos.length} photo(s) conservées pour l’envoi</h2><p className="my-2 text-sm text-gray-600">Les photos associées à une saisie restent dans sa file. Les autres peuvent être classées dans une copie locale récupérable.</p><button className={button} disabled={busy} onClick={() => void run(async () => { const count = await archiveUnusedPhotos(scope, snapshot.photos.map(p => p.id)); await refresh(); setNotice(`${count} photo(s) sans saisie active classées dans les copies locales.`); })}>Classer les photos sans saisie active</button></section>}
    <section aria-label="Copies locales"><h2 className="text-lg font-semibold">Copies locales récupérables ({visibleCopies.length})</h2><p className="mt-1 text-sm text-gray-600">Ces copies ne bloquent pas la clôture. Exportez-les pour les conserver hors de cet appareil.</p>
      <ul className="mt-3 space-y-2">{[...visibleCopies].reverse().map(copy => <li key={copy.id} className="rounded border p-3"><p className="font-medium">{date(copy.created_at)} · {copy.responses.length} saisie(s), {copy.photos.length} photo(s)</p><div className="mt-2 flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={() => void exportCopy(copy.id)}>Exporter cette copie</button><button className={button} disabled={busy} onClick={() => void run(async () => { setPrepared(await prepareBackupImport(scope, await createOfflineBackup(scope, copy.id))); window.scrollTo({ top: 0, behavior: "smooth" }); })}>Reprendre cette copie</button></div></li>)}</ul>
    </section>
  </div>;
}
