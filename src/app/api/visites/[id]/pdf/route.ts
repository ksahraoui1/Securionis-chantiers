import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: visiteId } = await params;

  try {
    const supabase = await createClient();

    // Verify auth
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    }

    // Load visite
    const { data: visite } = await supabase
      .from("visites")
      .select("*")
      .eq("id", visiteId)
      .single();

    if (!visite) {
      return NextResponse.json(
        { error: "Visite introuvable" },
        { status: 404 }
      );
    }

    if (visite.statut !== "terminee") {
      return NextResponse.json(
        { error: "La visite doit etre terminee pour generer le PDF" },
        { status: 400 }
      );
    }

    // Load chantier
    const { data: chantier } = await supabase
      .from("chantiers")
      .select("*")
      .eq("id", visite.chantier_id)
      .single();

    // Load inspecteur profile
    const { data: inspecteur } = await supabase
      .from("profiles")
      .select("nom, email")
      .eq("id", visite.inspecteur_id)
      .single();

    // Load reponses with point_controle details
    const { data: reponses } = await supabase
      .from("reponses")
      .select("*, points_controle:point_controle_id(intitule, critere, objet)")
      .eq("visite_id", visiteId);

    // Load ecarts (historical for this chantier)
    const { data: ecarts } = await supabase
      .from("ecarts")
      .select("*")
      .eq("chantier_id", visite.chantier_id)
      .order("created_at", { ascending: false });

    // Load destinataires
    const { data: destinataires } = await supabase
      .from("destinataires")
      .select("*")
      .eq("chantier_id", visite.chantier_id);

    // Dynamically import react-pdf to avoid SSR issues
    const { renderToBuffer } = await import("@react-pdf/renderer");
    const { RapportVisite } = await import(
      "@/components/pdf/rapport-visite"
    );

    const pdfBuffer = await renderToBuffer(
      RapportVisite({
        chantier: chantier!,
        visite,
        inspecteur: inspecteur ?? { nom: "Inconnu", email: "" },
        reponses: reponses ?? [],
        ecarts: ecarts ?? [],
        destinataires: destinataires ?? [],
      })
    );

    // Upload to Supabase Storage
    const serviceClient = await createServiceClient();
    const dateStr = visite.date_visite.replace(/-/g, "");
    const filename = `rapport_${dateStr}_${visiteId.slice(0, 8)}.pdf`;
    const storagePath = `${visite.chantier_id}/${filename}`;

    const { error: uploadError } = await serviceClient.storage
      .from("rapports")
      .upload(storagePath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Upload error: ${uploadError.message}`);
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = serviceClient.storage.from("rapports").getPublicUrl(storagePath);

    // Update visite with rapport URL (service client to bypass RLS)
    await serviceClient
      .from("visites")
      .update({ rapport_url: publicUrl })
      .eq("id", visiteId);

    return NextResponse.json({ url: publicUrl, filename });
  } catch (err) {
    console.error("PDF generation error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Erreur lors de la generation du PDF",
      },
      { status: 500 }
    );
  }
}
