"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface RapportActionsProps {
  visiteId: string;
  hasRapportUrl: boolean;
  rapportUrl: string | null;
  emailEnvoye: boolean;
  hasDestinataires: boolean;
}

export function RapportActions({
  visiteId,
  hasRapportUrl,
  rapportUrl,
  emailEnvoye,
  hasDestinataires,
}: RapportActionsProps) {
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [pdfGenerated, setPdfGenerated] = useState(hasRapportUrl);
  const [pdfUrl, setPdfUrl] = useState<string | null>(rapportUrl);
  const [emailSent, setEmailSent] = useState(emailEnvoye);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

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
        err instanceof Error ? err.message : "Erreur lors de la génération"
      );
    } finally {
      setGeneratingPdf(false);
    }
  }

  async function handleSendEmail() {
    if (!pdfGenerated) {
      setError("Veuillez d'abord générer le PDF.");
      return;
    }
    setSendingEmail(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/visites/${visiteId}/email`, {
        method: "POST",
      });

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body.error ?? "Erreur lors de l'envoi");
      }

      setEmailSent(true);
      setSuccessMessage(`Email envoyé à ${body.count} destinataire(s) : ${(body.sent_to ?? []).join(", ")}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erreur lors de l'envoi"
      );
    } finally {
      setSendingEmail(false);
    }
  }

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
        loading={sendingEmail}
        disabled={sendingEmail || !pdfGenerated || !hasDestinataires}
        onClick={handleSendEmail}
      >
        {emailSent ? "Renvoyer par email" : "Envoyer par email"}
      </Button>

      {!hasDestinataires && (
        <p className="text-xs text-amber-600 text-center">
          Ajoutez des destinataires dans la fiche chantier pour envoyer le rapport.
        </p>
      )}
    </div>
  );
}
