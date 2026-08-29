"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface ArchiveToggleButtonProps {
  chantierId: string;
  archived: boolean;
}

export function ArchiveToggleButton({ chantierId, archived }: ArchiveToggleButtonProps) {
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const router = useRouter();

  async function handleToggle() {
    if (!archived && !confirm("Archiver ce chantier ? Il n'apparaîtra plus dans les chantiers actifs.")) {
      return;
    }

    setLoading(true);
    setErreur(null);
    const supabase = createClient();

    // `.select()` est indispensable : une écriture refusée par la RLS ne lève
    // pas d'erreur, elle ne touche simplement aucune ligne. Sans les lignes
    // renvoyées, un refus est indiscernable d'un succès — la page se
    // rafraîchirait à l'identique, sans rien dire.
    const { data, error } = await supabase
      .from("chantiers")
      .update({
        archived: !archived,
        archived_at: !archived ? new Date().toISOString() : null,
      })
      .eq("id", chantierId)
      .select("id");

    setLoading(false);

    if (error) {
      setErreur(error.message);
      return;
    }
    if (!data || data.length === 0) {
      setErreur(
        "Vous n'avez pas les droits sur ce chantier. Demandez à un administrateur de vous y rattacher."
      );
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={handleToggle}
        disabled={loading}
        className={`inline-flex items-center gap-1.5 px-4 py-2 min-h-[44px] rounded-lg font-medium text-sm transition-colors disabled:opacity-50 ${
          archived
            ? "bg-green-50 text-green-700 hover:bg-green-100"
            : "bg-amber-50 text-amber-700 hover:bg-amber-100"
        }`}
      >
        <span translate="no" className="material-symbols-outlined text-lg">
          {loading ? "hourglass_top" : archived ? "unarchive" : "archive"}
        </span>
        {loading ? "..." : archived ? "Restaurer" : "Archiver"}
      </button>
      {erreur && (
        <p role="alert" className="text-xs text-red-700 max-w-xs">
          {erreur}
        </p>
      )}
    </div>
  );
}
