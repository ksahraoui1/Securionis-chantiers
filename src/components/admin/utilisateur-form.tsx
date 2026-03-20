"use client";

import { useState } from "react";

interface UtilisateurFormProps {
  onSaved: () => void;
  onCancel: () => void;
}

export function UtilisateurForm({ onSaved, onCancel }: UtilisateurFormProps) {
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"inspecteur" | "administrateur">(
    "inspecteur"
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!nom.trim() || !email.trim() || !password.trim()) {
      setError("Tous les champs sont obligatoires.");
      return;
    }

    if (password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom, email, password, role }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur lors de la création");
      }

      onSaved();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erreur lors de la création."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Nom complet *
        </label>
        <input
          type="text"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          required
          className="w-full rounded-lg border border-gray-300 px-4 py-3 min-h-touch"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Email *
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-lg border border-gray-300 px-4 py-3 min-h-touch"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Mot de passe *
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          className="w-full rounded-lg border border-gray-300 px-4 py-3 min-h-touch"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Rôle *
        </label>
        <select
          value={role}
          onChange={(e) =>
            setRole(e.target.value as "inspecteur" | "administrateur")
          }
          className="w-full rounded-lg border border-gray-300 px-3 py-3 min-h-touch"
        >
          <option value="inspecteur">Inspecteur</option>
          <option value="administrateur">Administrateur</option>
        </select>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 py-3 min-h-touch bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Création..." : "Créer l'utilisateur"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-3 min-h-touch bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
