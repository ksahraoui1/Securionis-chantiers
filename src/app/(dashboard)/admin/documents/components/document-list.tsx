"use client";

import { DOCUMENT_SOURCE_LABELS } from "@/lib/utils/document-sources";
import { formatFileSize } from "@/lib/utils/format";
import type { Tables } from "@/types/database";

type Doc = Tables<"base_documentaire">;

interface Props {
  documents: Doc[];
  loading: boolean;
  linkedCount: Record<string, number>;
  onEdit: (doc: Doc) => void;
  onEmail: (doc: Doc) => void;
  onLink: (docId: string) => void;
  onDelete: (docId: string) => void;
}

export function DocumentList({
  documents,
  loading,
  linkedCount,
  onEdit,
  onEmail,
  onLink,
  onDelete,
}: Props) {
  if (loading) {
    return <p className="text-gray-500 py-8 text-center">Chargement...</p>;
  }

  if (documents.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="material-symbols-outlined text-gray-400 text-3xl">
            folder_open
          </span>
        </div>
        <p className="text-gray-500">Aucun document dans la bibliothèque</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {documents.map((doc) => (
        <DocumentRow
          key={doc.id}
          doc={doc}
          linkedCount={linkedCount[doc.id]}
          onEdit={onEdit}
          onEmail={onEmail}
          onLink={onLink}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

interface RowProps {
  doc: Doc;
  linkedCount: number | undefined;
  onEdit: (doc: Doc) => void;
  onEmail: (doc: Doc) => void;
  onLink: (docId: string) => void;
  onDelete: (docId: string) => void;
}

function DocumentRow({
  doc,
  linkedCount,
  onEdit,
  onEmail,
  onLink,
  onDelete,
}: RowProps) {
  const isImage = ["jpeg", "jpg", "png"].includes(doc.type_fichier);

  function handleDelete() {
    if (confirm("Supprimer ce document de la bibliothèque ?")) onDelete(doc.id);
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:bg-gray-50 transition-colors">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
          {isImage ? (
            <img
              src={doc.fichier_url}
              alt=""
              className="w-full h-full object-cover rounded-lg"
            />
          ) : (
            <span className="material-symbols-outlined text-red-500 text-xl">
              picture_as_pdf
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
              {DOCUMENT_SOURCE_LABELS[doc.source] ?? doc.source}
            </span>
            {doc.reference && (
              <span className="text-[10px] text-gray-400">{doc.reference}</span>
            )}
            {linkedCount && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-700">
                {linkedCount} point{linkedCount > 1 ? "s" : ""} lié
                {linkedCount > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <p className="font-medium text-sm text-gray-900 truncate">{doc.titre}</p>
          {doc.description && (
            <p className="text-xs text-gray-500 truncate mt-0.5">
              {doc.description}
            </p>
          )}
          <p className="text-[10px] text-gray-400 mt-0.5">
            {doc.fichier_nom} · {formatFileSize(doc.fichier_taille)} ·{" "}
            {new Date(doc.updated_at).toLocaleDateString("fr-CH")}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <a
            href={doc.fichier_url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 min-h-touch min-w-touch flex items-center justify-center text-blue-600 hover:bg-blue-50 rounded-lg"
            title="Ouvrir"
          >
            <span className="material-symbols-outlined text-lg">open_in_new</span>
          </a>
          <button
            type="button"
            onClick={() => onEdit(doc)}
            className="p-2 min-h-touch min-w-touch flex items-center justify-center text-gray-600 hover:bg-gray-50 rounded-lg"
            title="Modifier"
          >
            <span className="material-symbols-outlined text-lg">edit</span>
          </button>
          <button
            type="button"
            onClick={() => onEmail(doc)}
            className="p-2 min-h-touch min-w-touch flex items-center justify-center text-amber-600 hover:bg-amber-50 rounded-lg"
            title="Envoyer par email"
          >
            <span className="material-symbols-outlined text-lg">mail</span>
          </button>
          <button
            type="button"
            onClick={() => onLink(doc.id)}
            className="p-2 min-h-touch min-w-touch flex items-center justify-center text-green-600 hover:bg-green-50 rounded-lg"
            title="Lier aux points de contrôle"
          >
            <span className="material-symbols-outlined text-lg">link</span>
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="p-2 min-h-touch min-w-touch flex items-center justify-center text-red-500 hover:bg-red-50 rounded-lg"
            title="Supprimer"
          >
            <span className="material-symbols-outlined text-lg">delete</span>
          </button>
        </div>
      </div>
    </div>
  );
}
