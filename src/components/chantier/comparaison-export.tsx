"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import {
  assainirNom,
  dateFichier,
  telecharger,
} from "@/lib/utils/comparaison-capture";
import {
  construireDocumentImpression,
  type AnnotationImpression,
} from "@/lib/utils/comparaison-impression";
import { messageErreurEnvoi } from "@/lib/utils/erreur-envoi";

const NAVY = "#002855";
const ORANGE = "#E67E22";

interface PlanResume {
  id: string;
  nom: string;
  plan_version: number | null;
}

type Ton = "info" | "ok" | "erreur";

interface Message {
  ton: Ton;
  texte: string;
}

const TONS: Record<Ton, string> = {
  info: "text-gray-600",
  ok: "text-green-700",
  erreur: "text-red-700",
};

const ICONES: Record<Ton, string> = {
  info: "hourglass_top",
  ok: "check_circle",
  erreur: "error",
};

function version(plan: PlanResume): string {
  return `V${plan.plan_version ?? 0}`;
}

export function GroupeExport({
  pret,
  comparaisonId,
  chantierNom,
  docPE,
  docEXE,
  pagePE,
  pageEXE,
  annotations,
  onCapturer,
}: {
  pret: boolean;
  comparaisonId: string | null;
  chantierNom: string;
  docPE: PlanResume;
  docEXE: PlanResume;
  pagePE: number;
  pageEXE: number;
  annotations: AnnotationImpression[];
  onCapturer: () => Promise<Blob>;
}) {
  const nbAnnotations = annotations.length;
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [partageOuvert, setPartageOuvert] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Fermeture du menu au clic extérieur et à Échap
  useEffect(() => {
    if (!menuOuvert) return;

    function auClic(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOuvert(false);
      }
    }
    function auClavier(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOuvert(false);
    }

    document.addEventListener("mousedown", auClic);
    document.addEventListener("keydown", auClavier);
    return () => {
      document.removeEventListener("mousedown", auClic);
      document.removeEventListener("keydown", auClavier);
    };
  }, [menuOuvert]);

  function nomPNG(): string {
    return `Comparaison_${assainirNom(chantierNom)}_PE_${version(
      docPE
    )}_EXE_${version(docEXE)}_${dateFichier()}.png`;
  }

  function nomPDF(): string {
    return `Rapport_comparaison_${assainirNom(chantierNom)}_${dateFichier()}.pdf`;
  }

  async function avec(attente: string, action: () => Promise<void>) {
    setMenuOuvert(false);
    setOccupe(true);
    setMessage({ ton: "info", texte: attente });
    try {
      await action();
    } catch (err) {
      setMessage({
        ton: "erreur",
        texte: err instanceof Error ? err.message : "L'export a échoué.",
      });
    } finally {
      setOccupe(false);
    }
  }

  function exporterPNG() {
    void avec("Capture de la vue…", async () => {
      telecharger(await onCapturer(), nomPNG());
      setMessage({ ton: "ok", texte: "Image PNG téléchargée." });
    });
  }

  function exporterPDF() {
    void avec("Génération du rapport PDF…", async () => {
      if (!comparaisonId) {
        throw new Error(
          "La session de comparaison n'est pas encore enregistrée. Réessayez dans un instant."
        );
      }

      const formulaire = new FormData();
      formulaire.append("image", await onCapturer(), "comparaison.png");

      const reponse = await fetch(`/api/comparaisons/${comparaisonId}/pdf`, {
        method: "POST",
        body: formulaire,
      });

      if (!reponse.ok) {
        throw new Error(
          await messageErreurEnvoi(reponse, "La génération du rapport a échoué.")
        );
      }

      telecharger(await reponse.blob(), nomPDF());
      setMessage({ ton: "ok", texte: "Rapport PDF téléchargé." });
    });
  }

  function imprimer() {
    void avec("Préparation de l'impression…", async () => {
      const blob = await onCapturer();
      const url = URL.createObjectURL(blob);

      const cadre = document.createElement("iframe");
      cadre.setAttribute("aria-hidden", "true");
      cadre.style.cssText =
        "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
      document.body.appendChild(cadre);

      let nettoye = false;
      const nettoyer = () => {
        if (nettoye) return;
        nettoye = true;
        URL.revokeObjectURL(url);
        cadre.remove();
      };

      cadre.srcdoc = construireDocumentImpression({
        chantierNom,
        titrePE: `${docPE.nom}${docPE.plan_version ? ` V${docPE.plan_version}` : ""}`,
        titreEXE: `${docEXE.nom}${
          docEXE.plan_version ? ` V${docEXE.plan_version}` : ""
        }`,
        pagePE,
        pageEXE,
        imageUrl: url,
        annotations,
      });

      await new Promise<void>((resoudre) => {
        cadre.onload = () => {
          const fenetre = cadre.contentWindow;
          if (!fenetre) {
            nettoyer();
            resoudre();
            return;
          }

          // La boîte d'impression est modale : le nettoyage attend sa fermeture.
          fenetre.addEventListener("afterprint", nettoyer);

          const lancer = () => {
            try {
              fenetre.focus();
              fenetre.print();
            } catch {
              nettoyer();
            }
            resoudre();
          };

          // Imprimer avant la fin du décodage donnerait une page blanche.
          const image = fenetre.document.querySelector("img");
          if (image && !image.complete) {
            image.onload = lancer;
            image.onerror = lancer;
          } else {
            lancer();
          }
        };
      });

      // Filet : certains navigateurs n'émettent jamais « afterprint ».
      setTimeout(nettoyer, 120_000);
      setMessage({
        ton: "ok",
        texte:
          "Boîte d'impression ouverte. Décochez « En-têtes et pieds de page » pour un rendu sans la date ni l'URL.",
      });
    });
  }

  const desactive = !pret || occupe;

  return (
    <>
      <div className="flex items-center gap-1 relative z-30" ref={menuRef}>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOuvert((v) => !v)}
            disabled={desactive}
            aria-haspopup="menu"
            aria-expanded={menuOuvert}
            title="Exporter la comparaison"
            className="inline-flex items-center gap-1.5 min-h-touch px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 hover:bg-[#002855]/10"
            style={{ color: NAVY }}
          >
            <span translate="no" className="material-symbols-outlined text-lg">
              ios_share
            </span>
            <span className="hidden sm:inline">Exporter</span>
            <span translate="no" className="material-symbols-outlined text-base">
              {menuOuvert ? "expand_less" : "expand_more"}
            </span>
          </button>

          {menuOuvert && (
            <div
              role="menu"
              className="absolute left-0 top-full mt-1 z-40 w-72 rounded-lg border border-gray-300 bg-white shadow-lg py-1"
            >
              <ElementMenu
                icone="image"
                titre="Exporter en PNG"
                detail="Image de la vue actuelle, annotations comprises"
                onClick={exporterPNG}
              />
              <ElementMenu
                icone="picture_as_pdf"
                titre="Exporter en PDF"
                detail={`Rapport structuré avec la liste des ${nbAnnotations} annotation${
                  nbAnnotations > 1 ? "s" : ""
                }`}
                onClick={exporterPDF}
              />
            </div>
          )}
        </div>

        <BoutonBarre
          icone="print"
          libelle="Imprimer"
          titre="Imprimer la vue de comparaison"
          desactive={desactive}
          onClick={imprimer}
        />
        <BoutonBarre
          icone="mail"
          libelle="Partager"
          titre="Partager la comparaison par email"
          desactive={desactive}
          onClick={() => {
            setMenuOuvert(false);
            setPartageOuvert(true);
          }}
        />
      </div>

      {message && (
        /* Le groupe est posé dans la barre d'outils (flex-wrap) : `order-last`
           renvoie le message sur sa propre ligne, sous les boutons. */
        <p
          className={`order-last basis-full w-full text-xs flex items-center gap-1 ${
            TONS[message.ton]
          }`}
          role="status"
        >
          <span translate="no" className="material-symbols-outlined text-sm">
            {ICONES[message.ton]}
          </span>
          {message.texte}
        </p>
      )}

      {partageOuvert && (
        <ModalePartageEmail
          comparaisonId={comparaisonId}
          chantierNom={chantierNom}
          docPE={docPE}
          docEXE={docEXE}
          nbAnnotations={nbAnnotations}
          onCapturer={onCapturer}
          onFermer={() => setPartageOuvert(false)}
        />
      )}
    </>
  );
}

