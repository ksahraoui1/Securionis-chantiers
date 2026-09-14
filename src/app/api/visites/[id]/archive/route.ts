import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/supabase/require-api-user";
import { canAccessVisite } from "@/lib/utils/security";
import { ArchiveError, preparerArchive, lireArchive, exporterArchive, verifierQuotaArchive } from "@/lib/supabase/visite-archive";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const client = await createClient();
    const { user, response } = await requireApiUser(client);
    if (response) return response;
    const { id } = await params;
    const text = await request.text();
    if (text.length > 4096) return NextResponse.json({ error: "Requête trop volumineuse." }, { status: 413 });
    let body;
    try { body = JSON.parse(text); } catch { return NextResponse.json({ error: "Requête invalide." }, { status: 400 }); }
    if (!body || !uuid.test(id) || typeof body.operationId !== "string" || !uuid.test(body.operationId) || body.auteurId !== user.id || (body.empreinte !== null && (typeof body.empreinte !== "string" || !/^[0-9a-f]{64}$/.test(body.empreinte)))) return NextResponse.json({ error: "Demande ou compte différent. Rechargez la page." }, { status: 409 });
    const service = await createServiceClient();
    const archiveId = await preparerArchive(client, service, { visiteId: id, operationId: body.operationId, auteurId: user.id, empreinte: body.empreinte });
    return NextResponse.json({ archiveId }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ArchiveError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Préparation des sources non confirmée", { type: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "Archivage non confirmé. Réessayez la même demande." }, { status: 503 });
  }
}
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const client = await createClient();
    const { user, response } = await requireApiUser(client);
    if (response) return response;
    const { id } = await params;
    if (!uuid.test(id) || !(await canAccessVisite(client, user.id, id))) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    const archive = await lireArchive(client, id);
    if (!archive) return NextResponse.json({ error: "Cette visite ne possède pas encore d’archive des sources." }, { status: 404 });
    if (request.nextUrl.searchParams.get("format") === "zip") {
      await verifierQuotaArchive(await createServiceClient(), user.id, "zip");
      const zip = await exporterArchive(client, archive);
      return new NextResponse(new Uint8Array(zip), { headers: { "Content-Type": "application/zip", "Cache-Control": "private, no-store", "Content-Disposition": `attachment; filename="archive_${id}.zip"` } });
    }
    // Le contenu canonique permet de recalculer le SHA-256 sans ambiguïté JSON.
    return NextResponse.json(archive, { headers: { "Cache-Control": "private, no-store", "Content-Disposition": `attachment; filename="archive_${id}.json"` } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof ArchiveError ? error.message : "Archive indisponible." }, { status: error instanceof ArchiveError ? error.status : 503 });
  }
}
