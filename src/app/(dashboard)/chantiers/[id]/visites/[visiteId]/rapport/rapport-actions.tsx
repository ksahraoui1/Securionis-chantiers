"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { Tables } from "@/types/database";

interface RapportActionsProps {
  visiteId: string;
  hasRapportUrl: boolean;
  rapportUrl: string | null;
  emailEnvoye: boolean;
  destinataires: Tables<"destinataires">[];
}

export function RapportActions({
  visiteId,
  hasRapportUrl,
  rapportUrl,
  emailEnvoye,
  destinataires,
}: RapportActionsProps) {
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

  const hasDestinataires = destinataires.length > 0;

  async function handleGeneratePdf() {
    setGeneratingPdf(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/visites/${visiteId}/pdf`, {
        method: "POST",
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? "Erreur lors de la génération du PDF");
      }

      const data = await res.json();
      setPdfGenerated(true);
      setPdfUrl(data.url);
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
    setShowEmailModal(true);
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
    if (selectedIds.size === 0) {
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
        body: JSON.stringify({ destinataireIds: Array.from(selectedIds) }),
      });

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body.error ?? "Erreur lors de l'envoi");
      }

      setEmailSent(true);
      setShowEmailModal(false);
      setSuccessMessage(
        `Email envoyé à ${body.count} destinataire(s) : ${(body.sent_to ?? []).join(", ")}`,
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
        onClick={handleGeneratePdf}
      >
        {pdfGenerated ? "Régénérer le PDF" : "Générer le PDF"}
      </Button>

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
        disabled={!pdfGenerated || !hasDestinataires}
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
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">
              {selectedIds.size} / {destinataires.length} sélectionné
              {selectedIds.size > 1 ? "s" : ""}
            </p>
            <button
              type="button"
              onClick={toggleAll}
              className="text-xs text-blue-600 hover:underline"
            >
              {allSelected ? "Tout décocher" : "Tout cocher"}
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto space-y-1 border border-gray-200 rounded-lg p-1">
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

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleSendEmail}
              disabled={selectedIds.size === 0 || sendingEmail}
              className="flex-1 py-3 min-h-[44px] bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-lg">send</span>
              {sendingEmail
                ? "Envoi..."
                : `Envoyer (${selectedIds.size})`}
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
