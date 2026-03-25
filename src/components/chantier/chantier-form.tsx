"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

interface ChantierFormData {
  nom: string;
  adresse: string;
  nature_travaux: string;
  ref_communale: string;
  numero_camac: string;
  numero_parcelle: string;
  numero_eca: string;
  contact_nom: string;
}

interface ChantierFormProps {
  userId: string;
  userRole: string;
  initialData?: ChantierFormData;
  chantierId?: string;
}

const EMPTY_FORM: ChantierFormData = {
  nom: "",
  adresse: "",
  nature_travaux: "",
  ref_communale: "",
  numero_camac: "",
  numero_parcelle: "",
  numero_eca: "",
  contact_nom: "",
};

export function ChantierForm({
  userId,
  userRole,
  initialData,
  chantierId,
}: ChantierFormProps) {
  const router = useRouter();
  const isEdit = !!chantierId;
  const [form, setForm] = useState<ChantierFormData>(initialData ?? EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof ChantierFormData, string>>>({});

  function handleChange(field: keyof ChantierFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }

  function validate(): boolean {
    const newErrors: Partial<Record<keyof ChantierFormData, string>> = {};
    if (!form.adresse.trim()) {
      newErrors.adresse = "L'adresse est requise";
    }
    if (!form.nature_travaux.trim()) {
      newErrors.nature_travaux = "La nature des travaux est requise";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    setError(null);

    try {
      const supabase = createClient();

      const payload = {
        nom: form.nom.trim() || null,
        adresse: form.adresse.trim(),
        nature_travaux: form.nature_travaux.trim(),
        ref_communale: form.ref_communale.trim() || null,
        numero_camac: form.numero_camac.trim() || null,
        numero_parcelle: form.numero_parcelle.trim() || null,
        numero_eca: form.numero_eca.trim() || null,
        contact_nom: form.contact_nom.trim() || null,
      };

      if (isEdit) {
        const { error: updateError } = await supabase
          .from("chantiers")
          .update(payload)
          .eq("id", chantierId);

        if (updateError) throw new Error(updateError.message);

        router.push(`/chantiers/${chantierId}`);
        router.refresh();
      } else {
        const { data: newChantier, error: insertError } = await supabase
          .from("chantiers")
          .insert({ ...payload, created_by: userId })
          .select("id")
          .single();

        if (insertError || !newChantier) {
          throw new Error(
            insertError?.message ?? "Erreur lors de la creation"
          );
        }

        // FR-028: if user is inspecteur, auto-insert into chantier_inspecteurs
        if (userRole === "inspecteur") {
          await supabase.from("chantier_inspecteurs").insert({
            chantier_id: newChantier.id,
            inspecteur_id: userId,
          });
        }

        router.push(`/chantiers/${newChantier.id}`);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Une erreur est survenue"
      );
      setSaving(false);
    }
  }

  const fields: {
    key: keyof ChantierFormData;
    label: string;
    required: boolean;
    placeholder: string;
  }[] = [
    {
      key: "nom",
      label: "Nom du chantier",
      required: false,
      placeholder: "Ex: Villa Dupont, Immeuble Les Terrasses...",
    },
    {
      key: "adresse",
      label: "Adresse",
      required: true,
      placeholder: "Rue du Lac 12, 1000 Lausanne",
    },
    {
      key: "nature_travaux",
      label: "Nature des travaux",
      required: true,
      placeholder: "Construction neuve, renovation...",
    },
    {
      key: "ref_communale",
      label: "Reference communale",
      required: false,
      placeholder: "",
    },
    {
      key: "numero_camac",
      label: "Numero CAMAC",
      required: false,
      placeholder: "",
    },
    {
      key: "numero_parcelle",
      label: "Numero de parcelle",
      required: false,
      placeholder: "",
    },
    {
      key: "numero_eca",
      label: "Numero ECA",
      required: false,
      placeholder: "",
    },
    {
      key: "contact_nom",
      label: "Nom du contact",
      required: false,
      placeholder: "Nom et prenom",
    },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {fields.map((field) => (
        <div key={field.key}>
          <label
            htmlFor={field.key}
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            {field.label}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </label>
          <input
            id={field.key}
            type="text"
            value={form[field.key]}
            onChange={(e) => handleChange(field.key, e.target.value)}
            placeholder={field.placeholder}
            className={`w-full rounded-lg border px-4 py-3 min-h-[44px] text-base focus:ring-2 outline-none transition-colors ${
              errors[field.key]
                ? "border-red-500 focus:border-red-500 focus:ring-red-200"
                : "border-gray-300 focus:border-blue-500 focus:ring-blue-200"
            }`}
          />
          {errors[field.key] && (
            <p className="mt-1 text-sm text-red-600">{errors[field.key]}</p>
          )}
        </div>
      ))}

      <div className="pt-4">
        <Button
          type="submit"
          size="lg"
          loading={saving}
          className="w-full"
        >
          {isEdit ? "Enregistrer les modifications" : "Créer le chantier"}
        </Button>
      </div>
    </form>
  );
}
