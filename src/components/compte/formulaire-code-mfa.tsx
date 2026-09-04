"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Saisie du code à six chiffres, partagée par les deux endroits où un second
 * facteur peut être réclamé : juste après le mot de passe sur la page de
 * connexion, et sur `/verification` quand une session de niveau simple tente
 * d'atteindre l'application alors qu'un facteur est enregistré.
 */
export function FormulaireCodeMfa({
  factorId,
  onVerifie,
  onAnnuler,
}: {
  factorId: string;
  onVerifie: () => void;
  onAnnuler?: () => void;
}) {
  const [code, setCode] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function verifier(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);

    const supabase = createClient();
    const { data: defi, error: erreurDefi } = await supabase.auth.mfa.challenge({
      factorId,
    });
    if (erreurDefi || !defi) {
      setErreur("La vérification n'a pas pu démarrer. Réessayez.");
      setEnvoi(false);
      return;
    }

    const { error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: defi.id,
      code: code.trim(),
    });

    if (error) {
      // Message volontairement identique quelle que soit la cause : un code
      // faux et un code expiré ne doivent pas se distinguer.
      setErreur("Code incorrect ou expiré. Regardez le code affiché à l'instant.");
      setCode("");
      setEnvoi(false);
      return;
    }

    onVerifie();
  }

  return (
    <form onSubmit={verifier} className="space-y-4">
      <div>
        <label htmlFor="code-mfa" className="block text-sm font-medium text-gray-700 mb-1">
          Code de votre application d&apos;authentification
        </label>
        <input
          id="code-mfa"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          required
          autoFocus
          className="w-full rounded-lg border border-gray-400 px-4 py-3 min-h-touch text-center text-2xl tracking-[0.4em] font-mono"
          placeholder="000000"
        />
        <p className="text-xs text-gray-500 mt-1">
          Six chiffres, renouvelés toutes les trente secondes.
        </p>
      </div>

      {erreur && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {erreur}
        </p>
      )}

      <button
        type="submit"
        disabled={envoi || code.length !== 6}
        className="w-full py-4 min-h-touch bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 text-lg"
      >
        {envoi ? "Vérification…" : "Vérifier"}
      </button>

      {onAnnuler && (
        <button
          type="button"
          onClick={onAnnuler}
          className="w-full py-3 min-h-touch text-sm text-gray-600 hover:text-gray-900"
        >
          Utiliser un autre compte
        </button>
      )}
    </form>
  );
}
