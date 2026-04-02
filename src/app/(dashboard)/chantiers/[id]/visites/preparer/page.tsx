import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { EcartStatusBadge } from "@/components/ecart/ecart-status-badge";

export default async function PreparerVisitePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: chantierId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: chantier } = await supabase
    .from("chantiers")
    .select("*")
    .eq("id", chantierId)
    .single();

  if (!chantier) {
    notFound();
  }

  // Open NCs
  const { data: ecarts } = await supabase
    .from("ecarts")
    .select("*")
    .eq("chantier_id", chantierId)
    .neq("statut", "corrige")
    .order("created_at", { ascending: false });

  // Last completed visit with inspector name
  const { data: lastVisite } = await supabase
    .from("visites")
    .select("*, profiles:inspecteur_id(nom)")
    .eq("chantier_id", chantierId)
    .eq("statut", "terminee")
    .order("date_visite", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Reponses stats for last visit
  let totalPoints = 0;
  let conformeCount = 0;
  if (lastVisite) {
    const { data: reponses } = await supabase
      .from("reponses")
      .select("id, valeur")
      .eq("visite_id", lastVisite.id);

    if (reponses) {
      totalPoints = reponses.length;
      conformeCount = reponses.filter((r) => r.valeur === "conforme").length;
    }
  }
  const conformityRate =
    totalPoints > 0 ? Math.round((conformeCount / totalPoints) * 100) : 0;

  // Recent documents (5 latest)
  const { data: documents } = await supabase
    .from("documents")
    .select("*")
    .eq("chantier_id", chantierId)
    .order("created_at", { ascending: false })
    .limit(5);

  const today = new Date();
  const openNCs = ecarts ?? [];
  const recentDocs = documents ?? [];

  // Build link to nouvelle visite with pre-selected categories
  const categoriesParam = lastVisite?.categorie_ids?.join(",");
  const nouvelleVisiteHref = categoriesParam
    ? `/chantiers/${chantierId}/visites/nouvelle?categories=${categoriesParam}`
    : `/chantiers/${chantierId}/visites/nouvelle`;

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 sm:py-6 space-y-5 sm:space-y-6">
      {/* Header */}
      <div>
        <Link
          href={`/chantiers/${chantierId}`}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Retour au chantier
        </Link>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
          Préparer la visite
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {chantier.nom || chantier.adresse}
        </p>
      </div>

      {/* NC ouvertes */}
      <Card title={`Non-conformités à re-vérifier (${openNCs.length})`}>
        {openNCs.length === 0 ? (
          <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-lg p-3">
            <span className="material-symbols-outlined text-lg">check_circle</span>
            <span className="text-sm font-medium">Aucune NC ouverte</span>
          </div>
        ) : (
          <div className="space-y-2">
            {openNCs.map((ecart) => {
              const delaiDate = ecart.delai ? new Date(ecart.delai) : null;
              const isOverdue = delaiDate ? delaiDate < today : false;

              return (
                <div
                  key={ecart.id}
                  className="rounded-lg border border-gray-200 bg-gray-50 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900">
                      {ecart.description}
                    </p>
                    <EcartStatusBadge statut={ecart.statut} />
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                    <span>
                      Créée le{" "}
                      {new Date(ecart.created_at).toLocaleDateString("fr-CH")}
                    </span>
                    {delaiDate && (
                      <span
                        className={
                          isOverdue
                            ? "text-red-600 font-semibold"
                            : "text-gray-500"
                        }
                      >
                        {isOverdue ? "En retard" : "Délai"} :{" "}
                        {delaiDate.toLocaleDateString("fr-CH")}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Dernière visite */}
      <Card title="Dernière visite">
        {!lastVisite ? (
          <p className="text-sm text-gray-500">Aucune visite précédente</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-500">Date</p>
              <p className="font-medium text-gray-900">
                {new Date(lastVisite.date_visite).toLocaleDateString("fr-CH")}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Inspecteur</p>
              <p className="font-medium text-gray-900">
                {(lastVisite.profiles as unknown as { nom: string } | null)
                  ?.nom ?? "Inconnu"}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Points vérifiés</p>
              <p className="font-medium text-gray-900">{totalPoints}</p>
            </div>
            <div>
              <p className="text-gray-500">Taux de conformité</p>
              <p
                className={`font-medium ${
                  conformityRate >= 80
                    ? "text-green-700"
                    : conformityRate >= 60
                      ? "text-amber-700"
                      : "text-red-700"
                }`}
              >
                {conformityRate}%
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* Documents récents */}
      <Card title="Documents récents">
        {recentDocs.length === 0 ? (
          <p className="text-sm text-gray-500">Aucun document</p>
        ) : (
          <div className="space-y-2">
            {recentDocs.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="material-symbols-outlined text-base text-gray-400">
                    description
                  </span>
                  <span className="truncate text-gray-900">{doc.nom}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                    {doc.categorie}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(doc.created_at).toLocaleDateString("fr-CH")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* CTA */}
      {!chantier.archived && (
        <div className="sticky bottom-0 bg-gray-50 pt-4 pb-6">
          <Link
            href={nouvelleVisiteHref}
            className="inline-flex items-center justify-center gap-2 min-h-[52px] px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors text-lg w-full"
          >
            <span className="material-symbols-outlined text-xl">play_arrow</span>
            Démarrer la visite
          </Link>
        </div>
      )}
    </div>
  );
}
