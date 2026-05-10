"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/modal";
import { DOCUMENT_SOURCES } from "@/lib/utils/document-sources";
import type { Tables } from "@/types/database";

interface Props {
  doc: Tables<"base_documentaire"> | null;
  onClose: () => void;
  onSaved: () => void;
}

export function EditDocumentModal({ doc, onClose, onSaved }: Props) {
  const [titre, setTitre] = useState("");
  const [source, setSource] = useState("autre");
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (doc) {
      setTitre(doc.titre);
      setSource(doc.source);
      setReference(doc.reference ?? "");
      setDescription(doc.description ?? "");
    }
  }, [doc]);

  async function handleSave() {
    if (!doc || !titre.trim()) return;
    setSaving(true);
    const supabase = createClient();
    await supabase
      .from("base_documentaire")
      .update({
        titre: titre.trim(),
        source,
        reference: reference.trim() || null,
        description: description.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", doc.id);
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <Modal isOpen={!!doc} onClose={onClose} title="Modifier le document">
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Titre *
          </label>
          <input
            type="text"
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-touch"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Source
            </label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-touch"
            >
              {DOCUMENT_SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Référence
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-touch"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={handleSave}
            disabled={!titre.trim() || saving}
            className="flex-1 py-3 min-h-touch bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-3 min-h-touch bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
          >
            Annuler
          </button>
        </div>
      </div>
    </Modal>
  );
}
