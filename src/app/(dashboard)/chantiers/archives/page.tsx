import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChantierCard } from "@/components/chantier/chantier-card";

export default async function ChantiersArchivesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: chantiers } = await supabase
    .from("chantiers")
    .select("*")
    .eq("archived", true)
    .order("archived_at", { ascending: false });

  const chantierIds = chantiers?.map((c) => c.id) ?? [];

  let visiteCounts: Record<string, number> = {};
  let ecartCounts: Record<string, number> = {};

  if (chantierIds.length > 0) {
    const { data: visites } = await supabase
      .from("visites")
      .select("id, chantier_id")
      .in("chantier_id", chantierIds);

    if (visites) {
      for (const v of visites) {
        visiteCounts[v.chantier_id] =
          (visiteCounts[v.chantier_id] ?? 0) + 1;
      }
    }

    const { data: ecarts } = await supabase
      .from("ecarts")
      .select("id, chantier_id, statut")
      .in("chantier_id", chantierIds)
      .neq("statut", "corrige");

    if (ecarts) {
      for (const e of ecarts) {
        ecartCounts[e.chantier_id] =
          (ecartCounts[e.chantier_id] ?? 0) + 1;
      }
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 sm:py-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            Chantiers archivés
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {chantiers?.length ?? 0} chantier{(chantiers?.length ?? 0) > 1 ? "s" : ""} archivé{(chantiers?.length ?? 0) > 1 ? "s" : ""}
          </p>
        </div>
        <Link
          href="/chantiers"
          className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 bg-gray-200 text-gray-800 font-medium rounded-lg hover:bg-gray-300 transition-colors text-sm"
        >
          <span className="material-symbols-outlined text-lg">arrow_back</span>
          Chantiers actifs
        </Link>
      </div>

      {!chantiers || chantiers.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-gray-400 text-3xl">inventory_2</span>
          </div>
          <p className="text-gray-500">Aucun chantier archivé</p>
        </div>
      ) : (
        <div className="space-y-3">
          {chantiers.map((chantier) => (
            <div key={chantier.id} className="relative">
              <div className="absolute top-3 right-3 z-10">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800">
                  <span className="material-symbols-outlined text-xs">inventory_2</span>
                  Archivé {chantier.archived_at
                    ? new Date(chantier.archived_at).toLocaleDateString("fr-CH")
                    : ""}
                </span>
              </div>
              <ChantierCard
                chantier={chantier}
                visiteCount={visiteCounts[chantier.id] ?? 0}
                ecartCount={ecartCounts[chantier.id] ?? 0}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
