"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import type { Tables } from "@/types/database";

interface DestinatairesProps {
  chantierId: string;
  initialDestinataires: Tables<"destinataires">[];
}

export function DestinatairesSection({
  chantierId,
  initialDestinataires,
}: DestinatairesProps) {
  const [destinataires, setDestinataires] = useState(initialDestinataires);
  const [showForm, setShowForm] = useState(false);
  const [nom, setNom] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!nom.trim() || !email.trim()) return;

    setSaving(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data, error: insertError } = await supabase
        .from("destinataires")
        .insert({
          chantier_id: chantierId,
          nom: nom.trim(),
          organisation: organisation.trim() || null,
          email: email.trim(),
        })
        .select()
        .single();

      if (insertError) throw new Error(insertError.message);

      setDestinataires([...destinataires, data]);
      setNom("");
      setOrganisation("");
      setEmail("");
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer ce destinataire ?")) return;

    setDeleting(id);
    setError(null);

    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase
        .from("destinataires")
        .delete()
        .eq("id", id);

      if (deleteError) throw new Error(deleteError.message);

      setDestinataires(destinataires.filter((d) => d.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div>
      {error && (
        <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {destinataires.length === 0 ? (
        <p className="text-sm text-gray-500 mb-3">Aucun destinataire.</p>
      ) : (
        <ul className="space-y-2 mb-3">
          {destinataires.map((dest) => (
            <li
              key={dest.id}
              className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2"
            >
              <div className="text-sm">
                <p className="font-medium text-gray-900">
                  {dest.nom}
                  {dest.organisation && (
                    <span className="text-gray-500 font-normal">
                      {" "}
                      &mdash; {dest.organisation}
                    </span>
                  )}
                </p>
                <p className="text-gray-500">{dest.email}</p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(dest.id)}
                disabled={deleting === dest.id}
                className="text-red-600 hover:text-red-800 text-sm min-h-[44px] min-w-[44px] flex items-center justify-center disabled:opacity-50"
              >
                {deleting === dest.id ? "..." : "Supprimer"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {showForm ? (
        <form onSubmit={handleAdd} className="space-y-3 bg-gray-50 rounded-lg p-3">
          <input
            type="text"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="Nom *"
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 min-h-[44px] text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
          />
          <input
            type="text"
            value={organisation}
            onChange={(e) => setOrganisation(e.target.value)}
            placeholder="Organisation"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 min-h-[44px] text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email *"
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 min-h-[44px] text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={saving}>
              Ajouter
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowForm(false)}
            >
              Annuler
            </Button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="text-sm text-blue-600 hover:text-blue-800 min-h-[44px] flex items-center"
        >
          + Ajouter un destinataire
        </button>
      )}
    </div>
  );
}
