"use client";

import { useRef } from "react";
import { MAX_PHOTOS } from "@/lib/utils/constants";

interface PhotoCaptureProps {
  photos: string[];
  uploading: boolean;
  error: string | null;
  canAddMore: boolean;
  onCapture: (file: File) => void;
  onRemove: (url: string) => void;
}

export function PhotoCapture({
  photos,
  uploading,
  error,
  canAddMore,
  onCapture,
  onRemove,
}: PhotoCaptureProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      onCapture(file);
      e.target.value = "";
    }
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
            className="px-4 py-2 min-h-touch bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200 disabled:opacity-50"
          >
            Appareil photo
          </button>
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            disabled={uploading}
            className="px-4 py-2 min-h-touch bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
          >
            Galerie
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="px-4 py-2 min-h-touch bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
          >
            Fichier
          </button>
        </div>
      )}

      {!canAddMore && (
        <p className="text-sm text-amber-600">
          Maximum de {MAX_PHOTOS} photos atteint.
        </p>
      )}

      {uploading && (
        <p className="text-sm text-blue-600">Upload en cours...</p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
