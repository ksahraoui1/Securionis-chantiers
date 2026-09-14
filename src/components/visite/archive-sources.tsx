"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function ArchiveSources({ visiteId, auteurId, archive, erreur, editable }: {
  visiteId: string; auteurId: string; archive: { id: string; mode: string; sha256: string; created_at: string } | null; erreur: boolean; editable: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [operationId] = useState(() => crypto.randomUUID());
  async function archiver() {
    setBusy(true); setMessage("");
    try {
      const res = await fetch(`/api/visites/${visiteId}/archive`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operationId, auteurId, empreinte: null }) });
      const data = await res.json();
      if (!res.ok || !data.archiveId) throw new Error(data.error || "Archivage non confirmé.");
      setMessage("Sources archivées. Les rapports existants sont conservés."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Archive indisponible."); }
    finally { setBusy(false); }
  }
  return <section className="my-6 rounded-lg border border-gray-300 bg-white p-4" aria-label="Sources archivées">
    <h2 className="text-lg font-semibold">Sources de la visite</h2>
    {erreur ? <p className="text-red-700">Lecture de l’archive indisponible. Réessayez avant de générer un rapport.</p> : archive ? <>
      <p className="mt-2 text-sm">{archive.mode === "cloture" ? "Sources figées lors de la clôture." : "Reprise historique : sources disponibles à la date de copie, sans preuve de leur état lors de la visite."}</p>
      <p className="text-sm text-gray-600">Archivées le {new Date(archive.created_at).toLocaleString("fr-CH")}.</p>
      <div className="mt-3 flex flex-wrap gap-4 text-sm text-blue-700 underline"><a href={`/api/visites/${visiteId}/archive`}>Télécharger le manifeste</a><a href={`/api/visites/${visiteId}/archive?format=zip`}>Télécharger les sources et fichiers (ZIP)</a></div>
      <details className="mt-2 text-xs text-gray-600"><summary>Empreinte de l’archive</summary><code className="break-all">{archive.sha256}</code></details>
    </> : <>
      <p className="mt-2 text-sm text-gray-700">Cette ancienne visite ne possède pas d’archive complète des sources. Une reprise conservera les données, le référentiel et les fichiers disponibles aujourd’hui, avec la date de copie. Les PDF déjà publiés restent accessibles dans l’historique.</p>
      {editable && <button onClick={archiver} disabled={busy} className="mt-3 rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? "Copie des sources en cours…" : "Archiver les sources actuelles"}</button>}
    </>}
    {message && <p className="mt-2 text-sm" role="status">{message}</p>}
  </section>;
}
