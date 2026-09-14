"use client";

import { createClient } from "@/lib/supabase/client";
import {
  validatePdfOrImageFile,
  validateFileSignature,
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

  // Défense en profondeur : vérifier la signature binaire réelle
  const signatureError = await validateFileSignature(file);
  if (signatureError) throw new Error(signatureError);

  const ext = validation.sanitizedExtension!;
  const supabase = createClient();
  // Le serveur vérifie cette frontière ; le préfixe est établi avec le profil
  // authentifié pour que les bibliothèques et logos ne partagent aucun chemin.
  const segments = pathPrefix.split("/");
  if (bucket === "rapports" && ["base-documentaire", "points-controle", "logos"].includes(segments[0])) {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Connexion requise");
    const { data: profile, error } = await supabase.from("profiles")
      .select("entreprise_id").eq("id", user.id).single();
    if (error || !profile?.entreprise_id) throw new Error("Entreprise requise pour envoyer un fichier");
    segments.splice(1, 0, profile.entreprise_id);
  }
  const path = buildStoragePath(segments.join("/"), ext);
  const { error: storageError } = await supabase.storage
    .from(bucket)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (storageError) throw new Error(storageError.message);

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(path);

  return { publicUrl, path, filename: file.name, size: file.size, ext };
}
