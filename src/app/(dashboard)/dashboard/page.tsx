import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { EcartStatusBadge } from "@/components/ecart/ecart-status-badge";
import { NcChart } from "./nc-chart";

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
    .select("id, chantier_id, statut, delai, created_at")
    .in("chantier_id", chantierIds.length > 0 ? chantierIds : [""]);

  // --- Toutes les réponses (pour taux de conformité) ---
  const visiteIds = allVisites?.map((v) => v.id) ?? [];
  const { data: allReponses } = await supabase
    .from("reponses")
    .select("id, valeur, visite_id")
    .in("visite_id", visiteIds.length > 0 ? visiteIds : [""]);

  // ===== INDICATEURS =====

  // 1. Chantiers actifs = ceux avec au moins 1 visite non terminée ou activité récente
  const chantiersActifs = chantiers?.length ?? 0;

  // 2. NC ouvertes (non corrigées)
  const ncOuvertes =
    allEcarts?.filter((e) => e.statut !== "corrige").length ?? 0;

  // 3. Visites ce mois
  const now = new Date();
  const debutMois = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const visitesCeMois =
    allVisites?.filter((v) => v.date_visite >= debutMois).length ?? 0;

  // 4. Taux de conformité sur les 3 derniers mois
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

  // 5. Données graphique NC par mois (6 derniers mois)
  const ncParMois: { mois: string; ouvertes: number; corrigees: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const moisKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const moisLabel = d.toLocaleDateString("fr-CH", {
      month: "short",
      year: "2-digit",
    });
    const ouvertes =
      allEcarts?.filter(
        (e) =>
          e.created_at.slice(0, 7) === moisKey && e.statut !== "corrige"
      ).length ?? 0;
    const corrigees =
      allEcarts?.filter(
        (e) =>
          e.created_at.slice(0, 7) === moisKey && e.statut === "corrige"
      ).length ?? 0;
    ncParMois.push({ mois: moisLabel, ouvertes, corrigees });
  }

  // 6. Chantiers avec NC urgentes (ouvertes avec délai dépassé ou sans délai)
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
    // Urgente si délai dépassé
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

  // Chantiers avec NC ouvertes (mais pas forcément urgentes)
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Tableau de bord</h1>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Link
            href="/chantiers/archives"
            className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors text-sm"
          >
            <span className="material-symbols-outlined text-lg">inventory_2</span>
            Archives
          </Link>
          <a
            href="/api/export/xlsx?scope=all"
            download
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors text-sm flex-1 sm:flex-initial"
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
          icon="domain"
          color="blue"
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
          icon="checklist"
          color="indigo"
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

      {/* Graphique NC */}
      <Card title="Évolution des non-conformités">
        {allEcarts && allEcarts.length > 0 ? (
          <NcChart data={ncParMois} />
        ) : (
          <p className="text-gray-500 text-sm py-8 text-center">
            Aucune donnée disponible
          </p>
        )}
      </Card>

      {/* Chantiers urgents */}
      <Card title="Chantiers avec NC en attente">
        {chantiersUrgents.length === 0 && chantiersAvecNc.length === 0 ? (
          <p className="text-gray-500 text-sm py-4 text-center">
            Aucune non-conformité en attente
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
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
  const colorMap: Record<string, { card: string; icon: string }> = {
    blue: { card: "text-blue-700 bg-blue-50 border-blue-200", icon: "bg-blue-100 text-blue-600" },
    red: { card: "text-red-700 bg-red-50 border-red-200", icon: "bg-red-100 text-red-600" },
    green: { card: "text-green-700 bg-green-50 border-green-200", icon: "bg-green-100 text-green-600" },
    amber: { card: "text-amber-700 bg-amber-50 border-amber-200", icon: "bg-amber-100 text-amber-600" },
    indigo: { card: "text-indigo-700 bg-indigo-50 border-indigo-200", icon: "bg-indigo-100 text-indigo-600" },
    gray: { card: "text-gray-700 bg-gray-50 border-gray-200", icon: "bg-gray-100 text-gray-600" },
  };

  const colors = colorMap[color] ?? colorMap.gray;

  const content = (
    <div className={`rounded-xl border p-4 ${colors.card} ${href ? "hover:shadow-md hover:scale-[1.02] cursor-pointer" : ""} transition-all`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium opacity-75">{label}</p>
          <p className="text-3xl font-bold mt-1">{value}</p>
          {subtitle && (
            <p className="text-xs opacity-60 mt-1">{subtitle}</p>
          )}
        </div>
        {icon && (
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors.icon}`}>
            <span className="material-symbols-outlined text-xl">{icon}</span>
          </div>
        )}
      </div>
      {href && (
        <p className="text-[10px] opacity-50 mt-2 flex items-center gap-0.5">
          Voir le détail
          <span className="material-symbols-outlined text-xs">arrow_forward</span>
        </p>
      )}
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
      className="flex items-center justify-between py-3 px-2 hover:bg-gray-50 rounded-lg min-h-touch"
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium text-gray-900 truncate">
          {nom ?? adresse}
        </p>
        {nom && (
          <p className="text-sm text-gray-500 truncate">{adresse}</p>
        )}
      </div>
      <div className="flex items-center gap-2 ml-4 shrink-0">
        {ncUrgentes > 0 && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800">
            {ncUrgentes} urgente{ncUrgentes > 1 ? "s" : ""}
          </span>
        )}
        <EcartStatusBadge statut="ouvert" />
        <span className="text-sm font-medium text-gray-600">
          {ncOuvertes}
        </span>
      </div>
    </Link>
  );
}
