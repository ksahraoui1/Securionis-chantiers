"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const router = useRouter();

  // Supabase sets the session from the URL hash automatically
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setSessionReady(true);
      }
    });

    // Also check if we already have a session (user clicked the link)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSessionReady(true);
      }
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }

    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      setError("Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      setError("Impossible de modifier le mot de passe. Demandez un nouveau lien.");
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);

    // Redirect to dashboard after 2 seconds
    setTimeout(() => {
      router.push("/dashboard");
      router.refresh();
    }, 2000);
  }

  if (success) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-400 p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="material-symbols-outlined text-green-600 text-3xl">check_circle</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">
          Mot de passe modifié
        </h1>
        <p className="text-sm text-gray-600">
          Redirection vers le tableau de bord...
        </p>
      </div>
    );
  }

  if (!sessionReady) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-400 p-8 text-center">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="material-symbols-outlined text-amber-600 text-3xl">hourglass_top</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">
          Vérification en cours...
        </h1>
        <p className="text-sm text-gray-600 mb-6">
          Si la page ne change pas, le lien a peut-être expiré.
        </p>
        <Link
          href="/forgot-password"
          className="text-sm text-blue-600 hover:underline font-medium"
        >
          Demander un nouveau lien
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-400 p-5 sm:p-8">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Nouveau mot de passe
        </h1>
        <p className="text-sm text-gray-500 mt-2">
          Choisissez votre nouveau mot de passe.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Nouveau mot de passe
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-lg border border-gray-300 px-4 py-3 min-h-touch focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            placeholder="Minimum 8 caractères"
          />
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
            Confirmer le mot de passe
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-lg border border-gray-300 px-4 py-3 min-h-touch focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            placeholder="Retapez le mot de passe"
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
          {loading ? "Modification..." : "Changer le mot de passe"}
        </button>
      </form>
    </div>
  );
}
