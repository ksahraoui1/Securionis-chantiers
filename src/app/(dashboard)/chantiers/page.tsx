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
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Chantiers</h1>
        <Link
          href="/chantiers/nouveau"
          className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Nouveau chantier
        </Link>
      </div>

      <ChantierSearch chantiersWithStats={chantiersWithStats} />
    </div>
  );
}
