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
      <div className="bg-white rounded-xl shadow-sm border border-gray-400 p-8 text-center">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="material-symbols-outlined text-blue-600 text-3xl">forward_to_inbox</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">
          Email envoyé
        </h1>
        <p className="text-sm text-gray-600 mb-6">
          Si un compte existe pour <strong>{email}</strong>, vous recevrez un lien de réinitialisation dans quelques minutes.
        </p>
        <p className="text-xs text-gray-400 mb-6">
          Vérifiez aussi votre dossier spam.
        </p>
        <Link
          href="/login"
          className="text-sm text-blue-600 hover:underline font-medium"
        >
          Retour à la connexion
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-400 p-5 sm:p-8">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Mot de passe oublié
        </h1>
        <p className="text-sm text-gray-500 mt-2">
          Entrez votre email pour recevoir un lien de réinitialisation.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Adresse email
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
          {loading ? "Envoi..." : "Envoyer le lien"}
        </button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-6">
        <Link href="/login" className="text-blue-600 hover:underline font-medium">
          Retour à la connexion
        </Link>
      </p>
    </div>
  );
}
