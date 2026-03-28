"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div>
      {/* Mobile branding — hidden on desktop (shown in left panel instead) */}
      <div className="lg:hidden text-center mb-8">
        <div className="inline-flex items-center gap-2.5 mb-4">
          <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-white">shield</span>
          </div>
          <span className="font-heading font-bold text-gray-900 text-xl tracking-tight">
            Securionis
          </span>
        </div>
        <p className="text-sm text-gray-500">
          Santé et Sécurité au Travail
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-card border border-stone-200 p-6 sm:p-8">
        <div className="mb-6">
          <h2 className="font-heading text-xl font-bold text-gray-900">
            Connexion
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Accédez à votre espace de travail
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-1.5"
            >
              Adresse email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="input-field"
              placeholder="votre@email.ch"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700"
              >
                Mot de passe
              </label>
              <button
                type="button"
                onClick={() => { window.location.href = "/forgot-password"; }}
                className="text-xs text-brand-600 hover:text-brand-700 font-medium transition-colors"
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
              className="input-field"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl p-3">
              <span className="material-symbols-outlined text-base text-red-500">error</span>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 min-h-touch bg-brand-600 text-white font-semibold rounded-xl hover:bg-brand-700 active:bg-brand-800 disabled:opacity-50 disabled:cursor-not-allowed text-base transition-all duration-200 shadow-sm hover:shadow-md mt-2"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Connexion...
              </span>
            ) : (
              "Se connecter"
            )}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-stone-150 text-center">
          <p className="text-sm text-gray-500">
            Pas encore de compte ?{" "}
            <button
              type="button"
              onClick={() => { window.location.href = "/register"; }}
              className="text-brand-600 hover:text-brand-700 font-semibold transition-colors"
            >
              Créer un compte
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