function ElementMenu({
  icone,
  titre,
  detail,
  onClick,
}: {
  icone: string;
  titre: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="w-full flex items-start gap-2 px-3 py-2 min-h-touch text-left hover:bg-gray-100 transition-colors"
    >
      <span
        translate="no"
        className="material-symbols-outlined text-lg mt-0.5 shrink-0"
        style={{ color: ORANGE }}
      >
        {icone}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold" style={{ color: NAVY }}>
          {titre}
        </span>
        <span className="block text-[11px] text-gray-500">{detail}</span>
      </span>
    </button>
  );
}

function BoutonBarre({
  icone,
  libelle,
  titre,
  desactive,
  onClick,
}: {
  icone: string;
  libelle: string;
  titre: string;
  desactive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desactive}
      title={titre}
      aria-label={titre}
      className="inline-flex items-center gap-1.5 min-h-touch min-w-touch justify-center px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 hover:bg-[#002855]/10"
      style={{ color: NAVY }}
    >
      <span translate="no" className="material-symbols-outlined text-lg">
        {icone}
      </span>
      <span className="hidden sm:inline">{libelle}</span>
    </button>
  );
}

// ============================================================
// Partage par email
// ============================================================

function ModalePartageEmail({
  comparaisonId,
  chantierNom,
  docPE,
  docEXE,
  nbAnnotations,
  onCapturer,
  onFermer,
}: {
  comparaisonId: string | null;
  chantierNom: string;
  docPE: PlanResume;
  docEXE: PlanResume;
  nbAnnotations: number;
  onCapturer: () => Promise<Blob>;
  onFermer: () => void;
}) {
  const [destinataire, setDestinataire] = useState("");
  const [message, setMessage] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoye, setEnvoye] = useState(false);

  async function envoyer() {
    setErreur(null);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinataire.trim())) {
      setErreur("Saisissez une adresse email valide.");
      return;
    }
    if (!comparaisonId) {
      setErreur(
        "La session de comparaison n'est pas encore enregistrée. Réessayez dans un instant."
      );
      return;
    }

    setEnvoi(true);
    try {
      const formulaire = new FormData();
      formulaire.append("to", destinataire.trim());
      formulaire.append("message", message.trim());
      formulaire.append("image", await onCapturer(), "comparaison.png");

      const reponse = await fetch(`/api/comparaisons/${comparaisonId}/email`, {
        method: "POST",
        body: formulaire,
      });

      if (!reponse.ok) {
        throw new Error(await messageErreurEnvoi(reponse, "L'envoi a échoué."));
      }

      setEnvoye(true);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "L'envoi a échoué.");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Modal
      isOpen
      onClose={envoi ? () => undefined : onFermer}
      title="Partager la comparaison par email"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onFermer}
            disabled={envoi}
            className="px-4 py-2 min-h-touch text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50"
          >
            {envoye ? "Fermer" : "Annuler"}
          </button>
          {!envoye && (
            <button
              type="button"
              onClick={envoyer}
              disabled={envoi}
              className="inline-flex items-center gap-2 px-4 py-2 min-h-touch text-sm text-white font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
              style={{ backgroundColor: NAVY }}
            >
              <span translate="no" className="material-symbols-outlined text-lg">
                send
              </span>
              {envoi ? "Envoi…" : "Envoyer"}
            </button>
          )}
        </div>
      }
    >
      {envoye ? (
        <p className="text-sm text-green-700 flex items-start gap-2">
          <span translate="no" className="material-symbols-outlined text-lg">
            mark_email_read
          </span>
          La comparaison a été envoyée à {destinataire.trim()}, avec la capture
          PNG en pièce jointe et le lien vers la vue.
        </p>
      ) : (
        <div className="space-y-4">
          <div>
            <label
              htmlFor="partage-destinataire"
              className="block text-xs font-medium text-gray-500 mb-1"
            >
              Destinataire *
            </label>
            <input
              id="partage-destinataire"
              type="email"
              value={destinataire}
              onChange={(e) => setDestinataire(e.target.value)}
              placeholder="prenom.nom@exemple.ch"
              autoComplete="off"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 min-h-touch text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="partage-message"
              className="block text-xs font-medium text-gray-500 mb-1"
            >
              Message (optionnel)
            </label>
            <textarea
              id="partage-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Précisez ce que le destinataire doit regarder…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <dl className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs space-y-1">
            <div className="flex gap-2">
              <dt className="text-gray-500 w-24 shrink-0">Chantier</dt>
              <dd className="text-gray-900 font-medium">{chantierNom}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-gray-500 w-24 shrink-0">Plans</dt>
              <dd className="text-gray-900">
                PE {version(docPE)} vs EXE {version(docEXE)}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-gray-500 w-24 shrink-0">Pièce jointe</dt>
              <dd className="text-gray-900">
                Capture PNG de la vue actuelle ({nbAnnotations} annotation
                {nbAnnotations > 1 ? "s" : ""})
              </dd>
            </div>
          </dl>

          <p className="text-[11px] text-gray-500">
            Le lien inclus dans l&apos;email n&apos;ouvre la comparaison que pour
            les utilisateurs autorisés sur ce chantier.
          </p>

          {erreur && (
            <p className="text-sm text-red-600 flex items-start gap-1">
              <span translate="no" className="material-symbols-outlined text-sm">
                error
              </span>
              {erreur}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
