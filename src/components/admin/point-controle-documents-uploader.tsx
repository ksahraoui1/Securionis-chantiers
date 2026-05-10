"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { extractStoragePath } from "@/lib/utils/storage-path";
import { uploadFileToStorage } from "@/lib/utils/storage-upload";
import type { Tables } from "@/types/database";

const MAX_DOCS = 5;

export interface PointControleDocumentsUploaderHandle {
  flushPending: (pointId: string) => Promise<void>;
}

interface Props {
  pointId: string | null;
}

export const PointControleDocumentsUploader = forwardRef<
  PointControleDocumentsUploaderHandle,
  Props
>(function PointControleDocumentsUploader({ pointId }, ref) {
  const [docs, setDocs] = useState<Tables<"point_controle_documents">[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadDocs = useCallback(async () => {
    if (!pointId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("point_controle_documents")
      .select("*")
      .eq("point_controle_id", pointId)
      .order("ordre");
    if (data) setDocs(data);
  }, [pointId]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  async function uploadDocToPoint(
    targetPointId: string,
    file: File,
    ordre: number,
  ): Promise<void> {
    const uploaded = await uploadFileToStorage(file, {
      bucket: "rapports",
      pathPrefix: `points-controle/${targetPointId}`,
    });

    const supabase = createClient();
    const { error: dbError } = await supabase
      .from("point_controle_documents")
      .insert({
        point_controle_id: targetPointId,
        nom: file.name.replace(/\.[^/.]+$/, ""),
        fichier_url: uploaded.publicUrl,
        fichier_nom: uploaded.filename,
        fichier_taille: uploaded.size,
        ordre,
      });
    if (dbError) throw new Error(dbError.message);
  }

  useImperativeHandle(
    ref,
    () => ({
      async flushPending(newPointId: string) {
        if (pendingFiles.length === 0) return;
        for (let i = 0; i < pendingFiles.length; i++) {
          await uploadDocToPoint(newPointId, pendingFiles[i], i + 1);
        }
        setPendingFiles([]);
      },
    }),
    [pendingFiles],
  );

  async function handleUploadDoc(file: File) {
    setError(null);
    if (!pointId) {
      if (pendingFiles.length + docs.length >= MAX_DOCS) {
        setError(`Maximum ${MAX_DOCS} documents par point de contrôle.`);
        return;
      }
      setPendingFiles((prev) => [...prev, file]);
      return;
    }
    if (docs.length >= MAX_DOCS) {
      setError(`Maximum ${MAX_DOCS} documents par point de contrôle.`);
      return;
    }
    setUploading(true);
    try {
      await uploadDocToPoint(pointId, file, docs.length + 1);
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
      const storagePath = extractStoragePath(doc.fichier_url, "rapports");
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

  const totalDocs = docs.length + pendingFiles.length;

  return (
    <div className="border-t pt-4">
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-medium text-gray-500">
          Documents PDF ({totalDocs}/{MAX_DOCS})
        </label>
        {totalDocs < MAX_DOCS && (
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
              {uploading ? "Envoi..." : "+ Ajouter PDF"}
            </button>
          </>
        )}
      </div>

      {docs.length > 0 && (
        <div className="space-y-1">
          {docs.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2"
            >
              <span className="material-symbols-outlined text-red-500 text-sm">
                picture_as_pdf
              </span>
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

      {pendingFiles.length > 0 && (
        <div className="space-y-1 mt-1">
          {pendingFiles.map((file, i) => (
            <div
              key={i}
              className="flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-2"
            >
              <span className="material-symbols-outlined text-blue-500 text-sm">
                upload_file
              </span>
              <span className="text-xs text-blue-700 flex-1 truncate">
                {file.name}
              </span>
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
        <p className="text-xs text-gray-400">
          Aucun document. Ajoutez des PDF réglementaires.
        </p>
      )}

      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
});
