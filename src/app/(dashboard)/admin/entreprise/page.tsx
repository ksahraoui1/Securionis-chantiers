"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

interface EntrepriseData {
  id?: string;
  nom: string;
  adresse: string;
  npa: string;
  ville: string;
  telephone: string;
  email: string;
  logo_url: string | null;
}

const EMPTY: EntrepriseData = {
  nom: "",
  adresse: "",
  npa: "",
  ville: "",
  telephone: "",
  email: "",
  logo_url: null,
};

export default function AdminEntreprisePage() {
  const [form, setForm] = useState<EntrepriseData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from("entreprises")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (data) {
        setForm({
          id: data.id,
          nom: data.nom ?? "",
          adresse: data.adresse ?? "",
          npa: data.npa ?? "",
          ville: data.ville ?? "",
          telephone: data.telephone ?? "",
          email: data.email ?? "",
          logo_url: data.logo_url ?? null,
        });
      }
      setLoading(false);
    }
    load();
  }, []);

  function handleChange(field: keyof EntrepriseData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleLogoUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() ?? "png";
      const path = `logos/entreprise-logo.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("rapports")
        .upload(path, file, { contentType: file.type, upsert: true });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("rapports").getPublicUrl(path);

      setForm((prev) => ({ ...prev, logo_url: publicUrl }));
    } catch {
      setError("Erreur lors de l'upload du logo");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nom.trim()) {
      setError("Le nom de l'entreprise est obligatoire");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const supabase = createClient();
      const payload = {
        nom: form.nom.trim(),
        adresse: form.adresse.trim() || null,
        npa: form.npa.trim() || null,
        ville: form.ville.trim() || null,
        telephone: form.telephone.trim() || null,
        email: form.email.trim() || null,
        logo_url: form.logo_url,
        updated_at: new Date().toISOString(),
      };

      if (form.id) {
        const { error: updateError } = await supabase
          .from("entreprises")
          .update(payload)
          .eq("id", form.id);
        if (updateError) throw updateError;
      } else {
        const { data, error: insertError } = await supabase
          .from("entreprises")
          .insert(payload)
          .select("id")
          .single();
        if (insertError) throw insertError;
        setForm((prev) => ({ ...prev, id: data.id }));
      }

      setSuccess("Configuration enregistrée");
    } catch {
      setError("Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-gray-500 py-8 text-center">Chargement...</p>;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Configuration de l'entreprise</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Logo */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Logo
          </label>
          <div className="flex items-center gap-4">
            {form.logo_url ? (
              <img
                src={form.logo_url}
                alt="Logo"
                className="h-16 max-w-[200px] object-contain border border-gray-300 rounded-lg p-2"
              />
            ) : (
              <div className="h-16 w-32 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-xs text-gray-400">
                Pas de logo
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleLogoUpload(file);
              }}
            />
            <Button
              type="button"
              variant="secondary"
              loading={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {form.logo_url ? "Changer le logo" : "Ajouter un logo"}
            </Button>
          </div>
        </div>

        {/* Fields */}
        {[
          { key: "nom" as const, label: "Nom de l'entreprise *", placeholder: "FWN" },
          { key: "adresse" as const, label: "Adresse", placeholder: "Rue du Pied-de-Ville 15" },
          { key: "npa" as const, label: "NPA", placeholder: "1896" },
          { key: "ville" as const, label: "Ville", placeholder: "Vouvry" },
          { key: "telephone" as const, label: "Téléphone", placeholder: "+41 79 596 80 57" },
          { key: "email" as const, label: "Email", placeholder: "contact@entreprise.ch" },
        ].map((field) => (
          <div key={field.key}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {field.label}
            </label>
            <input
              type="text"
              value={form[field.key] ?? ""}
              onChange={(e) => handleChange(field.key, e.target.value)}
              placeholder={field.placeholder}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 min-h-[44px] text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
            />
          </div>
        ))}

        {error && (
          <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}
        {success && (
          <div className="rounded-lg bg-green-50 p-4 text-sm text-green-700">{success}</div>
        )}

        <Button type="submit" size="lg" loading={saving} className="w-full">
          Enregistrer
        </Button>
      </form>
    </div>
  );
}
