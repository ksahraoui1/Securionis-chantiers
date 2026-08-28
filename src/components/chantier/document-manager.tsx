"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { validateDocumentFile, getSafeExtension } from "@/lib/utils/file-validation";
import type { Tables } from "@/types/database";

interface DocumentManagerProps {
  chantierId: string;
  initialDocuments: Tables<"documents">[];
}

const CATEGORIES: { value: string; label: string; icon: string }[] = [
  { value: "permis", label: "Permis de construire", icon: "approval" },
  { value: "plan", label: "Plans", icon: "architecture" },
  { value: "rapport_eca", label: "Rapport ECA", icon: "local_fire_department" },
  { value: "autorisation", label: "Autorisation travaux", icon: "verified_user" },
  { value: "certificat", label: "Certificat entreprise", icon: "workspace_premium" },
  { value: "autre", label: "Autre", icon: "description" },
];

const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.value, c]));

type PlanType = "PE" | "EXE";

const PLAN_TYPES: Record<
  PlanType,
  { label: string; libelle: string; icon: string; couleur: string }
> = {
  PE: {
    label: "PE",
    libelle: "Plan d'enquête publique",
    icon: "verified",
    couleur: "#2E7D32",
  },
  EXE: {
    label: "EXE",
    libelle: "Plan d'exécution",
    icon: "engineering",
    couleur: "#E67E22",
  },
};

