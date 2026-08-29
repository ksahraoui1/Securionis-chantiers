"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { libelleRetour, parentDe } from "@/lib/utils/navigation-retour";

/**
 * Bouton « Retour » de la barre de navigation, présent sur toutes les pages
 * connectées sauf le tableau de bord, qui est la racine.
 *
 * C'est un vrai lien et non un `router.back()` : il est préchargé, ouvrable
 * dans un nouvel onglet, et sa destination ne dépend pas de la façon dont on
 * est arrivé sur la page.
 */
export function BoutonRetour() {
  const chemin = usePathname();
  const destination = parentDe(chemin);

  // Sur le tableau de bord, l'emplacement est réservé pour que le logo ne
  // sautille pas d'une page à l'autre.
  if (!destination) {
    return <span aria-hidden className="w-[44px] shrink-0 sm:w-[88px]" />;
  }

  const libelle = libelleRetour(destination);

  return (
    <Link
      href={destination}
      title={libelle}
      aria-label={libelle}
      className="shrink-0 flex items-center gap-1 rounded-lg px-2 min-h-[44px] min-w-[44px] justify-center text-gray-600 hover:bg-gray-100 hover:text-[#002855] transition-colors"
    >
      <span translate="no" className="material-symbols-outlined text-xl">
        arrow_back
      </span>
      <span className="hidden sm:inline text-sm font-medium">Retour</span>
    </Link>
  );
}
