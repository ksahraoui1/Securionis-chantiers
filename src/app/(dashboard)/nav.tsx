"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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

  // La barre horizontale n'est affichée que si les liens du rôle y tiennent.
  // Mesuré : les 6 liens de l'administrateur réclament ~1030px avec le logo et
  // la zone utilisateur (d'où xl) ; 2 à 3 liens tiennent dès md.
  const barreChargee = links.length > 3;
  const afficherBarre = barreChargee ? "xl:flex" : "md:flex";
  const masquerMenu = barreChargee ? "xl:hidden" : "md:hidden";

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between gap-4 h-14 sm:h-16">
          {/* Logo */}
          <a href="/dashboard" className="flex items-center gap-2 shrink-0">
            {entrepriseLogoUrl ? (
              <img
                src={entrepriseLogoUrl}
                alt={entrepriseNom ?? "Logo"}
                className="h-8 sm:h-10 max-w-[100px] sm:max-w-[140px] object-contain"
              />
            ) : (
              <span className="font-bold text-blue-700 text-sm sm:text-base">
                {entrepriseNom ?? "Securionis"}
              </span>
            )}
          </a>

          {/* Desktop nav */}
          <div className={`hidden ${afficherBarre} gap-1`}>
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={`px-3 py-2 rounded-lg text-sm font-medium min-h-touch flex items-center whitespace-nowrap ${
                  pathname.startsWith(link.href)
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* Desktop user */}
          <div className={`hidden ${afficherBarre} items-center gap-3 shrink-0`}>
            <div className="flex items-center gap-2">
              {/* Masqué sous lg : avec 3 liens, le badge « GRATUIT » et un nom
                  long, la barre du rôle invité débordait de quelques pixels à
                  768 px — la largeur d'une tablette en portrait. */}
              <span className="hidden lg:block text-sm text-gray-600 truncate max-w-[110px] xl:max-w-[150px]">
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
              className="px-3 py-2 min-h-touch text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Déconnexion
            </button>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className={`${masquerMenu} min-h-touch min-w-touch flex items-center justify-center rounded-lg hover:bg-gray-100`}
          >
            <span translate="no" className="material-symbols-outlined">
              {menuOpen ? "close" : "menu"}
            </span>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className={`${masquerMenu} border-t border-gray-200 bg-white px-4 py-3 space-y-1`}>
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium min-h-touch ${
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
              className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 min-h-touch w-full"
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
