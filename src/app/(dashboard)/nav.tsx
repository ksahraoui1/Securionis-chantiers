"use client";

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

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const links = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/chantiers", label: "Chantiers" },
    ...(userRole === "administrateur"
      ? [
          { href: "/admin/points-controle", label: "Points de contrôle" },
          { href: "/admin/utilisateurs", label: "Utilisateurs" },
          { href: "/admin/entreprise", label: "Entreprise" },
        ]
      : []),
  ];

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-6">
            <a href="/dashboard" className="flex items-center gap-2">
              {entrepriseLogoUrl ? (
                <img
                  src={entrepriseLogoUrl}
                  alt={entrepriseNom ?? "Logo"}
                  className="h-10 max-w-[140px] object-contain"
                />
              ) : (
                <span className="font-bold text-blue-700">
                  {entrepriseNom ?? "Securionis"}
                </span>
              )}
            </a>
            <div className="flex gap-1">
              {links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-2 rounded-lg text-sm font-medium min-h-touch flex items-center ${
                    pathname.startsWith(link.href)
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="/admin/utilisateurs"
              className="text-sm text-gray-600 hover:text-blue-600 hover:underline"
            >
              {userName}
            </a>
            <button
              onClick={handleLogout}
              className="px-3 py-2 min-h-touch text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Déconnexion
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
