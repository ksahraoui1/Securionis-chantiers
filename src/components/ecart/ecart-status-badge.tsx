import { LABELS_STATUT_ECART } from "@/lib/utils/constants";

const COLORS: Record<string, string> = {
  ouvert: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/10",
  en_cours_correction: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/10",
  corrige: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/10",
};

interface EcartStatusBadgeProps {
  statut: string;
}

export function EcartStatusBadge({ statut }: EcartStatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-semibold uppercase tracking-wide ${
        COLORS[statut] ?? "bg-stone-50 text-gray-600 ring-1 ring-inset ring-gray-500/10"
      }`}
    >
      {LABELS_STATUT_ECART[statut] ?? statut}
    </span>
  );
}
