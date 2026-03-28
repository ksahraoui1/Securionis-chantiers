import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChantierCard } from "@/components/chantier/chantier-card";
import { ChantierSearch } from "./chantier-search";

export default async function ChantiersPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Load chantiers for current user (RLS handles filtering)
  const { data: chantiers } = await supabase
    .from("chantiers")
    .select("*")
    .eq("archived", false)
    .order("updated_at", { ascending: false });

  // Load stats for each chantier
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

  const chantiersWithStats =
    chantiers?.map((c) => ({
      chantier: c,
      visiteCount: visiteCounts[c.id] ?? 0,
      ecartCount: ecartCounts[c.id] ?? 0,
    })) ?? [];

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
            Chantiers
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            {chantiersWithStats.length} chantier{chantiersWithStats.length !== 1 ? "s" : ""} actif{chantiersWithStats.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Link
            href="/chantiers/archives"
            className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 bg-white text-gray-600 font-medium rounded-xl border border-stone-200 hover:bg-stone-50 transition-all text-sm shadow-subtle"
          >
            <span className="material-symbols-outlined text-lg">inventory_2</span>
            Archives
          </Link>
          <Link
            href="/chantiers/nouveau"
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 bg-brand-600 text-white font-medium rounded-xl hover:bg-brand-700 transition-all flex-1 sm:flex-initial shadow-sm hover:shadow-md text-sm"
          >
            <span className="material-symbols-outlined text-lg">add</span>
            Nouveau chantier
          </Link>
        </div>
      </div>

      <ChantierSearch chantiersWithStats={chantiersWithStats} />
    </div>
  );
}
