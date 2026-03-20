"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface RapportActionsProps {
  visiteId: string;
  hasRapportUrl: boolean;
  emailEnvoye: boolean;
  hasDestinataires: boolean;
}

export function RapportActions({
  visiteId,
  hasRapportUrl,
  emailEnvoye,
  hasDestinataires,
}: RapportActionsProps) {
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [pdfGenerated, setPdfGenerated] = useState(hasRapportUrl);
  const [emailSent, setEmailSent] = useState(emailEnvoye);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
        throw new Error(body.error ?? "Erreur lors de la generation du PDF");
      }

      const data = await res.json();
      setPdfGenerated(true);
      setSuccessMessage(`PDF genere : ${data.filename}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erreur lors de la generation"
      );
    } finally {
      setGeneratingPdf(false);
    }
  }

  async function handleSendEmail() {
    setSendingEmail(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/visites/${visiteId}/email`, {
        method: "POST",
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? "Erreur lors de l'envoi");
      }

      const data = await res.json();
      setEmailSent(true);
      setSuccessMessage(`Email envoye a ${data.count} destinataire(s)`);
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
        {pdfGenerated ? "Regenerer le PDF" : "Generer le PDF"}
      </Button>

      <Button
        size="lg"
        variant={!pdfGenerated || !hasDestinataires ? "secondary" : "primary"}
        className="w-full"
        loading={sendingEmail}
        disabled={!pdfGenerated || !hasDestinataires}
        onClick={handleSendEmail}
      >
        {emailSent ? "Renvoyer par email" : "Envoyer par email"}
      </Button>
    </div>
  );
}
