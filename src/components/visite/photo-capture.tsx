"use client";

import { useRef, useState } from "react";
import { MAX_PHOTOS } from "@/lib/utils/constants";
import { PhotoAnnotator } from "./photo-annotator";

interface PhotoCaptureProps {
  photos: string[];
  uploading: boolean;
  error: string | null;
  canAddMore: boolean;
  onCapture: (file: File) => void;
  onRemove: (url: string) => void;
  onReplaceAnnotated?: (oldUrl: string, blob: Blob) => void;
}

export function PhotoCapture({
  photos,
  uploading,
  error,
  canAddMore,
  onCapture,
  onRemove,
  onReplaceAnnotated,
}: PhotoCaptureProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Annotation state: photo to annotate before upload
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  // Annotation of existing photo
  const [annotatingPhoto, setAnnotatingPhoto] = useState<string | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      // Open annotator with the new photo
      setPendingFile(file);
      setPendingUrl(URL.createObjectURL(file));
      e.target.value = "";
    }
  }

  function handleAnnotateSave(blob: Blob) {
    // Convert blob to File and upload
    const file = new File([blob], `annotated-${Date.now()}.jpg`, { type: "image/jpeg" });
    onCapture(file);
    if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    setPendingFile(null);
    setPendingUrl(null);
  }

  function handleAnnotateCancel() {
    // Upload original file without annotations
    if (pendingFile) {
      onCapture(pendingFile);
    }
    if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    setPendingFile(null);
    setPendingUrl(null);
  }

  function handleSkipAnnotation() {
    if (pendingFile) {
      onCapture(pendingFile);
    }
    if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    setPendingFile(null);
    setPendingUrl(null);
  }

  function handleExistingAnnotateSave(blob: Blob) {
    if (annotatingPhoto && onReplaceAnnotated) {
      onReplaceAnnotated(annotatingPhoto, blob);
    }
    setAnnotatingPhoto(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">
          Photos ({photos.length}/{MAX_PHOTOS})
        </span>
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {photos.map((url) => (
            <div key={url} className="relative group aspect-square">
              <img
                src={url}
                alt="Photo contrôle"
                className="w-full h-full object-cover rounded-lg"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors rounded-lg flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                {onReplaceAnnotated && (
                  <button
                    type="button"
                    onClick={() => setAnnotatingPhoto(url)}
                    className="bg-white text-gray-800 rounded-full w-8 h-8 flex items-center justify-center text-xs shadow"
                    title="Annoter"
                  >
                    <span className="material-symbols-outlined text-base">draw</span>
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => onRemove(url)}
                className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-80 hover:opacity-100"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      {canAddMore && (
        <div className="flex gap-2 flex-wrap">
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFile}
            className="hidden"
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/jpeg,image/png,image/heic"
            onChange={handleFile}
            className="hidden"
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/heic"
            onChange={handleFile}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-4 py-2 min-h-touch bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-lg">photo_camera</span>
            Appareil photo
          </button>
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-4 py-2 min-h-touch bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-lg">photo_library</span>
            Galerie
          </button>
        </div>
      )}

      {!canAddMore && (
        <p className="text-sm text-amber-600">
          Maximum de {MAX_PHOTOS} photos atteint.
        </p>
      )}

      {uploading && (
        <p className="text-sm text-blue-600">Envoi en cours...</p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Annotator for new photo (before upload) */}
      {pendingUrl && (
        <div className="fixed inset-0 z-50">
          <PhotoAnnotator
            imageUrl={pendingUrl}
            onSave={handleAnnotateSave}
            onCancel={handleSkipAnnotation}
          />
        </div>
      )}

      {/* Annotator for existing photo */}
      {annotatingPhoto && (
        <div className="fixed inset-0 z-50">
          <PhotoAnnotator
            imageUrl={annotatingPhoto}
            onSave={handleExistingAnnotateSave}
            onCancel={() => setAnnotatingPhoto(null)}
          />
        </div>
      )}
    </div>
  );
}
