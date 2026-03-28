import { LABELS_STATUT_ECART } from "@/lib/utils/constants";

const COLORS: Record<string, string> = {
  ouvert: "bg-red-100 text-red-800",
  en_cours_correction: "bg-amber-100 text-amber-800",
  corrige: "bg-green-100 text-green-800",
};

interface EcartStatusBadgeProps {
  statut: string;
}

export function EcartStatusBadge({ statut }: EcartStatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        COLORS[statut] ?? "bg-gray-100 text-gray-800"
      }`}
    >
      {LABELS_STATUT_ECART[statut] ?? statut}
    </span>
  );
}
