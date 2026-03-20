"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { UtilisateurForm } from "@/components/admin/utilisateur-form";
import { Modal } from "@/components/ui/modal";
import type { Tables } from "@/types/database";

export default function AdminUtilisateursPage() {
  const [profiles, setProfiles] = useState<Tables<"profiles">[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const loadProfiles = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .order("nom");
    if (data) setProfiles(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  async function handleChangeRole(
    id: string,
    newRole: "inspecteur" | "administrateur"
  ) {
    const supabase = createClient();
    await supabase
      .from("profiles")
      .update({ role: newRole, updated_at: new Date().toISOString() })
      .eq("id", id);
    loadProfiles();
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Utilisateurs</h1>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-3 min-h-touch bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
        >
          + Nouvel utilisateur
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500 py-8 text-center">Chargement...</p>
      ) : profiles.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">Aucun utilisateur.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border divide-y">
          {profiles.map((profile) => (
            <div
              key={profile.id}
              className="p-4 flex items-center justify-between"
            >
              <div>
                <p className="font-medium">{profile.nom}</p>
                <p className="text-sm text-gray-500">{profile.email}</p>
              </div>
              <select
                value={profile.role}
                onChange={(e) =>
                  handleChangeRole(
                    profile.id,
                    e.target.value as "inspecteur" | "administrateur"
                  )
                }
                className="rounded-lg border border-gray-300 px-3 py-2 min-h-touch text-sm"
              >
                <option value="inspecteur">Inspecteur</option>
                <option value="administrateur">Administrateur</option>
              </select>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title="Nouvel utilisateur"
      >
        <UtilisateurForm
          onSaved={() => {
            setShowForm(false);
            loadProfiles();
          }}
          onCancel={() => setShowForm(false)}
        />
      </Modal>
    </div>
  );
}
