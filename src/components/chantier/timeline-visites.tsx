import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { LABELS_STATUT_VISITE } from "@/lib/utils/constants";

interface VisiteForTimeline {
  id: string;
  date_visite: string;
  statut: "brouillon" | "en_cours" | "terminee";
  rapport_url: string | null;
  inspecteur_nom: string;
  nc_count: number;
}

interface TimelineVisitesProps {
  visites: VisiteForTimeline[];
  chantierId: string;
}

export function TimelineVisites({
  visites,
  chantierId,
}: TimelineVisitesProps) {
  if (visites.length === 0) {
    return (
      <p className="text-sm text-gray-500 py-4">
        Aucune visite pour ce chantier.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {visites.map((visite) => {
        const href =
          visite.statut === "terminee"
            ? `/chantiers/${chantierId}/visites/${visite.id}/rapport`
            : `/chantiers/${chantierId}/visites/${visite.id}`;

        return (
          <Link
            key={visite.id}
            href={href}
            className="block bg-white rounded-lg border border-gray-400 p-4 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {new Date(visite.date_visite).toLocaleDateString("fr-CH", {
                    weekday: "short",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {visite.inspecteur_nom}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {visite.nc_count > 0 && (
                  <span className="text-xs font-medium text-red-600">
                    {visite.nc_count} NC
                  </span>
                )}
                <Badge variant={visite.statut}>
                  {LABELS_STATUT_VISITE[visite.statut] ?? visite.statut}
                </Badge>
              </div>
            </div>
            {visite.statut === "terminee" && (
              <p className="text-xs text-blue-600 mt-2 flex items-center gap-1">
                <span className="material-symbols-outlined text-xs">description</span>
                {visite.rapport_url ? "Voir le rapport" : "Générer le rapport"}
              </p>
            )}
          </Link>
        );
      })}
    </div>
  );
}
