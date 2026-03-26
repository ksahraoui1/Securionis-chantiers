"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/modal";
import type { Tables } from "@/types/database";

const SOURCES = [
  { value: "suva", label: "SUVA" },
  { value: "otconst", label: "OTConst" },
  { value: "sia", label: "SIA" },
  { value: "oibt", label: "OIBT" },
  { value: "co", label: "CO" },
  { value: "rpac", label: "RPAC" },
  { value: "autre", label: "Autre" },
];

const SOURCE_MAP = Object.fromEntries(SOURCES.map((s) => [s.value, s.label]));

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function AdminDocumentsPage() {
  const [documents, setDocuments] = useState<Tables<"base_documentaire">[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSource, setFilterSource] = useState("");
  const [search, setSearch] = useState("");

  // Upload form
  const [showUpload, setShowUpload] = useState(false);
  const [uploadTitre, setUploadTitre] = useState("");
  const [uploadSource, setUploadSource] = useState("autre");
  const [uploadRef, setUploadRef] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Edit modal
  const [editDoc, setEditDoc] = useState<Tables<"base_documentaire"> | null>(null);
  const [editTitre, setEditTitre] = useState("");
  const [editSource, setEditSource] = useState("autre");
  const [editRef, setEditRef] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Email modal
  const [emailDocId, setEmailDocId] = useState<string | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  // Liaison modal
  const [linkDocId, setLinkDocId] = useState<string | null>(null);
  const [linkPoints, setLinkPoints] = useState<{ id: string; intitule: string; linked: boolean }[]>([]);
  const [linkSearch, setLinkSearch] = useState("");
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkedCount, setLinkedCount] = useState<Record<string, number>>({});

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    let query = supabase
      .from("base_documentaire")
      .select("*")
      .order("updated_at", { ascending: false });

    if (filterSource) query = query.eq("source", filterSource);

    const { data } = await query;
    if (data) setDocuments(data);

    // Load linked counts
    const { data: liens } = await supabase
      .from("point_controle_doc_liens")
      .select("document_id");
    if (liens) {
      const counts: Record<string, number> = {};
      liens.forEach((l) => { counts[l.document_id] = (counts[l.document_id] ?? 0) + 1; });
      setLinkedCount(counts);
    }

    setLoading(false);
  }, [filterSource]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  async function handleUpload() {
    if (!uploadFile || !uploadTitre.trim()) return;
    setUploading(true);
    setError(null);

    try {
      const supabase = createClient();
      const ext = uploadFile.name.split(".").pop()?.toLowerCase() ?? "pdf";
      const typeFichier = ["jpg", "jpeg"].includes(ext) ? "jpeg" : ext === "png" ? "png" : "pdf";
      const path = `base-documentaire/${crypto.randomUUID()}.${ext}`;

      const { error: storageError } = await supabase.storage
        .from("rapports")
        .upload(path, uploadFile, { contentType: uploadFile.type, upsert: false });
      if (storageError) throw new Error(storageError.message);

      const { data: { publicUrl } } = supabase.storage.from("rapports").getPublicUrl(path);

      const { error: dbError } = await supabase.from("base_documentaire").insert({
        titre: uploadTitre.trim(),
        source: uploadSource,
        reference: uploadRef.trim() || null,
        description: uploadDesc.trim() || null,
        fichier_url: publicUrl,
        fichier_nom: uploadFile.name,
        fichier_taille: uploadFile.size,
        type_fichier: typeFichier,
      });
      if (dbError) throw new Error(dbError.message);

      setShowUpload(false);
      setUploadTitre("");
      setUploadSource("autre");
      setUploadRef("");
      setUploadDesc("");
      setUploadFile(null);
      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'upload");
    } finally {
      setUploading(false);
    }
  }

  function openEdit(doc: Tables<"base_documentaire">) {
    setEditDoc(doc);
    setEditTitre(doc.titre);
    setEditSource(doc.source);
    setEditRef(doc.reference ?? "");
    setEditDesc(doc.description ?? "");
  }

  async function handleSaveEdit() {
    if (!editDoc || !editTitre.trim()) return;
    setSavingEdit(true);
    const supabase = createClient();
    await supabase
      .from("base_documentaire")
      .update({
        titre: editTitre.trim(),
        source: editSource,
        reference: editRef.trim() || null,
        description: editDesc.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", editDoc.id);
    setEditDoc(null);
    setSavingEdit(false);
    await loadDocuments();
  }

  function openEmail(doc: Tables<"base_documentaire">) {
    setEmailDocId(doc.id);
    setEmailTo("");
    setEmailSubject(`Document : ${doc.titre}`);
    setEmailSent(false);
  }

  async function handleSendEmail() {
    if (!emailDocId || !emailTo.trim()) return;
    setSendingEmail(true);

    try {
      const res = await fetch("/api/documents/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: emailDocId,
          to: emailTo.trim(),
          subject: emailSubject.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Erreur d'envoi");
      }

      setEmailSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur d'envoi email");
    } finally {
      setSendingEmail(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer ce document de la bibliothèque ?")) return;
    const supabase = createClient();
    const doc = documents.find((d) => d.id === id);
    if (doc) {
      const storagePath = doc.fichier_url.split("/rapports/")[1];
      if (storagePath) await supabase.storage.from("rapports").remove([storagePath]);
    }
    await supabase.from("base_documentaire").delete().eq("id", id);
    await loadDocuments();
  }

  // Liaison
  async function openLinkModal(docId: string) {
    setLinkDocId(docId);
    setLinkSearch("");
    setLinkLoading(true);

    const supabase = createClient();
    const { data: allPoints } = await supabase
      .from("points_controle")
      .select("id, intitule")
      .eq("actif", true)
      .not("theme_id", "is", null)
      .order("intitule")
      .limit(500);

    const { data: existingLiens } = await supabase
      .from("point_controle_doc_liens")
      .select("point_controle_id")
      .eq("document_id", docId);

    const linkedIds = new Set(existingLiens?.map((l) => l.point_controle_id) ?? []);

    setLinkPoints(
      (allPoints ?? []).map((p) => ({
        id: p.id,
        intitule: p.intitule,
        linked: linkedIds.has(p.id),
      }))
    );
    setLinkLoading(false);
  }

  async function toggleLink(pointId: string) {
    if (!linkDocId) return;
    const supabase = createClient();
    const point = linkPoints.find((p) => p.id === pointId);
    if (!point) return;

    if (point.linked) {
      await supabase
        .from("point_controle_doc_liens")
        .delete()
        .eq("document_id", linkDocId)
        .eq("point_controle_id", pointId);
    } else {
      await supabase
        .from("point_controle_doc_liens")
        .insert({ document_id: linkDocId, point_controle_id: pointId });
    }

    setLinkPoints((prev) =>
      prev.map((p) => (p.id === pointId ? { ...p, linked: !p.linked } : p))
    );
  }

  const filtered = search
    ? documents.filter(
        (d) =>
          d.titre.toLowerCase().includes(search.toLowerCase()) ||
          d.reference?.toLowerCase().includes(search.toLowerCase()) ||
          d.description?.toLowerCase().includes(search.toLowerCase())
      )
    : documents;

  const filteredLinkPoints = linkSearch
    ? linkPoints.filter((p) => p.intitule.toLowerCase().includes(linkSearch.toLowerCase()))
    : linkPoints;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Base documentaire</h1>
          <p className="text-sm text-gray-500 mt-1">
            {documents.length} document{documents.length > 1 ? "s" : ""} — PDF, schémas, guides réglementaires
          </p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="px-4 py-3 min-h-touch bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 text-sm"
        >
          + Ajouter un document
        </button>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Source</label>
            <select
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-touch"
            >
              <option value="">Toutes les sources</option>
              {SOURCES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Recherche</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par titre, référence..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-touch"
            />
          </div>
        </div>
      </div>

      {/* Upload form */}
      {showUpload && (
        <div className="bg-white rounded-lg border-2 border-blue-200 p-4 mb-4 space-y-3">
          <h3 className="font-semibold text-sm">Nouveau document</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Titre *</label>
              <input
                type="text"
                value={uploadTitre}
                onChange={(e) => setUploadTitre(e.target.value)}
                placeholder="Ex: Feuillet SUVA 67003 — Scies circulaires"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-touch"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Source</label>
              <select
                value={uploadSource}
                onChange={(e) => setUploadSource(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-touch"
              >
                {SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Référence</label>
              <input
                type="text"
                value={uploadRef}
                onChange={(e) => setUploadRef(e.target.value)}
                placeholder="Ex: 67003, Art. 22, RS 832.30"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-touch"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
              <input
                type="text"
                value={uploadDesc}
                onChange={(e) => setUploadDesc(e.target.value)}
                placeholder="Description optionnelle..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-touch"
              />
            </div>
          </div>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setUploadFile(f);
                  if (!uploadTitre) setUploadTitre(f.name.replace(/\.[^/.]+$/, ""));
                }
              }}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full py-4 min-h-touch border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined">cloud_upload</span>
              {uploadFile ? uploadFile.name : "Choisir un fichier (PDF, JPEG, JPG, PNG)"}
            </button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => { setShowUpload(false); setUploadFile(null); setError(null); }}
              className="px-4 py-2 min-h-touch text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleUpload}
              disabled={!uploadFile || !uploadTitre.trim() || uploading}
              className="px-4 py-2 min-h-touch text-sm bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {uploading ? "Upload..." : "Enregistrer"}
            </button>
          </div>
        </div>
      )}

      {/* Documents list */}
      {loading ? (
        <p className="text-gray-500 py-8 text-center">Chargement...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-gray-400 text-3xl">folder_open</span>
          </div>
          <p className="text-gray-500">Aucun document dans la bibliothèque</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((doc) => {
            const isImage = ["jpeg", "jpg", "png"].includes(doc.type_fichier);
            return (
              <div key={doc.id} className="bg-white rounded-lg border border-gray-200 p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-start gap-3">
                  {/* Icon / Preview */}
                  <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
                    {isImage ? (
                      <img src={doc.fichier_url} alt="" className="w-full h-full object-cover rounded-lg" />
                    ) : (
                      <span className="material-symbols-outlined text-red-500 text-xl">picture_as_pdf</span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
                        {SOURCE_MAP[doc.source] ?? doc.source}
                      </span>
                      {doc.reference && (
                        <span className="text-[10px] text-gray-400">{doc.reference}</span>
                      )}
                      {linkedCount[doc.id] && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-700">
                          {linkedCount[doc.id]} point{linkedCount[doc.id] > 1 ? "s" : ""} lié{linkedCount[doc.id] > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <p className="font-medium text-sm text-gray-900 truncate">{doc.titre}</p>
                    {doc.description && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">{doc.description}</p>
                    )}
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {doc.fichier_nom} · {formatSize(doc.fichier_taille)} · {new Date(doc.updated_at).toLocaleDateString("fr-CH")}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <a
                      href={doc.fichier_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 min-h-touch min-w-touch flex items-center justify-center text-blue-600 hover:bg-blue-50 rounded-lg"
                      title="Ouvrir"
                    >
                      <span className="material-symbols-outlined text-lg">open_in_new</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => openEdit(doc)}
                      className="p-2 min-h-touch min-w-touch flex items-center justify-center text-gray-600 hover:bg-gray-50 rounded-lg"
                      title="Modifier"
                    >
                      <span className="material-symbols-outlined text-lg">edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openEmail(doc)}
                      className="p-2 min-h-touch min-w-touch flex items-center justify-center text-amber-600 hover:bg-amber-50 rounded-lg"
                      title="Envoyer par email"
                    >
                      <span className="material-symbols-outlined text-lg">mail</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openLinkModal(doc.id)}
                      className="p-2 min-h-touch min-w-touch flex items-center justify-center text-green-600 hover:bg-green-50 rounded-lg"
                      title="Lier aux points de contrôle"
                    >
                      <span className="material-symbols-outlined text-lg">link</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(doc.id)}
                      className="p-2 min-h-touch min-w-touch flex items-center justify-center text-red-500 hover:bg-red-50 rounded-lg"
                      title="Supprimer"
                    >
                      <span className="material-symbols-outlined text-lg">delete</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal édition */}
      <Modal
        isOpen={!!editDoc}
        onClose={() => setEditDoc(null)}
        title="Modifier le document"
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Titre *</label>
            <input
              type="text"
              value={editTitre}
              onChange={(e) => setEditTitre(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-touch"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Source</label>
              <select
                value={editSource}
                onChange={(e) => setEditSource(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-touch"
              >
                {SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Référence</label>
              <input
                type="text"
                value={editRef}
                onChange={(e) => setEditRef(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-touch"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
            <textarea
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleSaveEdit}
              disabled={!editTitre.trim() || savingEdit}
              className="flex-1 py-3 min-h-touch bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
            >
              {savingEdit ? "Enregistrement..." : "Enregistrer"}
            </button>
            <button
              type="button"
              onClick={() => setEditDoc(null)}
              className="px-4 py-3 min-h-touch bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
            >
              Annuler
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal email */}
      <Modal
        isOpen={!!emailDocId}
        onClose={() => setEmailDocId(null)}
        title="Envoyer par email"
      >
        <div className="space-y-3">
          {emailSent ? (
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <span className="material-symbols-outlined text-green-600 text-3xl">check_circle</span>
              <p className="text-sm font-medium text-green-800 mt-2">Email envoyé avec succès</p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Destinataire *</label>
                <input
                  type="email"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="email@exemple.com"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-touch"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Objet</label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-touch"
                />
              </div>
            </>
          )}
          <div className="flex gap-2 pt-1">
            {!emailSent && (
              <button
                type="button"
                onClick={handleSendEmail}
                disabled={!emailTo.trim() || sendingEmail}
                className="flex-1 py-3 min-h-touch bg-amber-600 text-white font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 text-sm flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-lg">send</span>
                {sendingEmail ? "Envoi..." : "Envoyer"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setEmailDocId(null)}
              className={`${emailSent ? "flex-1" : ""} px-4 py-3 min-h-touch bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm`}
            >
              Fermer
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal liaison */}
      <Modal
        isOpen={!!linkDocId}
        onClose={() => setLinkDocId(null)}
        title="Lier aux points de contrôle"
      >
        <div className="space-y-3">
          <input
            type="text"
            value={linkSearch}
            onChange={(e) => setLinkSearch(e.target.value)}
            placeholder="Rechercher un point de contrôle..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-touch"
          />
          <p className="text-xs text-gray-500">
            {linkPoints.filter((p) => p.linked).length} point{linkPoints.filter((p) => p.linked).length > 1 ? "s" : ""} lié{linkPoints.filter((p) => p.linked).length > 1 ? "s" : ""}
          </p>
          {linkLoading ? (
            <p className="text-gray-400 text-center py-4">Chargement...</p>
          ) : (
            <div className="max-h-80 overflow-y-auto space-y-1">
              {filteredLinkPoints
                .sort((a, b) => (a.linked === b.linked ? 0 : a.linked ? -1 : 1))
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleLink(p.id)}
                    className={`w-full flex items-center gap-2 p-2 rounded-lg text-left text-sm transition-colors ${
                      p.linked ? "bg-green-50 border border-green-200" : "hover:bg-gray-50 border border-transparent"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                        p.linked ? "bg-green-600 border-green-600" : "border-gray-300"
                      }`}
                    >
                      {p.linked && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className={p.linked ? "text-green-800" : "text-gray-700"}>{p.intitule}</span>
                  </button>
                ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => { setLinkDocId(null); loadDocuments(); }}
            className="w-full py-3 min-h-touch bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 text-sm"
          >
            Fermer
          </button>
        </div>
      </Modal>
    </div>
  );
}
