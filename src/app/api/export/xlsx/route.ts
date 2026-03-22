import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as XLSX from "xlsx";

/**
 * GET /api/export/xlsx?scope=all|chantier&chantierId=xxx
 *
 * Generates an Excel file with 3 sheets:
 * - Chantiers (or single chantier info)
 * - Visites
 * - Écarts (NC)
 * + a Statistiques sheet for global export
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
  const scope = url.searchParams.get("scope") ?? "all";
  const chantierId = url.searchParams.get("chantierId");

  const wb = XLSX.utils.book_new();

  if (scope === "chantier" && chantierId) {
    await buildChantierExport(supabase, wb, chantierId);
  } else {
    await buildGlobalExport(supabase, wb);
  }

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const filename =
    scope === "chantier" && chantierId
      ? `export-chantier-${chantierId.slice(0, 8)}.xlsx`
      : `export-securionis-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new Response(buf, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildGlobalExport(supabase: any, wb: XLSX.WorkBook) {
  // --- Chantiers ---
  const { data: chantiers } = await supabase
    .from("chantiers")
    .select("*")
    .order("updated_at", { ascending: false });

  const chantierRows = (chantiers ?? []).map((c: Record<string, unknown>) => ({
    Nom: c.nom ?? "",
    Adresse: c.adresse,
    "Nature travaux": c.nature_travaux,
    "Ref. communale": c.ref_communale ?? "",
    "N° CAMAC": c.numero_camac ?? "",
    "N° Parcelle": c.numero_parcelle ?? "",
    "N° ECA": c.numero_eca ?? "",
    Contact: c.contact_nom ?? "",
    "Dernière modification": formatDate(c.updated_at as string),
  }));
  const wsChantiers = XLSX.utils.json_to_sheet(chantierRows);
  autoWidth(wsChantiers, chantierRows);
  XLSX.utils.book_append_sheet(wb, wsChantiers, "Chantiers");

  const chantierIds = (chantiers ?? []).map((c: Record<string, unknown>) => c.id as string);

  // --- Visites ---
  const { data: visites } = await supabase
    .from("visites")
    .select("*, profiles:inspecteur_id(nom), chantiers:chantier_id(nom, adresse)")
    .in("chantier_id", chantierIds.length > 0 ? chantierIds : [""])
    .order("date_visite", { ascending: false });

  const visiteRows = (visites ?? []).map((v: Record<string, unknown>) => {
    const chantier = v.chantiers as Record<string, unknown> | null;
    const profile = v.profiles as Record<string, unknown> | null;
    return {
      Chantier: chantier?.nom ?? chantier?.adresse ?? "",
      "Date visite": formatDate(v.date_visite as string),
      Inspecteur: profile?.nom ?? "Inconnu",
      Statut: labelStatutVisite(v.statut as string),
      "Rapport envoyé": v.email_envoye ? "Oui" : "Non",
    };
  });
  const wsVisites = XLSX.utils.json_to_sheet(visiteRows);
  autoWidth(wsVisites, visiteRows);
  XLSX.utils.book_append_sheet(wb, wsVisites, "Visites");

  // --- Écarts ---
  const { data: ecarts } = await supabase
    .from("ecarts")
    .select("*, chantiers:chantier_id(nom, adresse)")
    .in("chantier_id", chantierIds.length > 0 ? chantierIds : [""])
    .order("created_at", { ascending: false });

  const ecartRows = (ecarts ?? []).map((e: Record<string, unknown>) => {
    const chantier = e.chantiers as Record<string, unknown> | null;
    return {
      Chantier: chantier?.nom ?? chantier?.adresse ?? "",
      Description: e.description,
      Statut: labelStatutEcart(e.statut as string),
      Délai: e.delai ? formatDate(e.delai as string) : "Non défini",
      "Date création": formatDate(e.created_at as string),
    };
  });
  const wsEcarts = XLSX.utils.json_to_sheet(ecartRows);
  autoWidth(wsEcarts, ecartRows);
  XLSX.utils.book_append_sheet(wb, wsEcarts, "Écarts NC");

  // --- Statistiques ---
  const { data: allReponses } = await supabase
    .from("reponses")
    .select("id, valeur, visite_id")
    .in(
      "visite_id",
      (visites ?? []).map((v: Record<string, unknown>) => v.id as string)
    );

  const totalVisites = (visites ?? []).length;
  const totalEcarts = (ecarts ?? []).length;
  const ecartsOuverts = (ecarts ?? []).filter(
    (e: Record<string, unknown>) => e.statut !== "corrige"
  ).length;
  const ecartsCorriges = totalEcarts - ecartsOuverts;
  const totalReponses = (allReponses ?? []).length;
  const conformes = (allReponses ?? []).filter(
    (r: Record<string, unknown>) => r.valeur === "conforme"
  ).length;
  const tauxConformite =
    totalReponses > 0 ? Math.round((conformes / totalReponses) * 100) : 0;

  const statsRows = [
    { Indicateur: "Chantiers actifs", Valeur: chantierIds.length },
    { Indicateur: "Total visites", Valeur: totalVisites },
    { Indicateur: "Total NC", Valeur: totalEcarts },
    { Indicateur: "NC ouvertes", Valeur: ecartsOuverts },
    { Indicateur: "NC corrigées", Valeur: ecartsCorriges },
    { Indicateur: "Taux de conformité", Valeur: `${tauxConformite}%` },
    {
      Indicateur: "Date export",
      Valeur: new Date().toLocaleDateString("fr-CH", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    },
  ];
  const wsStats = XLSX.utils.json_to_sheet(statsRows);
  autoWidth(wsStats, statsRows);
  XLSX.utils.book_append_sheet(wb, wsStats, "Statistiques");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildChantierExport(supabase: any, wb: XLSX.WorkBook, chantierId: string) {
  const { data: chantier } = await supabase
    .from("chantiers")
    .select("*")
    .eq("id", chantierId)
    .single();

  if (!chantier) return;

  // --- Info chantier ---
  const infoRows = [
    { Champ: "Nom", Valeur: chantier.nom ?? "" },
    { Champ: "Adresse", Valeur: chantier.adresse },
    { Champ: "Nature travaux", Valeur: chantier.nature_travaux },
    { Champ: "Ref. communale", Valeur: chantier.ref_communale ?? "" },
    { Champ: "N° CAMAC", Valeur: chantier.numero_camac ?? "" },
    { Champ: "N° Parcelle", Valeur: chantier.numero_parcelle ?? "" },
    { Champ: "N° ECA", Valeur: chantier.numero_eca ?? "" },
    { Champ: "Contact", Valeur: chantier.contact_nom ?? "" },
  ];
  const wsInfo = XLSX.utils.json_to_sheet(infoRows);
  autoWidth(wsInfo, infoRows);
  XLSX.utils.book_append_sheet(wb, wsInfo, "Chantier");

  // --- Visites ---
  const { data: visites } = await supabase
    .from("visites")
    .select("*, profiles:inspecteur_id(nom)")
    .eq("chantier_id", chantierId)
    .order("date_visite", { ascending: false });

  const visiteIds = (visites ?? []).map((v: Record<string, unknown>) => v.id as string);

  // Get NC count per visite
  let ncCounts: Record<string, number> = {};
  if (visiteIds.length > 0) {
    const { data: ncReponses } = await supabase
      .from("reponses")
      .select("visite_id")
      .in("visite_id", visiteIds)
      .eq("valeur", "non_conforme");

    for (const r of ncReponses ?? []) {
      const vid = (r as Record<string, unknown>).visite_id as string;
      ncCounts[vid] = (ncCounts[vid] ?? 0) + 1;
    }
  }

  const visiteRows = (visites ?? []).map((v: Record<string, unknown>) => {
    const profile = v.profiles as Record<string, unknown> | null;
    return {
      "Date visite": formatDate(v.date_visite as string),
      Inspecteur: profile?.nom ?? "Inconnu",
      Statut: labelStatutVisite(v.statut as string),
      "Points NC": ncCounts[v.id as string] ?? 0,
      "Rapport envoyé": v.email_envoye ? "Oui" : "Non",
    };
  });
  const wsVisites = XLSX.utils.json_to_sheet(visiteRows);
  autoWidth(wsVisites, visiteRows);
  XLSX.utils.book_append_sheet(wb, wsVisites, "Visites");

  // --- Écarts ---
  const { data: ecarts } = await supabase
    .from("ecarts")
    .select("*")
    .eq("chantier_id", chantierId)
    .order("created_at", { ascending: false });

  const ecartRows = (ecarts ?? []).map((e: Record<string, unknown>) => ({
    Description: e.description,
    Statut: labelStatutEcart(e.statut as string),
    Délai: e.delai ? formatDate(e.delai as string) : "Non défini",
    "Date création": formatDate(e.created_at as string),
    "Dernière mise à jour": formatDate(e.updated_at as string),
  }));
  const wsEcarts = XLSX.utils.json_to_sheet(ecartRows);
  autoWidth(wsEcarts, ecartRows);
  XLSX.utils.book_append_sheet(wb, wsEcarts, "Écarts NC");

  // --- Réponses détaillées ---
  if (visiteIds.length > 0) {
    const { data: reponses } = await supabase
      .from("reponses")
      .select("*, points_controle:point_controle_id(intitule, base_legale)")
      .in("visite_id", visiteIds);

    const reponseRows = (reponses ?? []).map((r: Record<string, unknown>) => {
      const pc = r.points_controle as Record<string, unknown> | null;
      return {
        "Point de contrôle": pc?.intitule ?? "",
        "Base légale": pc?.base_legale ?? "",
        Valeur: labelValeur(r.valeur as string),
        Remarque: r.remarque ?? "",
      };
    });

    if (reponseRows.length > 0) {
      const wsReponses = XLSX.utils.json_to_sheet(reponseRows);
      autoWidth(wsReponses, reponseRows);
      XLSX.utils.book_append_sheet(wb, wsReponses, "Réponses détaillées");
    }
  }
}

// --- Helpers ---

function formatDate(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("fr-CH", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function labelStatutVisite(s: string): string {
  const map: Record<string, string> = {
    brouillon: "Brouillon",
    en_cours: "En cours",
    terminee: "Terminée",
  };
  return map[s] ?? s;
}

function labelStatutEcart(s: string): string {
  const map: Record<string, string> = {
    ouvert: "Ouvert",
    en_cours_correction: "En cours de correction",
    corrige: "Corrigé",
  };
  return map[s] ?? s;
}

function labelValeur(v: string): string {
  const map: Record<string, string> = {
    conforme: "Conforme",
    non_conforme: "Non-conforme",
    pas_necessaire: "Pas nécessaire",
  };
  return map[v] ?? v;
}

function autoWidth(ws: XLSX.WorkSheet, data: Record<string, unknown>[]) {
  if (data.length === 0) return;
  const keys = Object.keys(data[0]);
  ws["!cols"] = keys.map((k) => {
    const maxLen = Math.max(
      k.length,
      ...data.map((row) => String(row[k] ?? "").length)
    );
    return { wch: Math.min(maxLen + 2, 50) };
  });
}
