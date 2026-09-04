"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { FormulaireCodeMfa } from "@/components/compte/formulaire-code-mfa";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** Facteur à confirmer quand le mot de passe ne suffit pas (APP-03). */
  const [facteurAConfirmer, setFacteurAConfirmer] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError("Email ou mot de passe incorrect.");
      setLoading(false);
      return;
    }

    // Le mot de passe donne une session de niveau simple. Si un second facteur
    // est enregistré, Supabase annonce un niveau attendu supérieur : la session
    // existe, mais elle reste incomplète tant que le code n'est pas fourni.
    const { data: niveaux } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (niveaux && niveaux.currentLevel !== niveaux.nextLevel) {
      const { data: facteurs } = await supabase.auth.mfa.listFactors();
      const facteur = (facteurs?.all ?? []).find((f) => f.status === "verified");
      if (facteur) {
        setFacteurAConfirmer(facteur.id);
        setPassword("");
        setLoading(false);
        return;
      }
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function abandonner() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setFacteurAConfirmer(null);
    setPassword("");
    setLoading(false);
  }

  if (facteurAConfirmer) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-400 p-5 sm:p-8">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-gray-900">
            Vérification en deux étapes
          </h1>
          <p className="text-sm text-gray-500 mt-2 break-words">{email}</p>
        </div>
        <FormulaireCodeMfa
          factorId={facteurAConfirmer}
          onVerifie={() => {
            router.push("/dashboard");
            router.refresh();
          }}
          onAnnuler={abandonner}
        />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-400 p-5 sm:p-8">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Securionis Chantiers
        </h1>
        <p className="text-sm text-gray-500 mt-2">
          Santé et Sécurité au Travail
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full rounded-lg border border-gray-300 px-4 py-3 min-h-touch focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            placeholder="votre@email.ch"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700"
            >
              Mot de passe
            </label>
            <button
              type="button"
              onClick={() => { window.location.href = "/forgot-password"; }}
              className="text-xs text-blue-600 hover:underline"
            >
              Mot de passe oublié ?
            </button>
          </div>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full rounded-lg border border-gray-300 px-4 py-3 min-h-touch focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-4 min-h-touch bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 text-lg"
        >
          {loading ? "Connexion..." : "Se connecter"}
        </button>
      </form>

      {/* L'inscription publique est fermée (APP-02, audit du 4 septembre 2026) :
          les comptes sont créés par un administrateur depuis /admin/utilisateurs. */}
      <p className="text-center text-sm text-gray-500 mt-6">
        Pas encore de compte ? Demandez-le à l&apos;administrateur de votre entreprise.
      </p>
    </div>
  );
}
