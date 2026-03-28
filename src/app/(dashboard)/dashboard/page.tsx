import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { EcartStatusBadge } from "@/components/ecart/ecart-status-badge";
import { NcThemeChart } from "./nc-theme-chart";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // --- Chantiers de l'inspecteur (RLS filtre automatiquement) ---
  const { data: chantiers } = await supabase
    .from("chantiers")
    .select("id, nom, adresse, nature_travaux, updated_at")
    .eq("archived", false)
    .order("updated_at", { ascending: false });

  const chantierIds = chantiers?.map((c) => c.id) ?? [];

  // --- Toutes les visites ---
  const { data: allVisites } = await supabase
    .from("visites")
    .select("id, chantier_id, date_visite, statut")
    .in("chantier_id", chantierIds.length > 0 ? chantierIds : [""]);

  // --- Toutes les NC ---
  const { data: allEcarts } = await supabase
    .from("ecarts")
    .select("id, chantier_id, statut, delai, created_at, reponse_id")
    .in("chantier_id", chantierIds.length > 0 ? chantierIds : [""]);

  // --- Toutes les réponses (pour taux de conformité) ---
  const visiteIds = allVisites?.map((v) => v.id) ?? [];
  const { data: allReponses } = await supabase
    .from("reponses")
    .select("id, valeur, visite_id")
    .in("visite_id", visiteIds.length > 0 ? visiteIds : [""]);

  // --- NC par thème : réponses NC → point_controle → theme ---
  const ecartReponseIds = allEcarts?.map((e) => e.reponse_id).filter(Boolean) ?? [];
  const { data: ncReponses } = ecartReponseIds.length > 0
    ? await supabase
        .from("reponses")
        .select("id, point_controle_id")
        .in("id", ecartReponseIds)
    : { data: [] };

  const ncPointIds = [...new Set(ncReponses?.map((r) => r.point_controle_id) ?? [])];
  const { data: ncPoints } = ncPointIds.length > 0
    ? await supabase
        .from("points_controle")
        .select("id, theme_id, themes(libelle, categories(libelle))")
        .in("id", ncPointIds)
    : { data: [] };

  // Build map: reponse_id → theme info
  const pointThemeMap = new Map(
    (ncPoints ?? []).map((p) => [
      p.id,
      {
        theme: (p.themes as unknown as { libelle: string; categories: { libelle: string } })?.libelle ?? "Sans thème",
        categorie: (p.themes as unknown as { libelle: string; categories: { libelle: string } })?.categories?.libelle ?? "",
      },
    ])
  );
  const reponsePointMap = new Map(
    (ncReponses ?? []).map((r) => [r.id, r.point_controle_id])
  );

  // Aggregate NC by theme
  const ncByTheme: Record<string, { ouvertes: number; corrigees: number; categorie: string }> = {};
  for (const ecart of allEcarts ?? []) {
    const pointId = reponsePointMap.get(ecart.reponse_id);
    const themeInfo = pointId ? pointThemeMap.get(pointId) : null;
    const themeName = themeInfo?.theme ?? "Sans thème";
    if (!ncByTheme[themeName]) {
      ncByTheme[themeName] = { ouvertes: 0, corrigees: 0, categorie: themeInfo?.categorie ?? "" };
    }
    if (ecart.statut === "corrige") {
      ncByTheme[themeName].corrigees++;
    } else {
      ncByTheme[themeName].ouvertes++;
    }
  }

  // Sort by total NC descending, take top 10
  const ncParTheme = Object.entries(ncByTheme)
    .map(([theme, data]) => ({ theme, categorie: data.categorie, ouvertes: data.ouvertes, corrigees: data.corrigees }))
    .sort((a, b) => (b.ouvertes + b.corrigees) - (a.ouvertes + a.corrigees))
    .slice(0, 10);

  // ===== INDICATEURS =====

  const chantiersActifs = chantiers?.length ?? 0;
  const ncOuvertes = allEcarts?.filter((e) => e.statut !== "corrige").length ?? 0;

  const now = new Date();
  const debutMois = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const visitesCeMois = allVisites?.filter((v) => v.date_visite >= debutMois).length ?? 0;

  const debut3Mois = new Date(now.getFullYear(), now.getMonth() - 3, 1)
    .toISOString()
    .slice(0, 10);
  const visites3MoisIds = new Set(
    allVisites
      ?.filter((v) => v.date_visite >= debut3Mois)
      .map((v) => v.id) ?? []
  );
  const reponses3Mois =
    allReponses?.filter((r) => visites3MoisIds.has(r.visite_id)) ?? [];
  const totalReponses = reponses3Mois.length;
  const conformes = reponses3Mois.filter(
    (r) => r.valeur === "conforme"
  ).length;
  const tauxConformite =
    totalReponses > 0 ? Math.round((conformes / totalReponses) * 100) : null;

  // Chantiers avec NC urgentes
  const ncParChantier: Record<
    string,
    { ouvertes: number; urgentes: number }
  > = {};
  const todayStr = now.toISOString().slice(0, 10);

  for (const e of allEcarts ?? []) {
    if (e.statut === "corrige") continue;
    if (!ncParChantier[e.chantier_id]) {
      ncParChantier[e.chantier_id] = { ouvertes: 0, urgentes: 0 };
    }
    ncParChantier[e.chantier_id].ouvertes++;
    if (e.delai && e.delai < todayStr) {
      ncParChantier[e.chantier_id].urgentes++;
    }
  }

  const chantiersUrgents = chantiers
    ?.filter((c) => ncParChantier[c.id]?.urgentes > 0)
    .map((c) => ({
      ...c,
      ncOuvertes: ncParChantier[c.id].ouvertes,
      ncUrgentes: ncParChantier[c.id].urgentes,
    }))
    .sort((a, b) => b.ncUrgentes - a.ncUrgentes) ?? [];

  const chantiersAvecNc = chantiers
    ?.filter(
      (c) =>
        ncParChantier[c.id]?.ouvertes > 0 &&
        !chantiersUrgents.find((u) => u.id === c.id)
    )
    .map((c) => ({
      ...c,
      ncOuvertes: ncParChantier[c.id].ouvertes,
      ncUrgentes: 0,
    }))
    .sort((a, b) => b.ncOuvertes - a.ncOuvertes) ?? [];

  return (
    <div className="space-y-6 sm:space-y-8 stagger-children">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
            Tableau de bord
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Vue d&apos;ensemble de vos chantiers et inspections
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/chantiers/archives"
            className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 bg-white text-gray-600 font-medium rounded-xl border border-stone-200 hover:bg-stone-50 transition-all text-sm shadow-subtle"
          >
            <span className="material-symbols-outlined text-lg">inventory_2</span>
            Archives
          </Link>
          <a
            href="/api/export/xlsx?scope=all"
            download
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-all text-sm shadow-sm hover:shadow-md flex-1 sm:flex-initial"
          >
            <span className="material-symbols-outlined text-lg">download</span>
            Export Excel
          </a>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard
          label="Chantiers actifs"
          value={chantiersActifs}
          href="/chantiers"
          icon="foundation"
          color="brand"
        />
        <KpiCard
          label="NC ouvertes"
          value={ncOuvertes}
          href="/chantiers"
          icon="warning"
          color={ncOuvertes > 0 ? "red" : "green"}
        />
        <KpiCard
          label="Visites ce mois"
          value={visitesCeMois}
          href="/chantiers"
          icon="event_note"
          color="blue"
        />
        <KpiCard
          label="Taux de conformité"
          value={tauxConformite !== null ? `${tauxConformite}%` : "—"}
          subtitle="3 derniers mois"
          href="/chantiers"
          icon="verified"
          color={
            tauxConformite === null
              ? "gray"
              : tauxConformite >= 80
                ? "green"
                : tauxConformite >= 60
                  ? "amber"
                  : "red"
          }
        />
      </div>

      {/* NC par thème */}
      <Card title="Non-conformités par thème" icon="bar_chart">
        {ncParTheme.length > 0 ? (
          <NcThemeChart data={ncParTheme} />
        ) : (
          <div className="py-12 text-center mt-4">
            <span className="material-symbols-outlined text-4xl text-stone-300 mb-3 block">analytics</span>
            <p className="text-gray-400 text-sm">
              Aucune non-conformité enregistrée
            </p>
          </div>
        )}
      </Card>

      {/* Chantiers urgents */}
      <Card title="Chantiers avec NC en attente" icon="priority_high">
        {chantiersUrgents.length === 0 && chantiersAvecNc.length === 0 ? (
          <div className="py-12 text-center mt-4">
            <span className="material-symbols-outlined text-4xl text-emerald-300 mb-3 block">check_circle</span>
            <p className="text-gray-400 text-sm">
              Aucune non-conformité en attente
            </p>
          </div>
        ) : (
          <div className="divide-y divide-stone-100 mt-4">
            {chantiersUrgents.map((c) => (
              <ChantierNcRow
                key={c.id}
                id={c.id}
                nom={c.nom}
                adresse={c.adresse}
                ncOuvertes={c.ncOuvertes}
                ncUrgentes={c.ncUrgentes}
              />
            ))}
            {chantiersAvecNc.map((c) => (
              <ChantierNcRow
                key={c.id}
                id={c.id}
                nom={c.nom}
                adresse={c.adresse}
                ncOuvertes={c.ncOuvertes}
                ncUrgentes={0}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// --- Sub-components ---

function KpiCard({
  label,
  value,
  subtitle,
  href,
  icon,
  color,
}: {
  label: string;
  value: number | string;
  subtitle?: string;
  href?: string;
  icon?: string;
  color: string;
}) {
  const colorMap: Record<string, { bg: string; icon: string; accent: string }> = {
    brand: {
      bg: "bg-white",
      icon: "bg-brand-50 text-brand-600",
      accent: "text-brand-700",
    },
    red: {
      bg: "bg-white",
      icon: "bg-red-50 text-red-600",
      accent: "text-red-700",
    },
    green: {
      bg: "bg-white",
      icon: "bg-emerald-50 text-emerald-600",
      accent: "text-emerald-700",
    },
    amber: {
      bg: "bg-white",
      icon: "bg-amber-50 text-amber-600",
      accent: "text-amber-700",
    },
    blue: {
      bg: "bg-white",
      icon: "bg-blue-50 text-blue-600",
      accent: "text-blue-700",
    },
    gray: {
      bg: "bg-white",
      icon: "bg-stone-100 text-gray-500",
      accent: "text-gray-700",
    },
  };

  const colors = colorMap[color] ?? colorMap.gray;

  const content = (
    <div className={`rounded-2xl border border-stone-200/80 p-5 ${colors.bg} ${href ? "card-hover cursor-pointer" : ""} shadow-card`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-400">{label}</p>
          <p className={`text-3xl font-heading font-bold mt-1.5 ${colors.accent}`}>{value}</p>
          {subtitle && (
            <p className="text-[11px] text-gray-400 mt-1">{subtitle}</p>
          )}
        </div>
        {icon && (
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${colors.icon}`}>
            <span className="material-symbols-outlined text-xl">{icon}</span>
          </div>
        )}
      </div>
    </div>
  );

  if (href) {
    return <Link href={href} className="block">{content}</Link>;
  }

  return content;
}

function ChantierNcRow({
  id,
  nom,
  adresse,
  ncOuvertes,
  ncUrgentes,
}: {
  id: string;
  nom: string | null;
  adresse: string;
  ncOuvertes: number;
  ncUrgentes: number;
}) {
  return (
    <Link
      href={`/chantiers/${id}`}
      className="flex items-center justify-between py-3.5 px-3 hover:bg-stone-50 rounded-xl min-h-touch transition-colors -mx-1"
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium text-gray-900 truncate">
          {nom ?? adresse}
        </p>
        {nom && (
          <p className="text-sm text-gray-400 truncate mt-0.5">{adresse}</p>
        )}
      </div>
      <div className="flex items-center gap-2 ml-4 shrink-0">
        {ncUrgentes > 0 && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/10">
            <span className="material-symbols-outlined text-xs">schedule</span>
            {ncUrgentes} urgente{ncUrgentes > 1 ? "s" : ""}
          </span>
        )}
        <EcartStatusBadge statut="ouvert" />
        <span className="text-sm font-semibold text-gray-500 tabular-nums">
          {ncOuvertes}
        </span>
      </div>
    </Link>
  );
}
