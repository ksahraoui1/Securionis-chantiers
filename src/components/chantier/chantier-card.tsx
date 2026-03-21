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
      className="block bg-white rounded-lg shadow-sm border border-gray-400 p-4 hover:shadow-md transition-shadow"
    >
      {chantier.nom && (
        <h3 className="font-semibold text-gray-900">{chantier.nom}</h3>
      )}
      <p className={`${chantier.nom ? "text-sm text-gray-600" : "font-semibold text-gray-900"} mb-1`}>{chantier.adresse}</p>
      <p className="text-sm text-gray-500 mb-3">{chantier.nature_travaux}</p>
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span>
          {visiteCount} visite{visiteCount !== 1 ? "s" : ""}
        </span>
        {ecartCount > 0 && (
          <span className="text-red-600 font-medium">
            {ecartCount} non-conformité{ecartCount !== 1 ? "s" : ""} ouverte{ecartCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </Link>
  );
}
