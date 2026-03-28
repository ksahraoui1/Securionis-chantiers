"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      {
        redirectTo: `${window.location.origin}/reset-password`,
      }
    );

    if (resetError) {
      setError(resetError.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  }

  if (success) {
    return (
      <div className="bg-white rounded-2xl shadow-card border border-stone-200 p-8 text-center">
        <div className="w-14 h-14 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <span className="material-symbols-outlined text-brand-600 text-2xl">forward_to_inbox</span>
        </div>
        <h1 className="font-heading text-xl font-bold text-gray-900 mb-2">
          Email envoyé
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          Si un compte existe pour <strong className="text-gray-700">{email}</strong>, vous recevrez un lien de réinitialisation dans quelques minutes.
        </p>
        <p className="text-xs text-gray-400 mb-6">
          Vérifiez aussi votre dossier spam.
        </p>
        <Link
          href="/login"
          className="text-sm text-brand-600 hover:text-brand-700 font-medium transition-colors"
        >
          Retour à la connexion
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-card border border-stone-200 p-6 sm:p-8">
      <div className="mb-6">
        <h2 className="font-heading text-xl font-bold text-gray-900">
          Mot de passe oublié
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Entrez votre email pour recevoir un lien de réinitialisation.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
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
          {loading ? "Envoi..." : "Envoyer le lien"}
        </button>
      </form>

      <div className="mt-6 pt-5 border-t border-stone-150 text-center">
        <Link href="/login" className="text-sm text-brand-600 hover:text-brand-700 font-medium transition-colors">
          Retour à la connexion
        </Link>
      </div>
    </div>
  );
}
