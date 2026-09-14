"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { Tables } from "@/types/database";

interface RapportActionsProps {
  visiteId: string;
  hasRapportUrl: boolean;
  rapportUrl: string | null;
  rapportReference: string | null;
  emailEnvoye: boolean;
  destinataires: Tables<"destinataires">[];
  avenantsIds: string[];
  avenantsError: boolean;
}

export function RapportActions({
  visiteId,
  hasRapportUrl,
  rapportUrl,
  rapportReference,
  emailEnvoye,
  destinataires,
  avenantsIds,
  avenantsError,
}: RapportActionsProps) {
  const router = useRouter();
  const [reference, setReference] = useState(rapportReference);
  const [motif, setMotif] = useState("");
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [pdfGenerated, setPdfGenerated] = useState(hasRapportUrl);
  const [pdfUrl, setPdfUrl] = useState<string | null>(rapportUrl);
  const [emailSent, setEmailSent] = useState(emailEnvoye);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Modal de sélection des destinataires
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(destinataires.map((d) => d.id)),
  );
  const [adHocInput, setAdHocInput] = useState("");
  const [adHocEmails, setAdHocEmails] = useState<string[]>([]);
  const [adHocError, setAdHocError] = useState<string | null>(null);

  const hasDestinataires = destinataires.length > 0;
  const totalSelected = selectedIds.size + adHocEmails.length;

  async function handleGeneratePdf() {
    setGeneratingPdf(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/visites/${visiteId}/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motif, rapportReference: reference }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? "Erreur lors de la génération du PDF");
      }

      const data = await res.json();
      setPdfGenerated(true);
      setPdfUrl(data.url);
      setReference(data.reference);
      setEmailSent(false);
      setShowVersionModal(false);
      setMotif("");
      router.refresh();
      setSuccessMessage(`PDF généré : ${data.filename}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erreur lors de la génération",
      );
    } finally {
      setGeneratingPdf(false);
    }
  }

  function openEmailModal() {
    if (!pdfGenerated) {
      setError("Veuillez d'abord générer le PDF.");
      return;
    }
    setError(null);
    setSuccessMessage(null);
    // Re-cocher tous par défaut à chaque ouverture
    setSelectedIds(new Set(destinataires.map((d) => d.id)));
    setAdHocEmails([]);
    setAdHocInput("");
    setAdHocError(null);
    setShowEmailModal(true);
  }

  function addAdHocEmail() {
    const email = adHocInput.trim();
    if (!email) return;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email) || /[\r\n]/.test(email)) {
      setAdHocError("Format d'email invalide.");
      return;
    }

    const lower = email.toLowerCase();
    if (adHocEmails.some((e) => e.toLowerCase() === lower)) {
      setAdHocError("Cet email est déjà ajouté.");
      return;
    }
    if (destinataires.some((d) => d.email.toLowerCase() === lower)) {
      setAdHocError(
        "Cet email est déjà dans la liste des destinataires du chantier.",
      );
      return;
    }

    setAdHocEmails((prev) => [...prev, email]);
    setAdHocInput("");
    setAdHocError(null);
  }

  function removeAdHocEmail(email: string) {
    setAdHocEmails((prev) => prev.filter((e) => e !== email));
  }

  function toggleDestinataire(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === destinataires.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(destinataires.map((d) => d.id)));
    }
  }

  async function handleSendEmail() {
    if (totalSelected === 0) {
      setError("Sélectionnez au moins un destinataire.");
      return;
    }
    setSendingEmail(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/visites/${visiteId}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rapportReference: reference,
          avenantsIds,
          destinataireIds: Array.from(selectedIds),
          extraEmails: adHocEmails,
        }),
      });

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body.error ?? "Erreur lors de l'envoi");
      }

      setEmailSent(body.dossierAJour !== false);
      setShowEmailModal(false);
      setSuccessMessage(
        `Email envoyé à ${body.count} destinataire(s) : ${(body.sent_to ?? []).join(", ")}${body.dossierAJour === false ? ". Le dossier a évolué ou sa confirmation est indisponible : rechargez pour vérifier les dernières pièces." : ""}${body.traceConfirmee === false ? ". La confirmation du journal est indisponible ; ne renvoyez pas le même email sans vérifier son historique." : ""}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'envoi");
    } finally {
      setSendingEmail(false);
    }
  }

  const allSelected =
    destinataires.length > 0 && selectedIds.size === destinataires.length;

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="rounded-lg bg-green-50 p-4 text-sm text-green-700">
          {successMessage}
        </div>
      )}

      <Button
        size="lg"
        className="w-full"
        loading={generatingPdf}
        onClick={() => pdfGenerated ? setShowVersionModal(true) : handleGeneratePdf()}
      >
        {pdfGenerated ? "Créer une nouvelle version" : "Générer le PDF"}
      </Button>

      <Modal isOpen={showVersionModal} onClose={() => { if (!generatingPdf) setShowVersionModal(false); }} title="Nouvelle version du rapport">
        <p className="mb-3 text-sm text-gray-600">La version précédente sera conservée dans l’historique. Précisez la raison de cette nouvelle génération.</p>
        <label htmlFor="motif-version" className="block text-sm font-medium">Motif</label>
        <textarea id="motif-version" value={motif} onChange={(e) => setMotif(e.target.value)} maxLength={1000} className="mt-2 mb-4 w-full rounded border p-3" rows={3} />
        {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
        <Button onClick={handleGeneratePdf} loading={generatingPdf} disabled={motif.trim().length < 5}>Créer et conserver cette version</Button>
      </Modal>

      {pdfGenerated && pdfUrl && (
        <>
          <div className="flex gap-3">
            <Button
              size="lg"
              variant="secondary"
              className="flex-1"
              onClick={() => setShowPreview(!showPreview)}
            >
              {showPreview ? "Masquer l'aperçu" : "Consulter le PDF"}
            </Button>
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 inline-flex items-center justify-center min-h-[44px] px-4 py-2 bg-gray-200 text-gray-800 font-medium rounded-lg hover:bg-gray-300 transition-colors text-center"
            >
              Ouvrir dans un nouvel onglet
            </a>
          </div>

          {showPreview && (
            <div className="border border-gray-400 rounded-lg overflow-hidden">
              <iframe
                key={pdfUrl}
                src={pdfUrl}
                className="w-full"
                style={{ height: "80vh" }}
                title="Aperçu du rapport de visite"
              />
            </div>
          )}
        </>
      )}

      <Button
        size="lg"
        variant={!pdfGenerated || !hasDestinataires ? "secondary" : "primary"}
        className="w-full"
        disabled={!pdfGenerated || !hasDestinataires || avenantsError}
        onClick={openEmailModal}
      >
        {emailSent ? "Renvoyer par email…" : "Envoyer par email…"}
      </Button>

      {!hasDestinataires && (
        <p className="text-xs text-amber-600 text-center">
          Ajoutez des destinataires dans la fiche chantier pour envoyer le rapport.
        </p>
      )}

      <Modal
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        title="Choisir les destinataires"
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-700">Pièces jointes : le rapport et {avenantsIds.length} avenant(s) conservé(s). Si un avenant est ajouté entre-temps, l’envoi demandera une nouvelle vérification.</p>
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">
              {totalSelected} sélectionné{totalSelected > 1 ? "s" : ""}
              {destinataires.length > 0 && (
                <>
                  {" "}({selectedIds.size}/{destinataires.length} de la liste
                  {adHocEmails.length > 0 ? ` + ${adHocEmails.length} ajouté${adHocEmails.length > 1 ? "s" : ""}` : ""})
                </>
              )}
            </p>
            {destinataires.length > 0 && (
              <button
                type="button"
                onClick={toggleAll}
                className="text-xs text-blue-600 hover:underline"
              >
                {allSelected ? "Tout décocher" : "Tout cocher"}
              </button>
            )}
          </div>

          {destinataires.length > 0 && (
            <div className="max-h-60 overflow-y-auto space-y-1 border border-gray-200 rounded-lg p-1">
              {destinataires.map((d) => {
                const checked = selectedIds.has(d.id);
                return (
                  <label
                    key={d.id}
                    className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                      checked
                        ? "bg-blue-50 border border-blue-200"
                        : "hover:bg-gray-50 border border-transparent"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleDestinataire(d.id)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1 min-w-0 text-sm">
                      <p className="font-medium text-gray-900 truncate">
                        {d.nom}
                        {d.organisation && (
                          <span className="font-normal text-gray-500">
                            {" "}— {d.organisation}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{d.email}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          )}

          {/* Email ad-hoc */}
          <div className="border-t pt-3 space-y-2">
            <label className="text-xs font-medium text-gray-500 block">
              Ajouter un email ponctuel
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                value={adHocInput}
                onChange={(e) => {
                  setAdHocInput(e.target.value);
                  setAdHocError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addAdHocEmail();
                  }
                }}
                placeholder="nom@exemple.com"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[44px]"
              />
              <button
                type="button"
                onClick={addAdHocEmail}
                disabled={!adHocInput.trim()}
                className="px-3 py-2 min-h-[44px] bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 text-sm font-medium"
              >
                + Ajouter
              </button>
            </div>
            {adHocError && (
              <p className="text-xs text-red-600">{adHocError}</p>
            )}
            {adHocEmails.length > 0 && (
              <ul className="flex flex-wrap gap-1">
                {adHocEmails.map((email) => (
                  <li
                    key={email}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 border border-amber-200 rounded-full text-xs text-amber-800"
                  >
                    {email}
                    <button
                      type="button"
                      onClick={() => removeAdHocEmail(email)}
                      className="text-amber-600 hover:text-amber-800"
                      aria-label={`Retirer ${email}`}
                    >
                      <span translate="no" className="material-symbols-outlined text-sm">close</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleSendEmail}
              disabled={totalSelected === 0 || sendingEmail}
              className="flex-1 py-3 min-h-[44px] bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm flex items-center justify-center gap-2"
            >
              <span translate="no" className="material-symbols-outlined text-lg">send</span>
              {sendingEmail
                ? "Envoi..."
                : `Envoyer (${totalSelected})`}
            </button>
            <button
              type="button"
              onClick={() => setShowEmailModal(false)}
              disabled={sendingEmail}
              className="px-4 py-3 min-h-[44px] bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm disabled:opacity-50"
            >
              Annuler
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
