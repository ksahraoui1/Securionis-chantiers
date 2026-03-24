"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/types/database";

interface PointControleFormProps {
  initialData?: Tables<"points_controle"> | null;
  onSaved: () => void;
  onCancel: () => void;
}

export function PointControleForm({
  initialData,
  onSaved,
  onCancel,
}: PointControleFormProps) {
  const [categories, setCategories] = useState<Tables<"categories">[]>([]);
  const [themes, setThemes] = useState<Tables<"themes">[]>([]);
  const [categorieId, setCategorieId] = useState(initialData?.categorie_id ?? "");
  const [themeId, setThemeId] = useState(initialData?.theme_id ?? "");
  const [newTheme, setNewTheme] = useState("");
  const [showNewTheme, setShowNewTheme] = useState(false);
  const [intitule, setIntitule] = useState(initialData?.intitule ?? "");
  const [critere, setCritere] = useState(initialData?.critere ?? "");
  const [baseLegale, setBaseLegale] = useState(initialData?.base_legale ?? "");
  const [explications, setExplications] = useState(initialData?.explications ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Documents PDF
  const [docs, setDocs] = useState<Tables<"point_controle_documents">[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load categories (new ones: phase_id IS NULL)
  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from("categories")
        .select("*")
        .is("phase_id", null)
        .eq("actif", true)
        .order("libelle");
      if (data) setCategories(data);
    }
    load();
  }, []);

  // Load themes for selected category
  useEffect(() => {
    async function load() {
      if (!categorieId) {
        setThemes([]);
        return;
      }
      const supabase = createClient();
      const { data } = await supabase
        .from("themes")
        .select("*")
        .eq("categorie_id", categorieId)
        .eq("actif", true)
        .order("libelle");
      if (data) setThemes(data);
    }
    load();
    setShowNewTheme(false);
    setNewTheme("");
  }, [categorieId]);

  // Load existing documents
  const loadDocs = useCallback(async () => {
    if (!initialData?.id) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("point_controle_documents")
      .select("*")
      .eq("point_controle_id", initialData.id)
      .order("ordre");
    if (data) setDocs(data);
  }, [initialData?.id]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  // Upload a PDF to a point
  async function uploadDocToPoint(pointId: string, file: File, ordre: number) {
    const supabase = createClient();
    const ext = file.name.split(".").pop() ?? "pdf";
    const path = `points-controle/${pointId}/${crypto.randomUUID()}.${ext}`;

    const { error: storageError } = await supabase.storage
      .from("rapports")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (storageError) throw new Error(storageError.message);

    const { data: { publicUrl } } = supabase.storage.from("rapports").getPublicUrl(path);

    const { error: dbError } = await supabase.from("point_controle_documents").insert({
      point_controle_id: pointId,
      nom: file.name.replace(/\.[^/.]+$/, ""),
      fichier_url: publicUrl,
      fichier_nom: file.name,
      fichier_taille: file.size,
      ordre,
    });
    if (dbError) throw new Error(dbError.message);
  }

  async function handleUploadDoc(file: File) {
    if (!initialData?.id) {
      // Nouveau point : stocker en attente
      if (pendingFiles.length + docs.length >= 5) {
        setError("Maximum 5 documents par point de contrôle.");
        return;
      }
      setPendingFiles((prev) => [...prev, file]);
      return;
    }
    if (docs.length >= 5) {
      setError("Maximum 5 documents par point de contrôle.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await uploadDocToPoint(initialData.id, file, docs.length + 1);
      await loadDocs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur upload");
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteDoc(docId: string) {
    if (!confirm("Supprimer ce document ?")) return;
    const supabase = createClient();
    const doc = docs.find((d) => d.id === docId);
    if (doc) {
      const storagePath = doc.fichier_url.split("/rapports/")[1];
      if (storagePath) {
        await supabase.storage.from("rapports").remove([storagePath]);
      }
    }
    await supabase.from("point_controle_documents").delete().eq("id", docId);
    await loadDocs();
  }

  function removePendingFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!categorieId || !intitule.trim()) {
      setError("Catégorie et intitulé sont obligatoires.");
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();

      // Créer un nouveau thème si nécessaire
      let finalThemeId = themeId || null;
      if (showNewTheme && newTheme.trim()) {
        const { data: newThemeData, error: themeError } = await supabase
          .from("themes")
          .insert({
            categorie_id: categorieId,
            libelle: newTheme.trim(),
          })
          .select("id")
          .single();
        if (themeError) throw themeError;
        finalThemeId = newThemeData.id;
      }

      const payload = {
        phase_id: null,
        categorie_id: categorieId,
        theme_id: finalThemeId,
        intitule: intitule.trim(),
        critere: critere.trim() || null,
        base_legale: baseLegale.trim() || null,
        explications: explications.trim() || null,
        updated_at: new Date().toISOString(),
      };

      let pointId = initialData?.id;

      if (initialData) {
        const { error: updateError } = await supabase
          .from("points_controle")
          .update(payload)
          .eq("id", initialData.id);
        if (updateError) throw updateError;
      } else {
        const { data: newPoint, error: insertError } = await supabase
          .from("points_controle")
          .insert({ ...payload, is_custom: true })
          .select("id")
          .single();
        if (insertError) throw insertError;
        pointId = newPoint.id;
      }

      // Upload pending files pour le nouveau point
      if (pointId && pendingFiles.length > 0) {
        for (let i = 0; i < pendingFiles.length; i++) {
          await uploadDocToPoint(pointId, pendingFiles[i], docs.length + i + 1);
        }
      }

      onSaved();
    } catch {
      setError("Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  const totalDocs = docs.length + pendingFiles.length;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Catégorie *
          </label>
          <select
            value={categorieId}
            onChange={(e) => {
              setCategorieId(e.target.value);
              setThemeId("");
            }}
            className="w-full rounded-lg border border-gray-300 px-3 py-3 min-h-touch text-sm"
            required
          >
            <option value="">Sélectionner</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.libelle}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-gray-500">
              Thème
            </label>
            {categorieId && (
              <button
                type="button"
                onClick={() => {
                  setShowNewTheme(!showNewTheme);
                  if (!showNewTheme) setThemeId("");
                  else setNewTheme("");
                }}
                className="text-[10px] text-blue-600 hover:underline"
              >
                {showNewTheme ? "Choisir existant" : "+ Nouveau thème"}
              </button>
            )}
          </div>
          {showNewTheme ? (
            <input
              type="text"
              value={newTheme}
              onChange={(e) => setNewTheme(e.target.value)}
              className="w-full rounded-lg border border-blue-300 px-3 py-3 min-h-touch text-sm bg-blue-50"
              placeholder="Nom du nouveau thème"
            />
          ) : (
            <select
              value={themeId}
              onChange={(e) => setThemeId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-3 min-h-touch text-sm"
              disabled={!categorieId}
            >
              <option value="">Aucun thème</option>
              {themes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.libelle}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">
          Point de contrôle (action à vérifier) *
        </label>
        <textarea
          value={intitule}
          onChange={(e) => setIntitule(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          placeholder="Ex: Vérifier la présence de garde-corps périphériques"
          required
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">
          Explications
        </label>
        <textarea
          value={explications}
          onChange={(e) => setExplications(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          placeholder="Détails complémentaires..."
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Base légale
          </label>
          <input
            type="text"
            value={baseLegale}
            onChange={(e) => setBaseLegale(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-3 min-h-touch text-sm"
            placeholder="Ex: OTConst — Art. 22"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Critère d'acceptation
          </label>
          <input
            type="text"
            value={critere}
            onChange={(e) => setCritere(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-3 min-h-touch text-sm"
            placeholder="Ex: Hauteur min 1m"
          />
        </div>
      </div>

      {/* Documents PDF — disponible à la création ET à l'édition */}
      <div className="border-t pt-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-gray-500">
            Documents PDF ({totalDocs}/5)
          </label>
          {totalDocs < 5 && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUploadDoc(file);
                  e.target.value = "";
                }}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="text-xs px-3 py-1.5 min-h-touch bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
              >
                {uploading ? "Upload..." : "+ Ajouter PDF"}
              </button>
            </>
          )}
        </div>

        {/* Documents déjà enregistrés */}
        {docs.length > 0 && (
          <div className="space-y-1">
            {docs.map((doc) => (
              <div key={doc.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                <span className="material-symbols-outlined text-red-500 text-sm">picture_as_pdf</span>
                <a
                  href={doc.fichier_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline flex-1 truncate"
                >
                  {doc.nom}
                </a>
                <button
                  type="button"
                  onClick={() => handleDeleteDoc(doc.id)}
                  className="text-red-500 hover:text-red-700 p-1"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Fichiers en attente (nouveau point) */}
        {pendingFiles.length > 0 && (
          <div className="space-y-1 mt-1">
            {pendingFiles.map((file, i) => (
              <div key={i} className="flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-2">
                <span className="material-symbols-outlined text-blue-500 text-sm">upload_file</span>
                <span className="text-xs text-blue-700 flex-1 truncate">{file.name}</span>
                <span className="text-[10px] text-blue-400">En attente</span>
                <button
                  type="button"
                  onClick={() => removePendingFile(i)}
                  className="text-red-500 hover:text-red-700 p-1"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>
            ))}
          </div>
        )}

        {totalDocs === 0 && (
          <p className="text-xs text-gray-400">Aucun document. Ajoutez des PDF réglementaires.</p>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 py-3 min-h-touch bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
        >
          {saving ? "Enregistrement..." : initialData ? "Modifier" : "Créer"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-3 min-h-touch bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
