"use client";

import { createClient } from "@/lib/supabase/client";
import {
  validatePdfOrImageFile,
  type FileValidationResult,
} from "./file-validation";
import { buildStoragePath } from "./storage-path";

export interface UploadedFile {
  publicUrl: string;
  path: string;
  filename: string;
  size: number;
  ext: string;
}

interface UploadOptions {
  bucket: string;
  pathPrefix: string;
  validate?: (file: File) => FileValidationResult;
}

/**
 * Upload un fichier vers Supabase Storage avec validation + path randomisé.
 * Throw une Error si la validation ou l'upload échoue.
 */
export async function uploadFileToStorage(
  file: File,
  { bucket, pathPrefix, validate = validatePdfOrImageFile }: UploadOptions,
): Promise<UploadedFile> {
  const validation = validate(file);
  if (!validation.valid) throw new Error(validation.error!);

  const ext = validation.sanitizedExtension!;
  const path = buildStoragePath(pathPrefix, ext);

  const supabase = createClient();
  const { error: storageError } = await supabase.storage
    .from(bucket)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (storageError) throw new Error(storageError.message);

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(path);

  return { publicUrl, path, filename: file.name, size: file.size, ext };
}
