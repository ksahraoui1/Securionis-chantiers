"use client";

import {
  PHOTO_MAX_DIMENSION,
  PHOTO_QUALITY,
  MAX_PHOTO_SIZE_BYTES,
  ACCEPTED_IMAGE_TYPES,
} from "./constants";

export function validatePhoto(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type) && !file.name.toLowerCase().endsWith(".heic")) {
    return "Format non supporté. Utilisez JPEG, PNG ou HEIC.";
  }
  if (file.size > MAX_PHOTO_SIZE_BYTES) {
    return `La photo dépasse 10 Mo. Choisissez une photo plus légère.`;
  }
  return null;
}

export async function compressPhoto(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      if (width > PHOTO_MAX_DIMENSION || height > PHOTO_MAX_DIMENSION) {
        if (width > height) {
          height = Math.round((height * PHOTO_MAX_DIMENSION) / width);
          width = PHOTO_MAX_DIMENSION;
        } else {
          width = Math.round((width * PHOTO_MAX_DIMENSION) / height);
          height = PHOTO_MAX_DIMENSION;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context unavailable"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Compression failed"));
          }
        },
        "image/jpeg",
        PHOTO_QUALITY
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Impossible de lire l'image"));
    };

    img.src = url;
  });
}
