import Link from "next/link";
import type { Tables } from "@/types/database";

interface ChantierCardProps {
  chantier: Tables<"chantiers">;
  visiteCount: number;
  ecartCount: number;
}

export function ChantierCard({
  chantier,
  visiteCount,
  ecartCount,
}: ChantierCardProps) {
  return (
    <Link
      href={`/chantiers/${chantier.id}`}
      className="block bg-white rounded-2xl shadow-card border border-stone-200/80 p-5 card-hover"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {chantier.nom && (
            <h3 className="font-heading font-semibold text-gray-900 truncate">{chantier.nom}</h3>
          )}
          <p className={`${chantier.nom ? "text-sm text-gray-500" : "font-heading font-semibold text-gray-900"} truncate`}>
            {chantier.adresse}
          </p>
          <p className="text-sm text-gray-400 mt-1 truncate">{chantier.nature_travaux}</p>
        </div>
        <div className="w-10 h-10 rounded-xl bg-stone-50 flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-stone-400 text-xl">foundation</span>
        </div>
      </div>

      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-stone-100">
        <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
          <span className="material-symbols-outlined text-sm text-gray-400">event_note</span>
          {visiteCount} visite{visiteCount !== 1 ? "s" : ""}
        </span>
        {ecartCount > 0 && (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600">
            <span className="material-symbols-outlined text-sm">warning</span>
            {ecartCount} NC ouverte{ecartCount !== 1 ? "s" : ""}
          </span>
        )}
        {ecartCount === 0 && visiteCount > 0 && (
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600">
            <span className="material-symbols-outlined text-sm">check_circle</span>
            Conforme
          </span>
        )}
      </div>
    </Link>
  );
}
