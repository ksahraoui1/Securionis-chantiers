"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { UtilisateurForm } from "@/components/admin/utilisateur-form";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import type { Tables } from "@/types/database";

export default function AdminUtilisateursPage() {
  const [profiles, setProfiles] = useState<Tables<"profiles">[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<Tables<"profiles"> | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function handleUpdate(userId: string, updates: { nom?: string; email?: string; role?: string }) {
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/update-user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, ...updates }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur lors de la modification");
      }
      setEditingUser(null);
      await loadProfiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete(userId: string) {
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/delete-user", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur lors de la suppression");
      }
      setShowDeleteConfirm(null);
      await loadProfiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setActionLoading(false);
    }
  }

  const deleteTarget = profiles.find((p) => p.id === showDeleteConfirm);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Utilisateurs</h1>
          <p className="text-sm text-gray-500 mt-1">
            {profiles.length} utilisateur{profiles.length > 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-3 min-h-[44px] bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 inline-flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-lg">person_add</span>
          Nouvel utilisateur
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

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
              className="p-4 flex items-center justify-between gap-4"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900 truncate">{profile.nom}</p>
                <p className="text-sm text-gray-500 truncate">{profile.email}</p>
              </div>
              <span
                className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${
                  profile.role === "administrateur"
                    ? "bg-purple-100 text-purple-700"
                    : "bg-blue-100 text-blue-700"
                }`}
              >
                {profile.role === "administrateur" ? "Admin" : "Inspecteur"}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditingUser(profile)}
                  className="p-2 min-h-[44px] min-w-[44px] text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center justify-center"
                  title="Modifier"
                >
                  <span className="material-symbols-outlined text-lg">edit</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(profile.id)}
                  className="p-2 min-h-[44px] min-w-[44px] text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center justify-center"
                  title="Supprimer"
                >
                  <span className="material-symbols-outlined text-lg">delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal création */}
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

      {/* Modal modification */}
      <Modal
        isOpen={!!editingUser}
        onClose={() => setEditingUser(null)}
        title="Modifier l'utilisateur"
      >
        {editingUser && (
          <EditUserForm
            profile={editingUser}
            onSave={(updates) => handleUpdate(editingUser.id, updates)}
            onCancel={() => setEditingUser(null)}
            saving={actionLoading}
          />
        )}
      </Modal>

      {/* Modal confirmation suppression */}
      <Modal
        isOpen={!!showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(null)}
        title="Supprimer l'utilisateur"
        footer={
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => setShowDeleteConfirm(null)}
            >
              Annuler
            </Button>
            <button
              type="button"
              onClick={() => showDeleteConfirm && handleDelete(showDeleteConfirm)}
              disabled={actionLoading}
              className="px-4 py-2 min-h-[44px] bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {actionLoading ? "Suppression..." : "Supprimer"}
            </button>
          </div>
        }
      >
        {deleteTarget && (
          <p className="text-sm text-gray-700">
            Voulez-vous vraiment supprimer <strong>{deleteTarget.nom}</strong> ({deleteTarget.email}) ?
            Cette action est irréversible.
          </p>
        )}
      </Modal>
    </div>
  );
}

function EditUserForm({
  profile,
  onSave,
  onCancel,
  saving,
}: {
  profile: Tables<"profiles">;
  onSave: (updates: { nom?: string; email?: string; role?: string }) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [nom, setNom] = useState(profile.nom);
  const [email, setEmail] = useState(profile.email);
  const [role, setRole] = useState(profile.role);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const updates: { nom?: string; email?: string; role?: string } = {};
    if (nom.trim() !== profile.nom) updates.nom = nom.trim();
    if (email.trim() !== profile.email) updates.email = email.trim();
    if (role !== profile.role) updates.role = role;
    onSave(updates);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Nom complet
        </label>
        <input
          type="text"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          required
          className="w-full rounded-lg border border-gray-300 px-4 py-3 min-h-[44px]"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Email
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-lg border border-gray-300 px-4 py-3 min-h-[44px]"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Rôle
        </label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "inspecteur" | "administrateur")}
          className="w-full rounded-lg border border-gray-300 px-3 py-3 min-h-[44px]"
        >
          <option value="inspecteur">Inspecteur</option>
          <option value="administrateur">Administrateur</option>
        </select>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 py-3 min-h-[44px] bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-3 min-h-[44px] bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
