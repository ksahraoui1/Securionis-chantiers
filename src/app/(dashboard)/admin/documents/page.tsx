"use client";

import { useState } from "react";
import { useDocuments } from "./hooks/use-documents";
import { DocumentList } from "./components/document-list";
import { DocumentUploadForm } from "./components/document-upload-form";
import { EditDocumentModal } from "./components/edit-document-modal";
import { EmailDocumentModal } from "./components/email-document-modal";
import { LinkPointsModal } from "./components/link-points-modal";
import { DOCUMENT_SOURCES } from "@/lib/utils/document-sources";
import type { Tables } from "@/types/database";

type Doc = Tables<"base_documentaire">;

export default function AdminDocumentsPage() {
  const [filterSource, setFilterSource] = useState("");
  const [search, setSearch] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [editDoc, setEditDoc] = useState<Doc | null>(null);
  const [emailDoc, setEmailDoc] = useState<Doc | null>(null);
  const [linkDocId, setLinkDocId] = useState<string | null>(null);

  const { documents, loading, linkedCount, reload, remove } =
    useDocuments(filterSource);

  const filtered = search
    ? documents.filter(
        (d) =>
          d.titre.toLowerCase().includes(search.toLowerCase()) ||
          d.reference?.toLowerCase().includes(search.toLowerCase()) ||
          d.description?.toLowerCase().includes(search.toLowerCase()),
      )
    : documents;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Base documentaire</h1>
          <p className="text-sm text-gray-500 mt-1">
            {documents.length} document{documents.length > 1 ? "s" : ""} — PDF,
            schémas, guides réglementaires
          </p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="px-4 py-3 min-h-touch bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 text-sm"
        >
          + Ajouter un document
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Source
            </label>
            <select
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-touch"
            >
              <option value="">Toutes les sources</option>
              {DOCUMENT_SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Recherche
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par titre, référence..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-touch"
            />
          </div>
        </div>
      </div>

      {showUpload && (
        <DocumentUploadForm
          onClose={() => setShowUpload(false)}
          onUploaded={reload}
        />
      )}

      <DocumentList
        documents={filtered}
        loading={loading}
        linkedCount={linkedCount}
        onEdit={setEditDoc}
        onEmail={setEmailDoc}
        onLink={setLinkDocId}
        onDelete={remove}
      />

      <EditDocumentModal
        doc={editDoc}
        onClose={() => setEditDoc(null)}
        onSaved={reload}
      />
      <EmailDocumentModal doc={emailDoc} onClose={() => setEmailDoc(null)} />
      <LinkPointsModal
        docId={linkDocId}
        onClose={() => {
          setLinkDocId(null);
          reload();
        }}
      />
    </div>
  );
}
