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
      <div className="bg-white rounded-2xl shadow-card border border-stone-200 p-8 text-center">
        <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <span className="material-symbols-outlined text-emerald-600 text-2xl">check_circle</span>
        </div>
        <h1 className="font-heading text-xl font-bold text-gray-900 mb-2">
          Mot de passe modifié
        </h1>
        <p className="text-sm text-gray-500">
          Redirection vers le tableau de bord...
        </p>
      </div>
    );
  }

  if (!sessionReady) {
    return (
      <div className="bg-white rounded-2xl shadow-card border border-stone-200 p-8 text-center">
        <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <span className="material-symbols-outlined text-amber-600 text-2xl">hourglass_top</span>
        </div>
        <h1 className="font-heading text-xl font-bold text-gray-900 mb-2">
          Vérification en cours...
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          Si la page ne change pas, le lien a peut-être expiré.
        </p>
        <Link
          href="/forgot-password"
          className="text-sm text-brand-600 hover:text-brand-700 font-medium transition-colors"
        >
          Demander un nouveau lien
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-card border border-stone-200 p-6 sm:p-8">
      <div className="mb-6">
        <h2 className="font-heading text-xl font-bold text-gray-900">
          Nouveau mot de passe
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Choisissez votre nouveau mot de passe.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
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
            className="input-field"
            placeholder="Minimum 8 caractères"
          />
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1.5">
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
            className="input-field"
            placeholder="Retapez le mot de passe"
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
          {loading ? "Modification..." : "Changer le mot de passe"}
        </button>
      </form>
    </div>
  );
}
