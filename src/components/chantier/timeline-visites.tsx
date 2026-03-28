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
      <div className="text-center py-10">
        <div className="w-12 h-12 rounded-xl bg-stone-100 flex items-center justify-center mx-auto mb-3">
          <span className="material-symbols-outlined text-2xl text-stone-400">event_note</span>
        </div>
        <p className="text-sm text-gray-400">
          Aucune visite pour ce chantier.
        </p>
      </div>
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
            className="block bg-white rounded-2xl border border-stone-200/80 p-4 sm:p-5 card-hover shadow-card"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  visite.statut === "terminee"
                    ? "bg-emerald-50"
                    : visite.statut === "en_cours"
                      ? "bg-amber-50"
                      : "bg-stone-50"
                }`}>
                  <span className={`material-symbols-outlined text-lg ${
                    visite.statut === "terminee"
                      ? "text-emerald-500"
                      : visite.statut === "en_cours"
                        ? "text-amber-500"
                        : "text-stone-400"
                  }`}>
                    {visite.statut === "terminee" ? "task_alt" : visite.statut === "en_cours" ? "pending" : "edit_note"}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {new Date(visite.date_visite).toLocaleDateString("fr-CH", {
                      weekday: "short",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {visite.inspecteur_nom}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {visite.nc_count > 0 && (
                  <span className="text-xs font-semibold text-red-600 tabular-nums">
                    {visite.nc_count} NC
                  </span>
                )}
                <Badge variant={visite.statut}>
                  {LABELS_STATUT_VISITE[visite.statut] ?? visite.statut}
                </Badge>
              </div>
            </div>
            {visite.statut === "terminee" && (
              <div className="mt-3 pt-3 border-t border-stone-100 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-brand-500">description</span>
                <span className="text-xs text-brand-600 font-medium">
                  {visite.rapport_url ? "Voir le rapport" : "Générer le rapport"}
                </span>
              </div>
            )}
          </Link>
        );
      })}
    </div>
  );
}
