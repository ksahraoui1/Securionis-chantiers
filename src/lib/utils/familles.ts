/**
 * Familles de points de contrôle — regroupement métier des catégories.
 *
 * Miroir applicatif de la migration 035 : la colonne `points_controle.famille`
 * ne peut contenir que l'une de ces 12 valeurs. Toute catégorie inconnue
 * (créée après coup depuis l'admin) retombe sur « Autres ».
 */

export const FAMILLES = [
  "Protections antichute",
  "Électricité & Énergies",
  "Engins & Levage",
  "Fouilles & Terrasse",
  "Démolition & Désamiantage",
  "EPI & Santé",
  "Accès & Circulation",
  "Produits & Incendie",
  "Structures & Toitures",
  "Machines & Outils",
  "Dispositions générales",
  "Autres",
] as const;

export type Famille = (typeof FAMILLES)[number];

export const FAMILLE_AUTRES: Famille = "Autres";

/** Correspondance libellé de catégorie → famille (cf. migration 035). */
export const FAMILLE_PAR_CATEGORIE: Record<string, Famille> = {
  "Échafaudages": "Protections antichute",
  "Échafaudages roulants": "Protections antichute",
  "Filets & Retenue": "Protections antichute",
  "Protections Chutes": "Protections antichute",
  "Échelles": "Protections antichute",
  "Électricité": "Électricité & Énergies",
  "Installations & Énergie": "Électricité & Énergies",
  "Installations Thermiques": "Électricité & Énergies",
  "Laser": "Électricité & Énergies",
  "Engins Chantier": "Engins & Levage",
  "Grues & Levage": "Engins & Levage",
  "Fouilles & Talus": "Fouilles & Terrasse",
  "Roches & Gravier": "Fouilles & Terrasse",
  "Souterrains": "Fouilles & Terrasse",
  "Coffrages": "Fouilles & Terrasse",
  "Démolition & Désamiantage": "Démolition & Désamiantage",
  "Santé et EPI": "EPI & Santé",
  "Milieu de travail": "EPI & Santé",
  "Accès & Sols": "Accès & Circulation",
  "Postes & Passages": "Accès & Circulation",
  "Produits & Inflammables": "Produits & Incendie",
  "Toitures": "Structures & Toitures",
  "Éléments Préfabriqués": "Structures & Toitures",
  "Arbres": "Structures & Toitures",
  "Machines Electriques": "Machines & Outils",
  "Machines portatives": "Machines & Outils",
  "Dispositions générales": "Dispositions générales",
  "Test": "Autres",
};

/** Famille d'une catégorie, « Autres » si le libellé n'est pas répertorié. */
export function familleDeCategorie(libelle: string | null | undefined): Famille {
  if (!libelle) return FAMILLE_AUTRES;
  return FAMILLE_PAR_CATEGORIE[libelle.trim()] ?? FAMILLE_AUTRES;
}

/** Couleur de badge par famille (palette Tailwind existante de l'app). */
export const COULEUR_FAMILLE: Record<Famille, string> = {
  "Protections antichute": "bg-blue-50 text-blue-700",
  "Électricité & Énergies": "bg-amber-50 text-amber-700",
  "Engins & Levage": "bg-orange-50 text-orange-700",
  "Fouilles & Terrasse": "bg-stone-100 text-stone-700",
  "Démolition & Désamiantage": "bg-red-50 text-red-700",
  "EPI & Santé": "bg-emerald-50 text-emerald-700",
  "Accès & Circulation": "bg-sky-50 text-sky-700",
  "Produits & Incendie": "bg-rose-50 text-rose-700",
  "Structures & Toitures": "bg-indigo-50 text-indigo-700",
  "Machines & Outils": "bg-slate-100 text-slate-700",
  "Dispositions générales": "bg-teal-50 text-teal-700",
  "Autres": "bg-gray-100 text-gray-600",
};
