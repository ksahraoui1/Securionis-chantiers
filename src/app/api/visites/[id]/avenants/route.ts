import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/supabase/require-api-user";
import { canAccessVisite, canAccessChantier } from "@/lib/utils/security";
import { validerDemandeAvenant } from "@/lib/visites/avenant";
import { AvenantError, creerAvenant, chargerPdfAvenant, lireAvenants } from "@/lib/supabase/avenant";
function failure(error: unknown) {
  if (error instanceof AvenantError) return NextResponse.json({ error: error.message, refusConfirme: error.refusConfirme }, { status: error.status });
  console.error("Opération d’avenant non confirmée", { type: error instanceof Error ? error.name : "unknown" });
  return NextResponse.json({ error: "Opération non confirmée. Réessayez la même demande.", refusConfirme: false }, { status: 503 });
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const client = await createClient();
    const { user, response } = await requireApiUser(client); if (response) return response;
    const { id } = await params;
    const text = await request.text();
    if (text.length > 100000) return NextResponse.json({ error: "Demande trop volumineuse.", refusConfirme: true }, { status: 413 });
    let demande;
    try { demande = validerDemandeAvenant(JSON.parse(text)); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Demande invalide.", refusConfirme: true }, { status: 400 }); }
    if (demande.visiteId !== id || demande.auteurId !== user.id) return NextResponse.json({ error: "Le compte ou la visite a changé.", refusConfirme: false }, { status: 409 });
    const { data: visite, error } = await client.from("visites").select("id,chantier_id").eq("id", id).single();
    if (error || !visite || !(await canAccessChantier(client, user.id, visite.chantier_id))) return NextResponse.json({ error: "Affectation actuelle requise.", refusConfirme: false }, { status: 403 });
    return NextResponse.json(await creerAvenant(client, await createServiceClient(), demande, visite.chantier_id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const client = await createClient();
    const { user, response } = await requireApiUser(client); if (response) return response;
    const { id } = await params;
    if (!(await canAccessVisite(client, user.id, id))) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    const avenants = await lireAvenants(client, id);
    const avenantId = request.nextUrl.searchParams.get("avenantId");
    if (!avenantId) return NextResponse.json(avenants, { headers: { "Cache-Control": "private, no-store" } });
    const avenant = avenants.find(a => a.id === avenantId);
    if (!avenant) return NextResponse.json({ error: "Avenant introuvable." }, { status: 404 });
    const { data: visite, error } = await client.from("visites").select("chantier_id").eq("id", id).single();
    if (error || !visite) throw new AvenantError("Visite indisponible.", 503);
    const pdf = await chargerPdfAvenant(client, avenant, visite.chantier_id);
    return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="avenant_${avenant.numero}_${avenant.id}.pdf"`, "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}
