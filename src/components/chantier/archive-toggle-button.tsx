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
  const router = useRouter();

  async function handleToggle() {
    if (!archived && !confirm("Archiver ce chantier ? Il n'apparaîtra plus dans les chantiers actifs.")) {
      return;
    }

    setLoading(true);
    const supabase = createClient();

    await supabase
      .from("chantiers")
      .update({
        archived: !archived,
        archived_at: !archived ? new Date().toISOString() : null,
      })
      .eq("id", chantierId);

    router.refresh();
    setLoading(false);
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={loading}
      className={`inline-flex items-center gap-1.5 px-4 py-2 min-h-[44px] rounded-xl font-medium text-sm transition-all disabled:opacity-50 ${
        archived
          ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 ring-1 ring-inset ring-emerald-600/10"
          : "bg-amber-50 text-amber-700 hover:bg-amber-100 ring-1 ring-inset ring-amber-600/10"
      }`}
    >
      <span className="material-symbols-outlined text-lg">
        {loading ? "hourglass_top" : archived ? "unarchive" : "archive"}
      </span>
      {loading ? "..." : archived ? "Restaurer" : "Archiver"}
    </button>
  );
}
