import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/supabase/require-api-user";
import { chargerPiece, PieceError } from "@/lib/ecarts/piece-storage";
export async function GET(request: NextRequest, {params}: {params: Promise<{id: string;pieceId:string}>}) {
  try {
    const client = await createClient();
    const {user,response} = await requireApiUser(client); if(response) return response;
    const {id,pieceId} = await params;
    const {data:piece,error} = await client.from("ecart_pieces").select("*").eq("id",pieceId).eq("ecart_id",id).single();
    if(error || !piece) return NextResponse.json({error:"Pièce inaccessible."},{status:404});
    const {data:profil,error:profileError} = await client.from("profiles").select("entreprise_id").eq("id",user.id).single();
    if(profileError || !profil?.entreprise_id) throw new PieceError("Entreprise indisponible.",503);
    // Le service ne lit les octets qu'après la décision RLS du client utilisateur.
    const bytes = await chargerPiece(await createServiceClient(),piece,profil.entreprise_id);
    const inline = request.nextUrl.searchParams.get("apercu") === "1" && ["image/jpeg","image/png"].includes(piece.mime);
    const ext = piece.mime === "application/pdf" ? "pdf" : piece.mime === "image/png" ? "png" : "jpg";
    return new NextResponse(new Uint8Array(bytes),{headers:{"Content-Type":piece.mime,"Content-Length":String(bytes.length),"Content-Disposition":`${inline?"inline":"attachment"}; filename="preuve_${piece.id}.${ext}"; filename*=UTF-8''${encodeURIComponent(piece.nom)}`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox"}});
  } catch(e) { return NextResponse.json({error:e instanceof PieceError?e.message:"Pièce indisponible."},{status:e instanceof PieceError?e.status:503,headers:{"Cache-Control":"private, no-store"}}); }
}
