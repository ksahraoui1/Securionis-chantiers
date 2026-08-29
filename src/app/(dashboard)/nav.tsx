"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BoutonRetour } from "./bouton-retour";

interface DashboardNavProps {
  userName: string;
  userRole: string;
  entrepriseNom?: string | null;
  entrepriseLogoUrl?: string | null;
}

export function DashboardNav({
  userName,
  userRole,
  entrepriseNom,
  entrepriseLogoUrl,
}: DashboardNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const links = [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/chantiers", label: "Chantiers", icon: "foundation" },
    ...(userRole === "invité"
      ? [{ href: "/dashboard/abonnement", label: "Abonnement", icon: "workspace_premium" }]
      : []),
    ...(userRole === "administrateur"
      ? [
          { href: "/admin/points-controle", label: "Points de contrôle", icon: "checklist" },
          { href: "/admin/documents", label: "Documents", icon: "library_books" },
          { href: "/admin/utilisateurs", label: "Utilisateurs", icon: "group" },
          { href: "/admin/entreprise", label: "Entreprise", icon: "business" },
        ]
      : []),
  ];

  /**
   * La barre horizontale est affichée dès 768 px pour **tous** les rôles.
   *
   * Elle était auparavant repoussée à 1280 px pour l'administrateur, faute de
   * place pour ses 6 libellés (mesuré : 638 px de liens, 1030 px au total avec
   * le logo et la zone utilisateur). En tablette, tout le menu passait donc
   * sous le bouton burger et il fallait l'ouvrir à chaque page.
   *
   * Ce sont désormais les **libellés** qui cèdent, pas la barre : entre 768 et
   * 1280 px les liens d'un rôle chargé se réduisent à leur icône, ce qui ramène
   * les 638 px à environ 265 px. Le menu déroulant ne subsiste qu'en dessous de
   * 768 px, où aucune barre horizontale ne tient.
   */
  const barreChargee = links.length > 3;
  // Littéraux Tailwind : ces classes doivent rester écrites en entier, jamais
  // assemblées — le scanner lit le source en texte brut.
  const etiquette = barreChargee ? "hidden xl:inline" : "inline";
  // ⚠️ La classe de visibilité porte sur un span *enveloppe*, jamais sur le
  // `.material-symbols-outlined` lui-même : sa règle est écrite hors couche
  // dans `globals.css` et son `display: inline-block` l'emporte donc sur les
  // utilitaires Tailwind, qui sont, eux, dans une couche. `xl:hidden` posée
  // directement sur l'icône reste sans effet.
  const icone = barreChargee ? "inline xl:hidden" : "hidden";

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between gap-3 h-14 sm:h-16">
          {/* Retour + logo */}
          <div className="flex items-center gap-1 sm:gap-2 min-w-0">
            <BoutonRetour />
            <a href="/dashboard" className="flex items-center gap-2 shrink-0">
              {entrepriseLogoUrl ? (
                <img
                  src={entrepriseLogoUrl}
                  alt={entrepriseNom ?? "Logo"}
                  className="h-8 sm:h-10 max-w-[90px] sm:max-w-[140px] object-contain"
                />
              ) : (
                <span className="font-bold text-blue-700 text-sm sm:text-base truncate">
                  {entrepriseNom ?? "Securionis"}
                </span>
              )}
            </a>
          </div>

          {/* Barre horizontale */}
          <div className="hidden md:flex gap-1">
            {links.map((link) => {
              const actif = pathname.startsWith(link.href);
              return (
                <a
                  key={link.href}
                  href={link.href}
                  title={link.label}
                  aria-label={link.label}
                  aria-current={actif ? "page" : undefined}
                  className={`px-3 py-2 rounded-lg text-sm font-medium min-h-[44px] flex items-center justify-center whitespace-nowrap ${
                    actif ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  <span className={icone}>
                    <span translate="no" className="material-symbols-outlined text-xl">
                      {link.icon}
                    </span>
                  </span>
                  <span className={etiquette}>{link.label}</span>
                </a>
              );
            })}
          </div>

          {/* Zone utilisateur */}
          <div className="hidden md:flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-2">
              {/* Le nom cède avant les liens : c'est la seule information de la
                  barre qui ne sert pas à naviguer. */}
              <span className="hidden xl:block text-sm text-gray-600 truncate max-w-[150px]">
                {userName}
              </span>
              {userRole === "invité" && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">
                  GRATUIT
                </span>
              )}
            </div>
            <button
              onClick={handleLogout}
              title="Déconnexion"
              aria-label="Déconnexion"
              className="px-3 py-2 min-h-[44px] text-sm text-gray-600 hover:bg-gray-100 rounded-lg flex items-center justify-center"
            >
              <span className={icone}>
                <span translate="no" className="material-symbols-outlined text-xl">
                  logout
                </span>
              </span>
              <span className={etiquette}>Déconnexion</span>
            </button>
          </div>

          {/* Menu déroulant, sous 768 px uniquement */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={menuOpen}
            className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-gray-100"
          >
            <span translate="no" className="material-symbols-outlined">
              {menuOpen ? "close" : "menu"}
            </span>
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="md:hidden border-t border-gray-200 bg-white px-4 py-3 space-y-1">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium min-h-[44px] ${
                pathname.startsWith(link.href)
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <span translate="no" className="material-symbols-outlined text-lg">{link.icon}</span>
              {link.label}
            </a>
          ))}
          <div className="border-t border-gray-100 pt-2 mt-2">
            <div className="px-3 py-2 text-sm text-gray-500 truncate">{userName}</div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 min-h-[44px] w-full"
            >
              <span translate="no" className="material-symbols-outlined text-lg">logout</span>
              Déconnexion
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