// Dernier plan d'un type donné (version la plus élevée)
function dernierPlan(
  docs: Tables<"documents">[],
  type: PlanType
): Tables<"documents"> | null {
  return (
    [...docs]
      .filter((d) => d.plan_type === type)
      .sort((a, b) => (b.plan_version ?? 0) - (a.plan_version ?? 0))[0] ?? null
  );
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function DocumentManager({ chantierId, initialDocuments }: DocumentManagerProps) {
  const [documents, setDocuments] = useState<Tables<"documents">[]>(initialDocuments);
  const [filter, setFilter] = useState("all");
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadNom, setUploadNom] = useState("");
  const [uploadCategorie, setUploadCategorie] = useState("autre");
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [planForm, setPlanForm] = useState<
    { docId: string; type: PlanType; version: string } | null
  >(null);
  const [savingPlan, setSavingPlan] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);

  const filtered = filter === "all"
    ? documents
    : documents.filter((d) => d.categorie === filter);

  const planPE = dernierPlan(documents, "PE");
  const planEXE = dernierPlan(documents, "EXE");

  const countByCategory = CATEGORIES.map((c) => ({
    ...c,
    count: documents.filter((d) => d.categorie === c.value).length,
  }));

  const loadDocuments = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("documents")
      .select("*")
      .eq("chantier_id", chantierId)
      .order("categorie")
      .order("nom");
    if (data) setDocuments(data);
  }, [chantierId]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
      if (!uploadNom) {
        setUploadNom(file.name.replace(/\.[^/.]+$/, ""));
      }
    }
  }

  async function handleUpload() {
    if (!uploadFile || !uploadNom.trim()) return;

    const validation = validateDocumentFile(uploadFile);
    if (!validation.valid) {
      setError(validation.error ?? "Fichier invalide");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const supabase = createClient();
      const ext = getSafeExtension(uploadFile.name);
      const path = `chantiers/${chantierId}/docs/${crypto.randomUUID()}.${ext}`;

      const { error: storageError } = await supabase.storage
        .from("rapports")
        .upload(path, uploadFile, { contentType: uploadFile.type, upsert: false });

      if (storageError) throw new Error(storageError.message);

      const { data: { publicUrl } } = supabase.storage.from("rapports").getPublicUrl(path);

      const { error: dbError } = await supabase.from("documents").insert({
        chantier_id: chantierId,
        nom: uploadNom.trim(),
        categorie: uploadCategorie,
        description: uploadDescription.trim() || null,
        fichier_url: publicUrl,
        fichier_nom: uploadFile.name,
        fichier_taille: uploadFile.size,
      });

      if (dbError) throw new Error(dbError.message);

      setShowUpload(false);
      setUploadNom("");
      setUploadCategorie("autre");
      setUploadDescription("");
      setUploadFile(null);
      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'upload");
    } finally {
      setUploading(false);
    }
  }

  async function handleReplace(docId: string, file: File) {
    const validation = validateDocumentFile(file);
    if (!validation.valid) {
      setError(validation.error ?? "Fichier invalide");
      return;
    }

    setError(null);
    setReplacingId(docId);

    try {
      const supabase = createClient();
      const doc = documents.find((d) => d.id === docId);
      if (!doc) return;

      const ext = getSafeExtension(file.name);
      const path = `chantiers/${chantierId}/docs/${crypto.randomUUID()}.${ext}`;

      const { error: storageError } = await supabase.storage
        .from("rapports")
        .upload(path, file, { contentType: file.type, upsert: false });

      if (storageError) throw new Error(storageError.message);

      const { data: { publicUrl } } = supabase.storage.from("rapports").getPublicUrl(path);

      const { error: dbError } = await supabase
        .from("documents")
        .update({
          fichier_url: publicUrl,
          fichier_nom: file.name,
          fichier_taille: file.size,
          version: doc.version + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", docId);

      if (dbError) throw new Error(dbError.message);

      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors du remplacement");
    } finally {
      setReplacingId(null);
    }
  }

  async function handleDelete(docId: string) {
    if (!confirm("Supprimer ce document ?")) return;

    const supabase = createClient();
    const doc = documents.find((d) => d.id === docId);
    if (doc) {
      const storagePath = doc.fichier_url.split("/rapports/")[1];
      if (storagePath) {
        await supabase.storage.from("rapports").remove([storagePath]);
      }
    }
    await supabase.from("documents").delete().eq("id", docId);
    await loadDocuments();
  }

  // Ouvre le formulaire de version en proposant la prochaine version libre
  function openPlanForm(docId: string, type: PlanType) {
    const doc = documents.find((d) => d.id === docId);
    const dernier = dernierPlan(documents, type);
    const proposee =
      doc?.plan_type === type && doc.plan_version
        ? doc.plan_version
        : (dernier?.plan_version ?? 0) + 1;
    setMenuId(null);
    setPlanForm({ docId, type, version: String(proposee) });
  }

  async function handleMarquerPlan() {
    if (!planForm) return;

    const version = Number.parseInt(planForm.version, 10);
    if (!Number.isInteger(version) || version < 1) {
      setError("Le numéro de version doit être un entier supérieur à 0.");
      return;
    }

    setSavingPlan(true);
    setError(null);

    try {
      // Chaîner sur la version précédente du même type, si elle existe
      const precedent =
        [...documents]
          .filter(
            (d) =>
              d.id !== planForm.docId &&
              d.plan_type === planForm.type &&
              (d.plan_version ?? 0) < version
          )
          .sort((a, b) => (b.plan_version ?? 0) - (a.plan_version ?? 0))[0] ?? null;

      const supabase = createClient();
      const { error: dbError } = await supabase
        .from("documents")
        .update({
          plan_type: planForm.type,
          plan_version: version,
          parent_version_id: precedent?.id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", planForm.docId);

      if (dbError) throw new Error(dbError.message);

      setPlanForm(null);
      await loadDocuments();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erreur lors du marquage du plan"
      );
    } finally {
      setSavingPlan(false);
    }
  }

  async function handleRetirerPlan(docId: string) {
    setMenuId(null);
    setError(null);

    const supabase = createClient();
    const { error: dbError } = await supabase
      .from("documents")
      .update({
        plan_type: null,
        plan_version: null,
        parent_version_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", docId);

    if (dbError) {
      setError(dbError.message);
      return;
    }
    await loadDocuments();
  }

  return (
    <div className="space-y-4">
      {/* Header + Upload button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">
            {documents.length} document{documents.length !== 1 ? "s" : ""}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowUpload(!showUpload)}
          className="inline-flex items-center gap-1 px-4 py-2 min-h-[44px] bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors text-sm"
        >
          <span translate="no" className="material-symbols-outlined text-lg">upload_file</span>
          Ajouter
        </button>
      </div>

      {/* Upload form */}
      {showUpload && (
        <div className="bg-gray-50 rounded-lg p-4 space-y-3 border border-gray-200">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Nom du document *
            </label>
            <input
              type="text"
              value={uploadNom}
              onChange={(e) => setUploadNom(e.target.value)}
              placeholder="Ex: Permis de construire n°2026-123"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 min-h-touch text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Catégorie
              </label>
              <select
                value={uploadCategorie}
                onChange={(e) => setUploadCategorie(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 min-h-touch text-sm"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Description (optionnel)
              </label>
              <input
                type="text"
                value={uploadDescription}
                onChange={(e) => setUploadDescription(e.target.value)}
                placeholder="Notes..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 min-h-touch text-sm"
              />
            </div>
          </div>

          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-4 min-h-[56px] rounded-lg border-2 border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors text-sm"
            >
              <span translate="no" className="material-symbols-outlined text-xl">cloud_upload</span>
              {uploadFile ? uploadFile.name : "Choisir un fichier (PDF, Word, Excel, Image)"}
            </button>
          </div>

          {error && (
            <p className="text-sm text-red-600 flex items-center gap-1">
              <span translate="no" className="material-symbols-outlined text-sm">error</span>
              {error}
            </p>
          )}

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
              disabled={!uploadFile || !uploadNom.trim() || uploading}
              className="px-4 py-2 min-h-touch text-sm bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {uploading ? "Envoi..." : "Enregistrer"}
            </button>
          </div>
        </div>
      )}

      {/* Plans de référence PE / EXE */}
      {(planPE || planEXE) && (
        <div className="flex flex-col sm:flex-row gap-2">
          {planPE && (
            <div className="flex-1 flex items-center gap-2 rounded-lg border border-[#2E7D32]/30 bg-[#2E7D32]/5 px-3 py-2 min-w-0">
              <span translate="no" className="material-symbols-outlined text-[#2E7D32] text-xl shrink-0">
                verified
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#2E7D32]">
                  Plan PE de référence
                </p>
                <p className="text-[11px] text-gray-600 truncate">
                  {planPE.nom}
                  {planPE.plan_version ? ` — V${planPE.plan_version}` : ""}
                </p>
              </div>
            </div>
          )}
          {planEXE && (
            <div className="flex-1 flex items-center gap-2 rounded-lg border border-[#E67E22]/30 bg-[#E67E22]/5 px-3 py-2 min-w-0">
              <span translate="no" className="material-symbols-outlined text-[#E67E22] text-xl shrink-0">
                engineering
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#E67E22]">
                  Plan EXE V{planEXE.plan_version ?? 1}
                </p>
                <p className="text-[11px] text-gray-600 truncate">{planEXE.nom}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Erreur hors formulaire d'upload */}
      {error && !showUpload && (
        <p className="text-sm text-red-600 flex items-center gap-1">
          <span translate="no" className="material-symbols-outlined text-sm">error</span>
          {error}
        </p>
      )}

      {/* Filters */}
      {documents.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <FilterPill
            label="Tous"
            count={documents.length}
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          {countByCategory
            .filter((c) => c.count > 0)
            .map((c) => (
              <FilterPill
                key={c.value}
                label={c.label}
                count={c.count}
                active={filter === c.value}
                onClick={() => setFilter(c.value)}
              />
            ))}
        </div>
      )}

      {/* Document list */}
      {filtered.length === 0 && documents.length === 0 && (
        <div className="text-center py-8">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <span translate="no" className="material-symbols-outlined text-gray-400 text-2xl">folder_open</span>
          </div>
          <p className="text-sm text-gray-500">
            Aucun document. Ajoutez des permis, plans ou certificats.
          </p>
        </div>
      )}

      {filtered.length === 0 && documents.length > 0 && (
        <p className="text-sm text-gray-500 text-center py-4">
          Aucun document dans cette catégorie.
        </p>
      )}

      <div className="space-y-2">
        {filtered.map((doc) => {
          const cat = CATEGORY_MAP[doc.categorie] ?? CATEGORY_MAP.autre;
          return (
            <div
              key={doc.id}
              className="bg-white rounded-lg border border-gray-200 p-4 flex items-start gap-3"
            >
              {/* Icon */}
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                <span translate="no" className="material-symbols-outlined text-blue-600 text-lg">
                  {cat.icon}
                </span>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">{doc.nom}</p>
                      {doc.plan_type && (
                        <span
                          className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                          style={{
                            color: PLAN_TYPES[doc.plan_type].couleur,
                            backgroundColor: `${PLAN_TYPES[doc.plan_type].couleur}1A`,
                          }}
                          title={PLAN_TYPES[doc.plan_type].libelle}
                        >
                          <span translate="no" className="material-symbols-outlined text-[12px]">
                            {PLAN_TYPES[doc.plan_type].icon}
                          </span>
                          {doc.plan_type}
                          {doc.plan_version ? ` V${doc.plan_version}` : ""}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[10px] font-medium text-gray-400 uppercase">
                        {cat.label}
                      </span>
                      {doc.version > 1 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                          v{doc.version}
                        </span>
                      )}
                      <span className="text-[10px] text-gray-400">
                        {formatFileSize(doc.fichier_taille)}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {new Date(doc.updated_at).toLocaleDateString("fr-CH")}
                      </span>
                    </div>
                    {doc.description && (
                      <p className="text-xs text-gray-500 mt-1">{doc.description}</p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 mt-2 flex-wrap">
                  <a
                    href={doc.fichier_url}
                    download={doc.fichier_nom}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-3 py-1.5 min-h-touch text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    <span translate="no" className="material-symbols-outlined text-sm">download</span>
                    Télécharger
                  </a>
                  <input
                    ref={replacingId === doc.id ? replaceRef : undefined}
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleReplace(doc.id, file);
                      e.target.value = "";
                    }}
                    className="hidden"
                    id={`replace-${doc.id}`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setReplacingId(doc.id);
                      const input = document.getElementById(`replace-${doc.id}`) as HTMLInputElement;
                      input?.click();
                    }}
                    disabled={replacingId === doc.id}
                    className="flex items-center gap-1 px-3 py-1.5 min-h-touch text-xs font-medium bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-50"
                  >
                    <span translate="no" className="material-symbols-outlined text-sm">
                      {replacingId === doc.id ? "hourglass_top" : "sync"}
                    </span>
                    {replacingId === doc.id ? "Envoi..." : "Nouvelle version"}
                  </button>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setMenuId(menuId === doc.id ? null : doc.id)}
                      aria-haspopup="menu"
                      aria-expanded={menuId === doc.id}
                      className="flex items-center justify-center min-h-touch min-w-touch p-1.5 text-xs text-[#002855] rounded-lg hover:bg-[#002855]/10 transition-colors"
                      title="Actions du plan"
                    >
                      <span translate="no" className="material-symbols-outlined text-sm">more_vert</span>
                    </button>
                    {menuId === doc.id && (
                      <>
                        {/* Fermeture au clic extérieur */}
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setMenuId(null)}
                        />
                        <div
                          role="menu"
                          className="absolute left-0 z-20 mt-1 w-60 rounded-lg border border-gray-200 bg-white shadow-lg py-1"
                        >
                          {(Object.keys(PLAN_TYPES) as PlanType[]).map((type) => (
                            <button
                              key={type}
                              type="button"
                              role="menuitem"
                              onClick={() => openPlanForm(doc.id, type)}
                              className="w-full flex items-center gap-2 px-3 py-2 min-h-touch text-xs font-medium text-[#002855] hover:bg-gray-50 text-left"
                            >
                              <span
                                translate="no"
                                className="material-symbols-outlined text-base"
                                style={{ color: PLAN_TYPES[type].couleur }}
                              >
                                {PLAN_TYPES[type].icon}
                              </span>
                              Marquer comme plan {type}
                            </button>
                          ))}
                          {doc.plan_type && (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => handleRetirerPlan(doc.id)}
                              className="w-full flex items-center gap-2 px-3 py-2 min-h-touch text-xs font-medium text-gray-600 hover:bg-gray-50 text-left border-t border-gray-100"
                            >
                              <span translate="no" className="material-symbols-outlined text-base">
                                backspace
                              </span>
                              Retirer le marquage
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(doc.id)}
                    className="flex items-center justify-center min-h-touch min-w-touch p-1.5 text-xs text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <span translate="no" className="material-symbols-outlined text-sm">delete</span>
                  </button>
                </div>

                {/* Numéro de version du plan */}
                {planForm?.docId === doc.id && (
                  <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs font-semibold text-[#002855] mb-2">
                      {PLAN_TYPES[planForm.type].libelle} ({planForm.type})
                    </p>
                    <div className="flex items-end gap-2 flex-wrap">
                      <div>
                        <label
                          htmlFor={`plan-version-${doc.id}`}
                          className="block text-xs font-medium text-gray-500 mb-1"
                        >
                          Numéro de version
                        </label>
                        <input
                          id={`plan-version-${doc.id}`}
                          type="number"
                          min={1}
                          step={1}
                          value={planForm.version}
                          onChange={(e) =>
                            setPlanForm({ ...planForm, version: e.target.value })
                          }
                          className="w-24 rounded-lg border border-gray-300 px-3 py-2 min-h-touch text-sm"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleMarquerPlan}
                        disabled={savingPlan}
                        className="px-4 py-2 min-h-touch text-xs font-medium bg-[#002855] text-white rounded-lg hover:bg-[#002855]/90 disabled:opacity-50 transition-colors"
                      >
                        {savingPlan ? "Enregistrement..." : "Enregistrer"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPlanForm(null)}
                        className="px-4 py-2 min-h-touch text-xs font-medium bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FilterPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap min-h-touch transition-colors ${
        active
          ? "bg-blue-600 text-white"
          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
      }`}
    >
      {label}
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
        active ? "bg-white/20" : "bg-white"
      }`}>
        {count}
      </span>
    </button>
  );
}
