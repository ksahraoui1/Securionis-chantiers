"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function RegisterPage() {
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!nom.trim()) {
      setError("Le nom est requis.");
      return;
    }

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

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          nom: nom.trim(),
        },
      },
    });

    if (signUpError) {
      // Message générique pour éviter l'énumération de comptes
      setError("Impossible de créer le compte. Vérifiez vos informations ou essayez de vous connecter.");
      setLoading(false);
      return;
    }

    // Create profile
    if (data.user) {
      await supabase.from("profiles").upsert({
        id: data.user.id,
        nom: nom.trim(),
        email,
        role: "invité",
      });
    }

    // Check if email confirmation is required
    if (data.user && !data.session) {
      setSuccess(true);
    } else {
      router.push("/dashboard");
      router.refresh();
    }

    setLoading(false);
  }

  if (success) {
    return (
      <div className="bg-white rounded-2xl shadow-card border border-stone-200 p-8 text-center">
        <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <span className="material-symbols-outlined text-emerald-600 text-2xl">mark_email_read</span>
        </div>
        <h1 className="font-heading text-xl font-bold text-gray-900 mb-2">
          Vérifiez votre email
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          Un lien de confirmation a été envoyé à <strong className="text-gray-700">{email}</strong>.
          Cliquez dessus pour activer votre compte.
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
          Créer un compte
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Securionis Chantiers — Inspection SST
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="nom" className="block text-sm font-medium text-gray-700 mb-1.5">
            Nom complet
          </label>
          <input
            id="nom"
            type="text"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            required
            autoComplete="name"
            className="input-field"
            placeholder="Jean Dupont"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
            Email professionnel
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
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
            Mot de passe
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
            placeholder="Minimum 8 caractères (majuscule, minuscule, chiffre)"
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
          {loading ? "Création..." : "Créer mon compte"}
        </button>
      </form>

      <div className="mt-6 pt-5 border-t border-stone-150 text-center">
        <p className="text-sm text-gray-500">
          Déjà un compte ?{" "}
          <Link href="/login" className="text-brand-600 hover:text-brand-700 font-semibold transition-colors">
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  );
}
