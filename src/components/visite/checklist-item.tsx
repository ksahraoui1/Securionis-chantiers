"use client";

import { useState, useCallback, useEffect } from "react";
import { PhotoCapture } from "./photo-capture";
import { PhotoAiAnalysis } from "./photo-ai-analysis";
import { usePhotoUpload } from "@/hooks/use-photo-upload";
import { VALEURS_REPONSE, LABELS_REPONSE } from "@/lib/utils/constants";
import type { Tables } from "@/types/database";

interface ChecklistItemProps {
  pointControle: Tables<"points_controle">;
  chantierId: string;
  visiteId: string;
  reponseId: string;
  initialValeur?: string | null;
  initialRemarque?: string | null;
  initialPhotos?: string[];
  onChange: (data: {
    point_controle_id: string;
    valeur: string;
    remarque: string | null;
    photos: string[];
  }) => void;
}

const VALEUR_OPTIONS = [
  { value: VALEURS_REPONSE.CONFORME, color: "bg-green-600" },
  { value: VALEURS_REPONSE.NON_CONFORME, color: "bg-red-600" },
  { value: VALEURS_REPONSE.PAS_NECESSAIRE, color: "bg-gray-500" },
];

export function ChecklistItem({
  pointControle,
  chantierId,
  visiteId,
  reponseId,
  initialValeur,
  initialRemarque,
  initialPhotos = [],
  onChange,
}: ChecklistItemProps) {
  const [valeur, setValeur] = useState(initialValeur ?? "");
  const [remarque, setRemarque] = useState(initialRemarque ?? "");

  const photoUpload = usePhotoUpload({
    chantierId,
    visiteId,
    reponseId,
  });

  useEffect(() => {
    if (initialPhotos.length > 0) {
      photoUpload.initPhotos(initialPhotos);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emitChange = useCallback(
    (newValeur: string, newRemarque: string, newPhotos: string[]) => {
      if (newValeur) {
        onChange({
          point_controle_id: pointControle.id,
          valeur: newValeur,
          remarque: newRemarque || null,
          photos: newPhotos,
        });
      }
    },
    [onChange, pointControle.id]
  );

  function handleValeurChange(v: string) {
    setValeur(v);
    emitChange(v, remarque, photoUpload.photos);
  }

  function handleRemarqueChange(r: string) {
    setRemarque(r);
    emitChange(valeur, r, photoUpload.photos);
  }

  async function handlePhotoCapture(file: File) {
    const url = await photoUpload.uploadPhoto(file);
    if (url) {
      const newPhotos = [...photoUpload.photos, url];
      emitChange(valeur, remarque, newPhotos);
    }
  }

  function handlePhotoRemove(url: string) {
    const newPhotos = photoUpload.photos.filter((p) => p !== url);
    photoUpload.removePhoto(url);
    emitChange(valeur, remarque, newPhotos);
  }

  async function handleReplaceAnnotated(oldUrl: string, blob: Blob) {
    const newUrl = await photoUpload.replacePhoto(oldUrl, blob);
    if (newUrl) {
      const newPhotos = photoUpload.photos.map((p) => (p === oldUrl ? newUrl : p));
      emitChange(valeur, remarque, newPhotos);
    }
  }

  function handleAiRemarque(suggested: string) {
    const newRemarque = remarque
      ? `${remarque}\n${suggested}`
      : suggested;
    setRemarque(newRemarque);
    emitChange(valeur, newRemarque, photoUpload.photos);
  }

  function handleAiConformite(suggested: string) {
    setValeur(suggested);
    emitChange(suggested, remarque, photoUpload.photos);
  }

  return (
    <div className="bg-white rounded-lg border border-gray-400 p-4 space-y-4">
      <div>
        <p className="font-medium text-gray-900">{pointControle.intitule}</p>
        {pointControle.critere && (
          <p className="text-sm text-gray-500 mt-1">
            Critère : {pointControle.critere}
          </p>
        )}
        {pointControle.base_legale && (
          <p className="text-xs text-gray-400 mt-1">
            {pointControle.base_legale}
          </p>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        {VALEUR_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => handleValeurChange(opt.value)}
            className={`px-4 py-3 min-h-touch min-w-touch rounded-lg text-sm font-medium transition-colors ${
              valeur === opt.value
                ? `${opt.color} text-white`
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {LABELS_REPONSE[opt.value]}
          </button>
        ))}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Remarque
        </label>
        <textarea
          value={remarque}
          onChange={(e) => {
            handleRemarqueChange(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = e.target.scrollHeight + "px";
          }}
          onFocus={(e) => {
            e.target.style.height = "auto";
            e.target.style.height = e.target.scrollHeight + "px";
          }}
          rows={2}
          className="w-full rounded-lg border border-gray-400 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none overflow-hidden"
          placeholder="Remarque optionnelle..."
        />
      </div>

      <PhotoCapture
        photos={photoUpload.photos}
        uploading={photoUpload.uploading}
        error={photoUpload.error}
        canAddMore={photoUpload.canAddMore}
        onCapture={handlePhotoCapture}
        onRemove={handlePhotoRemove}
        onReplaceAnnotated={handleReplaceAnnotated}
      />

      {/* Analyse IA — visible quand au moins 1 photo est uploadée */}
      {photoUpload.photos.length > 0 && (
        <PhotoAiAnalysis
          photoUrl={photoUpload.photos[photoUpload.photos.length - 1]}
          pointControle={pointControle.intitule}
          critere={pointControle.critere ?? undefined}
          onApplyRemarque={handleAiRemarque}
          onApplyConformite={handleAiConformite}
        />
      )}
    </div>
  );
}
