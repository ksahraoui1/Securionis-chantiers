"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface DeleteVisiteButtonProps {
  visiteId: string;
  chantierId: string;
}

export function DeleteVisiteButton({ visiteId, chantierId }: DeleteVisiteButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/visites/${visiteId}`, { method: "DELETE" });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Erreur lors de la suppression");
      }

      router.push(`/chantiers/${chantierId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la suppression");
      setLoading(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2" onClick={(e) => e.preventDefault()}>
        {error && (
          <span className="text-xs text-red-600">{error}</span>
        )}
        <span className="text-xs text-gray-600">Supprimer ?</span>
        <button
          type="button"
          disabled={loading}
          onClick={handleDelete}
          className="px-2 py-1 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50 min-h-[32px]"
        >
          {loading ? "..." : "Oui"}
        </button>
        <button
          type="button"
          onClick={() => { setConfirming(false); setError(null); }}
          className="px-2 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 min-h-[32px]"
        >
          Non
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); setConfirming(true); }}
      className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
      title="Supprimer cette visite"
    >
      <span translate="no" className="material-symbols-outlined text-lg">delete</span>
    </button>
  );
}
