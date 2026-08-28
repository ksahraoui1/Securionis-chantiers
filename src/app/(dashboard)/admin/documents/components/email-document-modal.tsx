"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import type { Tables } from "@/types/database";

interface Props {
  doc: Tables<"base_documentaire"> | null;
  onClose: () => void;
}

export function EmailDocumentModal({ doc, onClose }: Props) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (doc) {
      setTo("");
      setSubject(`Document : ${doc.titre}`);
      setSent(false);
      setError(null);
    }
  }, [doc]);

  async function handleSend() {
    if (!doc || !to.trim()) return;
    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/documents/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: doc.id,
          to: to.trim(),
          subject: subject.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Erreur d'envoi");
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur d'envoi email");
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal isOpen={!!doc} onClose={onClose} title="Envoyer par email">
      <div className="space-y-3">
        {sent ? (
          <div className="bg-green-50 rounded-lg p-4 text-center">
            <span translate="no" className="material-symbols-outlined text-green-600 text-3xl">
              check_circle
            </span>
            <p className="text-sm font-medium text-green-800 mt-2">
              Email envoyé avec succès
            </p>
          </div>
        ) : (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Destinataire *
              </label>
              <input
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="email@exemple.com"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-touch"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Objet
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-touch"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </>
        )}
        <div className="flex gap-2 pt-1">
          {!sent && (
            <button
              type="button"
              onClick={handleSend}
              disabled={!to.trim() || sending}
              className="flex-1 py-3 min-h-touch bg-amber-600 text-white font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 text-sm flex items-center justify-center gap-2"
            >
              <span translate="no" className="material-symbols-outlined text-lg">send</span>
              {sending ? "Envoi..." : "Envoyer"}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className={`${sent ? "flex-1" : ""} px-4 py-3 min-h-touch bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm`}
          >
            Fermer
          </button>
        </div>
      </div>
    </Modal>
  );
}
