import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canAccessVisite } from "@/lib/utils/security";

/**
 * GET /api/visites/compare?visiteA=xxx&visiteB=xxx
 *
 * Returns comparison data for two visits:
 * - Points de contrôle with valeur from each visite
 * - Classification: corrigee, persistante, nouvelle, regression, identique
 */
export async function GET(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const url = new URL(request.url);
  const visiteAId = url.searchParams.get("visiteA");
  const visiteBId = url.searchParams.get("visiteB");

  if (!visiteAId || !visiteBId) {
    return NextResponse.json(
      { error: "visiteA et visiteB sont requis" },
      { status: 400 }
    );
  }

  // Vérification d'autorisation
  const [canA, canB] = await Promise.all([
    canAccessVisite(supabase, user.id, visiteAId),
    canAccessVisite(supabase, user.id, visiteBId),
  ]);

  if (!canA || !canB) {
    return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
  }

  // Load both visites
  const { data: visiteA } = await supabase
    .from("visites")
    .select("id, date_visite, statut, profiles:inspecteur_id(nom)")
    .eq("id", visiteAId)
    .single();

  const { data: visiteB } = await supabase
    .from("visites")
    .select("id, date_visite, statut, profiles:inspecteur_id(nom)")
    .eq("id", visiteBId)
    .single();

  if (!visiteA || !visiteB) {
    return NextResponse.json(
      { error: "Visite introuvable" },
      { status: 404 }
    );
  }

  // Load responses for both
  const { data: reponsesA } = await supabase
    .from("reponses")
    .select("point_controle_id, valeur, remarque")
    .eq("visite_id", visiteAId);

  const { data: reponsesB } = await supabase
    .from("reponses")
    .select("point_controle_id, valeur, remarque")
    .eq("visite_id", visiteBId);

  // Index by point_controle_id
  const mapA = new Map(
    (reponsesA ?? []).map((r) => [r.point_controle_id, r])
  );
  const mapB = new Map(
    (reponsesB ?? []).map((r) => [r.point_controle_id, r])
  );

  // Collect all point_controle_ids
  const allPcIds = new Set([...mapA.keys(), ...mapB.keys()]);

  // Load point de contrôle details
  const { data: pointsControle } = await supabase
    .from("points_controle")
    .select("id, intitule, objet, base_legale")
    .in("id", [...allPcIds]);

  const pcMap = new Map(
    (pointsControle ?? []).map((pc) => [pc.id, pc])
  );

  // Build comparison rows
  type CompareStatus =
    | "corrigee"       // NC in A → conforme in B
    | "persistante"    // NC in both
    | "nouvelle"       // conforme/absent in A → NC in B
    | "regression"     // conforme in A → NC in B (alias nouvelle)
    | "identique"      // same value in both
    | "amelioree";     // was NC, now pas_necessaire or absent

  const rows: {
    pointControleId: string;
    intitule: string;
    objet: string | null;
    baseLegale: string | null;
    valeurA: string | null;
    valeurB: string | null;
    remarqueA: string | null;
    remarqueB: string | null;
    status: CompareStatus;
  }[] = [];

  for (const pcId of allPcIds) {
    const pc = pcMap.get(pcId);
    const rA = mapA.get(pcId);
    const rB = mapB.get(pcId);

    const valA = rA?.valeur ?? null;
    const valB = rB?.valeur ?? null;

    let status: CompareStatus = "identique";

    if (valA === "non_conforme" && valB === "conforme") {
      status = "corrigee";
    } else if (valA === "non_conforme" && valB === "non_conforme") {
      status = "persistante";
    } else if (valA === "non_conforme" && (valB === "pas_necessaire" || valB === null)) {
      status = "amelioree";
    } else if (
      (valA === "conforme" || valA === "pas_necessaire" || valA === null) &&
      valB === "non_conforme"
    ) {
      status = "nouvelle";
    } else {
      status = "identique";
    }

    rows.push({
      pointControleId: pcId,
      intitule: pc?.intitule ?? "Point inconnu",
      objet: pc?.objet ?? null,
      baseLegale: pc?.base_legale ?? null,
      valeurA: valA,
      valeurB: valB,
      remarqueA: rA?.remarque ?? null,
      remarqueB: rB?.remarque ?? null,
      status,
    });
  }

  // Sort: nouvelles and persistantes first, then corrigées, then rest
  const order: Record<CompareStatus, number> = {
    nouvelle: 0,
    persistante: 1,
    regression: 2,
    corrigee: 3,
    amelioree: 4,
    identique: 5,
  };
  rows.sort((a, b) => order[a.status] - order[b.status]);

  const profileA = visiteA.profiles as unknown as { nom: string } | null;
  const profileB = visiteB.profiles as unknown as { nom: string } | null;

  return NextResponse.json({
    visiteA: {
      id: visiteA.id,
      date: visiteA.date_visite,
      inspecteur: profileA?.nom ?? "Inconnu",
    },
    visiteB: {
      id: visiteB.id,
      date: visiteB.date_visite,
      inspecteur: profileB?.nom ?? "Inconnu",
    },
    rows,
    summary: {
      corrigees: rows.filter((r) => r.status === "corrigee").length,
      persistantes: rows.filter((r) => r.status === "persistante").length,
      nouvelles: rows.filter((r) => r.status === "nouvelle").length,
      ameliorees: rows.filter((r) => r.status === "amelioree").length,
      identiques: rows.filter((r) => r.status === "identique").length,
      total: rows.length,
    },
  });
}
