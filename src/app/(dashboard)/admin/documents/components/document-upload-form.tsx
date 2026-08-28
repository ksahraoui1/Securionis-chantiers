"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { uploadFileToStorage } from "@/lib/utils/storage-upload";
import { DOCUMENT_SOURCES } from "@/lib/utils/document-sources";

interface Props {
  onClose: () => void;
  onUploaded: () => void;
}

export function DocumentUploadForm({ onClose, onUploaded }: Props) {
  const [titre, setTitre] = useState("");
  const [source, setSource] = useState("autre");
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload() {
    if (!file || !titre.trim()) return;

    setUploading(true);
    setError(null);

    try {
      const uploaded = await uploadFileToStorage(file, {
        bucket: "rapports",
        pathPrefix: "base-documentaire",
      });
      const typeFichier = ["jpg", "jpeg"].includes(uploaded.ext)
        ? "jpeg"
        : uploaded.ext === "png"
          ? "png"
          : "pdf";

      const supabase = createClient();
      const { error: dbError } = await supabase.from("base_documentaire").insert({
        titre: titre.trim(),
        source,
        reference: reference.trim() || null,
        description: description.trim() || null,
        fichier_url: uploaded.publicUrl,
        fichier_nom: uploaded.filename,
        fichier_taille: uploaded.size,
        type_fichier: typeFichier,
      });
      if (dbError) throw new Error(dbError.message);

      onUploaded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'upload");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="bg-white rounded-lg border-2 border-blue-200 p-4 mb-4 space-y-3">
      <h3 className="font-semibold text-sm">Nouveau document</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Titre *</label>
          <input
            type="text"
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            placeholder="Ex: Feuillet SUVA 67003 — Scies circulaires"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-touch"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Source</label>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-touch"
          >
            {DOCUMENT_SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Référence
          </label>
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Ex: 67003, Art. 22, RS 832.30"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-touch"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Description
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
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
              setFile(f);
              if (!titre) setTitre(f.name.replace(/\.[^/.]+$/, ""));
            }
          }}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full py-4 min-h-touch border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center justify-center gap-2"
        >
          <span translate="no" className="material-symbols-outlined">cloud_upload</span>
          {file ? file.name : "Choisir un fichier (PDF, JPEG, JPG, PNG)"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 min-h-touch text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={handleUpload}
          disabled={!file || !titre.trim() || uploading}
          className="px-4 py-2 min-h-touch text-sm bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {uploading ? "Envoi..." : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
