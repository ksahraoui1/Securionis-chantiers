"use client";

import { useState, useEffect } from "react";
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Close mobile menu on escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    if (mobileOpen) {
      document.addEventListener("keydown", handleKey);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const mainLinks = [
    { href: "/dashboard", label: "Dashboard", icon: "space_dashboard" },
    { href: "/chantiers", label: "Chantiers", icon: "foundation" },
  ];

  const guestLinks = userRole === "invité"
    ? [{ href: "/dashboard/abonnement", label: "Abonnement", icon: "workspace_premium" }]
    : [];

  const adminLinks = userRole === "administrateur"
    ? [
        { href: "/admin/points-controle", label: "Points de contrôle", icon: "checklist" },
        { href: "/admin/documents", label: "Documents", icon: "library_books" },
        { href: "/admin/utilisateurs", label: "Utilisateurs", icon: "group" },
        { href: "/admin/entreprise", label: "Entreprise", icon: "business" },
      ]
    : [];

  const allLinks = [...mainLinks, ...guestLinks];

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <>
      {/* ─── Desktop Sidebar ─── */}
      <aside
        className={`hidden lg:flex flex-col fixed left-0 top-0 bottom-0 z-30 bg-navy-800 transition-all duration-300 ease-in-out ${
          sidebarCollapsed ? "w-[72px]" : "w-[260px]"
        }`}
      >
        {/* Logo area */}
        <div className="flex items-center h-16 px-4 border-b border-white/[0.06]">
          {entrepriseLogoUrl && !sidebarCollapsed ? (
            <a href="/dashboard" className="flex items-center gap-3">
              <img
                src={entrepriseLogoUrl}
                alt={entrepriseNom ?? "Logo"}
                className="h-8 max-w-[140px] object-contain brightness-0 invert opacity-90"
              />
            </a>
          ) : (
            <a href="/dashboard" className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-brand-600 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-white text-lg">shield</span>
              </div>
              {!sidebarCollapsed && (
                <span className="font-heading font-bold text-white/90 text-sm tracking-tight">
                  {entrepriseNom ?? "Securionis"}
                </span>
              )}
            </a>
          )}
        </div>

        {/* Navigation links */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          <p className={`text-[10px] font-semibold uppercase tracking-wider text-white/30 mb-2 ${sidebarCollapsed ? "text-center" : "px-3"}`}>
            {sidebarCollapsed ? "•" : "Navigation"}
          </p>
          {allLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={`nav-link flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium min-h-touch transition-all duration-200 ${
                isActive(link.href)
                  ? "active bg-white/[0.08] text-white"
                  : "text-white/50 hover:text-white/80 hover:bg-white/[0.04]"
              } ${sidebarCollapsed ? "justify-center" : ""}`}
              title={sidebarCollapsed ? link.label : undefined}
            >
              <span className={`material-symbols-outlined text-xl ${isActive(link.href) ? "text-brand-400" : ""}`}>
                {link.icon}
              </span>
              {!sidebarCollapsed && link.label}
            </a>
          ))}

          {adminLinks.length > 0 && (
            <>
              <div className="pt-4 pb-1">
                <p className={`text-[10px] font-semibold uppercase tracking-wider text-white/30 ${sidebarCollapsed ? "text-center" : "px-3"}`}>
                  {sidebarCollapsed ? "•" : "Administration"}
                </p>
              </div>
              {adminLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className={`nav-link flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium min-h-touch transition-all duration-200 ${
                    isActive(link.href)
                      ? "active bg-white/[0.08] text-white"
                      : "text-white/50 hover:text-white/80 hover:bg-white/[0.04]"
                  } ${sidebarCollapsed ? "justify-center" : ""}`}
                  title={sidebarCollapsed ? link.label : undefined}
                >
                  <span className={`material-symbols-outlined text-xl ${isActive(link.href) ? "text-brand-400" : ""}`}>
                    {link.icon}
                  </span>
                  {!sidebarCollapsed && link.label}
                </a>
              ))}
            </>
          )}
        </nav>

        {/* Collapse toggle */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="mx-3 mb-2 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-all min-h-touch"
        >
          <span className="material-symbols-outlined text-lg">
            {sidebarCollapsed ? "chevron_right" : "chevron_left"}
          </span>
          {!sidebarCollapsed && <span className="text-xs">Réduire</span>}
        </button>

        {/* User area */}
        <div className={`border-t border-white/[0.06] p-3 ${sidebarCollapsed ? "flex flex-col items-center gap-2" : ""}`}>
          <div className={`flex items-center gap-3 ${sidebarCollapsed ? "flex-col" : ""}`}>
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shrink-0 ring-2 ring-white/10">
              <span className="text-white text-xs font-bold">{initials}</span>
            </div>
            {!sidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white/80 truncate">{userName}</p>
                <p className="text-[11px] text-white/35 capitalize">{userRole}</p>
              </div>
            )}
          </div>
          <button
            onClick={handleLogout}
            className={`mt-2 flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all min-h-touch w-full ${
              sidebarCollapsed ? "justify-center" : ""
            }`}
            title="Déconnexion"
          >
            <span className="material-symbols-outlined text-lg">logout</span>
            {!sidebarCollapsed && "Déconnexion"}
          </button>
        </div>
      </aside>

      {/* ─── Tablet Top Bar (md to lg) ─── */}
      <nav className="hidden md:flex lg:hidden items-center justify-between h-14 px-4 bg-navy-800 sticky top-0 z-30">
        <a href="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-white text-base">shield</span>
          </div>
          <span className="font-heading font-bold text-white/90 text-sm">
            {entrepriseNom ?? "Securionis"}
          </span>
        </a>
        <div className="flex items-center gap-1">
          {allLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={`px-3 py-2 rounded-lg text-sm font-medium min-h-touch flex items-center gap-2 transition-colors ${
                isActive(link.href)
                  ? "bg-white/[0.08] text-white"
                  : "text-white/50 hover:text-white/80"
              }`}
            >
              <span className="material-symbols-outlined text-lg">{link.icon}</span>
              {link.label}
            </a>
          ))}
          {adminLinks.length > 0 && (
            <div className="w-px h-6 bg-white/10 mx-1" />
          )}
          {adminLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={`px-2 py-2 rounded-lg text-sm font-medium min-h-touch flex items-center transition-colors ${
                isActive(link.href)
                  ? "bg-white/[0.08] text-white"
                  : "text-white/50 hover:text-white/80"
              }`}
              title={link.label}
            >
              <span className="material-symbols-outlined text-lg">{link.icon}</span>
            </a>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center ring-2 ring-white/10">
            <span className="text-white text-[10px] font-bold">{initials}</span>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors min-h-touch min-w-touch flex items-center justify-center"
            title="Déconnexion"
          >
            <span className="material-symbols-outlined text-lg">logout</span>
          </button>
        </div>
      </nav>

      {/* ─── Mobile Header ─── */}
      <header className="md:hidden flex items-center justify-between h-14 px-4 bg-navy-800 sticky top-0 z-30">
        <a href="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-white text-base">shield</span>
          </div>
          <span className="font-heading font-bold text-white/90 text-sm">
            {entrepriseNom ?? "Securionis"}
          </span>
        </a>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="min-h-touch min-w-touch flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors"
        >
          <span className="material-symbols-outlined">
            {mobileOpen ? "close" : "menu"}
          </span>
        </button>
      </header>

      {/* ─── Mobile Overlay Menu ─── */}
      {mobileOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 bg-black/60 z-40 animate-fade-in"
            onClick={() => setMobileOpen(false)}
          />
          <div className="md:hidden fixed right-0 top-0 bottom-0 w-72 bg-navy-800 z-50 animate-slide-in-left shadow-2xl">
            <div className="flex items-center justify-between h-14 px-4 border-b border-white/[0.06]">
              <span className="font-heading font-semibold text-white/80 text-sm">Menu</span>
              <button
                onClick={() => setMobileOpen(false)}
                className="min-h-touch min-w-touch flex items-center justify-center rounded-lg text-white/40 hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <nav className="py-4 px-3 space-y-1">
              {allLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium min-h-touch transition-colors ${
                    isActive(link.href)
                      ? "bg-white/[0.08] text-white"
                      : "text-white/50 hover:text-white/80 hover:bg-white/[0.04]"
                  }`}
                >
                  <span className={`material-symbols-outlined text-xl ${isActive(link.href) ? "text-brand-400" : ""}`}>
                    {link.icon}
                  </span>
                  {link.label}
                </a>
              ))}

              {adminLinks.length > 0 && (
                <>
                  <div className="pt-3 pb-1 px-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">Administration</p>
                  </div>
                  {adminLinks.map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium min-h-touch transition-colors ${
                        isActive(link.href)
                          ? "bg-white/[0.08] text-white"
                          : "text-white/50 hover:text-white/80 hover:bg-white/[0.04]"
                      }`}
                    >
                      <span className={`material-symbols-outlined text-xl ${isActive(link.href) ? "text-brand-400" : ""}`}>
                        {link.icon}
                      </span>
                      {link.label}
                    </a>
                  ))}
                </>
              )}
            </nav>

            <div className="absolute bottom-0 left-0 right-0 border-t border-white/[0.06] p-3">
              <div className="flex items-center gap-3 px-3 py-2">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center ring-2 ring-white/10">
                  <span className="text-white text-xs font-bold">{initials}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white/80 truncate">{userName}</p>
                  <p className="text-[11px] text-white/35 capitalize">{userRole}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="mt-1 flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-red-400/70 hover:text-red-400 hover:bg-red-500/10 min-h-touch w-full transition-colors"
              >
                <span className="material-symbols-outlined text-lg">logout</span>
                Déconnexion
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
