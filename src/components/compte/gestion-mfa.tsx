"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Facteur {
  id: string;
  friendly_name?: string;
  status: string;
  created_at: string;
}

type Inscription =
  | { etape: "repos" }
  | { etape: "en-cours"; factorId: string; qrCode: string; secret: string };

/**
 * Enrôlement et retrait d'un second facteur (application d'authentification).
 *
 * Supabase fournit tout le protocole : `enroll` crée un facteur « non
 * vérifié » et renvoie le QR code, `challenge` puis `verify` le confirment.
 * Un facteur resté non vérifié n'a aucun effet — c'est pourquoi l'enrôlement
 * n'est terminé qu'après la saisie d'un premier code.
 */
export function GestionMfa({ facteursInitiaux }: { facteursInitiaux: Facteur[] }) {
  const router = useRouter();
  const [facteurs, setFacteurs] = useState<Facteur[]>(facteursInitiaux);
  const [inscription, setInscription] = useState<Inscription>({ etape: "repos" });
  const [code, setCode] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  const verifies = facteurs.filter((f) => f.status === "verified");

  async function recharger() {
    const supabase = createClient();
    const { data } = await supabase.auth.mfa.listFactors();
    setFacteurs((data?.all ?? []) as Facteur[]);
  }

  async function demarrer() {
    setErreur(null);
    setOccupe(true);
    const supabase = createClient();

    // Un enrôlement précédent laissé en plan bloquerait le suivant : Supabase
    // refuse deux facteurs du même nom. On nettoie les non vérifiés d'abord.
    const { data: existants } = await supabase.auth.mfa.listFactors();
    for (const f of existants?.all ?? []) {
      if (f.status !== "verified") {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
    }

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Application d'authentification (${new Date().toLocaleDateString("fr-CH")})`,
    });

    if (error || !data) {
      setErreur("L'enrôlement n'a pas pu démarrer. Réessayez.");
      setOccupe(false);
      return;
    }

    setInscription({
      etape: "en-cours",
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    });
    setOccupe(false);
  }

  async function confirmer(e: React.FormEvent) {
    e.preventDefault();
    if (inscription.etape !== "en-cours") return;
    setErreur(null);
    setOccupe(true);

    const supabase = createClient();
    const { data: defi, error: erreurDefi } = await supabase.auth.mfa.challenge({
      factorId: inscription.factorId,
    });
    if (erreurDefi || !defi) {
      setErreur("La vérification n'a pas pu démarrer. Réessayez.");
      setOccupe(false);
      return;
    }

    const { error } = await supabase.auth.mfa.verify({
      factorId: inscription.factorId,
      challengeId: defi.id,
      code: code.trim(),
    });

    if (error) {
      setErreur("Code incorrect. Vérifiez l'heure de votre téléphone, puis réessayez.");
      setCode("");
      setOccupe(false);
      return;
    }

    setInscription({ etape: "repos" });
    setCode("");
    await recharger();
    setOccupe(false);
    router.refresh();
  }

  async function annuler() {
    if (inscription.etape !== "en-cours") return;
    const supabase = createClient();
    await supabase.auth.mfa.unenroll({ factorId: inscription.factorId });
    setInscription({ etape: "repos" });
    setCode("");
    setErreur(null);
    await recharger();
  }

  async function retirer(factorId: string) {
    if (
      !confirm(
        "Retirer ce second facteur ? Votre compte ne sera plus protégé que par son mot de passe."
      )
    ) {
      return;
    }
    setOccupe(true);
    const supabase = createClient();
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) {
      setErreur("Le retrait a échoué. Réessayez.");
      setOccupe(false);
      return;
    }
    await recharger();
    setOccupe(false);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {erreur && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2">
          <span translate="no" className="material-symbols-outlined text-sm">error</span>
          {erreur}
        </p>
      )}

      {verifies.length > 0 && inscription.etape === "repos" && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="text-sm font-medium text-green-900 flex items-center gap-2">
            <span translate="no" className="material-symbols-outlined text-base">verified_user</span>
            Second facteur actif
          </p>
          <p className="text-sm text-green-800 mt-1">
            Une application d&apos;authentification est exigée à chaque connexion, en plus
            de votre mot de passe.
          </p>
          <ul className="mt-3 space-y-2">
            {verifies.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between gap-3 flex-wrap bg-white rounded-lg border border-green-200 px-3 py-2"
              >
                <span className="text-sm text-gray-700 min-w-0 break-words">
                  {f.friendly_name ?? "Application d'authentification"}
                  <span className="text-gray-400">
                    {" · depuis le "}
                    {new Date(f.created_at).toLocaleDateString("fr-CH")}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => retirer(f.id)}
                  disabled={occupe}
                  className="text-xs font-medium text-red-600 hover:text-red-800 min-h-touch px-2 disabled:opacity-50"
                >
                  Retirer
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {verifies.length === 0 && inscription.etape === "repos" && (
        <div className="rounded-lg border border-gray-300 bg-white p-4">
          <p className="text-sm text-gray-700">
            Votre compte n&apos;est protégé que par son mot de passe. Un second facteur
            ajoute un code à six chiffres, produit par une application sur votre
            téléphone, qui change toutes les trente secondes.
          </p>
          <button
            type="button"
            onClick={demarrer}
            disabled={occupe}
            className="mt-3 inline-flex items-center gap-2 px-4 py-2 min-h-touch bg-[#002855] text-white text-sm font-medium rounded-lg hover:bg-[#002855]/90 disabled:opacity-50"
          >
            <span translate="no" className="material-symbols-outlined text-base">add_moderator</span>
            Activer le second facteur
          </button>
        </div>
      )}

      {inscription.etape === "en-cours" && (
        <div className="rounded-lg border border-gray-300 bg-white p-4 space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-900">
              1. Scannez ce code avec votre application d&apos;authentification
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Google Authenticator, Microsoft Authenticator, 1Password, Bitwarden…
            </p>
          </div>

          {/* Le QR est renvoyé par Supabase sous forme d'URI de données ; la
              politique de sécurité de contenu autorise `data:` pour les images. */}
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={inscription.qrCode}
              alt="Code QR à scanner avec votre application d'authentification"
              className="w-48 h-48 bg-white rounded-lg border border-gray-200 p-2"
            />
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer text-gray-600 min-h-touch flex items-center">
              Impossible de scanner ? Saisir la clé à la main
            </summary>
            <p className="mt-2 font-mono text-xs break-all bg-gray-50 border border-gray-200 rounded-lg p-2">
              {inscription.secret}
            </p>
          </details>

          <form onSubmit={confirmer} className="space-y-3">
            <label htmlFor="code-enrolement" className="block text-sm font-medium text-gray-900">
              2. Entrez le code affiché par l&apos;application
            </label>
            <input
              id="code-enrolement"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              required
              className="w-full rounded-lg border border-gray-400 px-4 py-3 min-h-touch text-center text-xl tracking-[0.4em] font-mono"
              placeholder="000000"
            />
            <div className="flex gap-2 flex-wrap">
              <button
                type="submit"
                disabled={occupe || code.length !== 6}
                className="flex-1 px-4 py-3 min-h-touch bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
              >
                {occupe ? "Vérification…" : "Confirmer"}
              </button>
              <button
                type="button"
                onClick={annuler}
                disabled={occupe}
                className="px-4 py-3 min-h-touch border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                Annuler
              </button>
            </div>
          </form>

          <p className="text-xs text-gray-500">
            Tant que ce premier code n&apos;est pas saisi, le facteur reste inactif et
            votre connexion ne change pas.
          </p>
        </div>
      )}

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
        <p className="text-xs text-amber-900">
          <strong>Gardez un moyen de secours.</strong> Si vous perdez le téléphone qui
          porte l&apos;application, la reprise en main demande une intervention en base
          de données. Notez la clé de secours affichée à l&apos;enrôlement, ou enregistrez
          le compte dans un gestionnaire de mots de passe synchronisé.
        </p>
      </div>
    </div>
  );
}
