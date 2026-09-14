import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/supabase/require-api-user";
import { canAccessChantier } from "@/lib/utils/security";
import { checkRateLimit } from "@/lib/rate-limit";
import { PieceError, cheminPiece, identifierPreuve, lireFluxPreuve, stockerPiece } from "@/lib/ecarts/piece-storage";
import { MAX_TAILLE_PREUVE, validerNomPreuve } from "@/lib/ecarts/pieces";
const json = (body: unknown, status = 200) => NextResponse.json(body, {status, headers: {"Cache-Control": "private, no-store"}});
export async function POST(request: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const client = await createClient();
    const {user, response} = await requireApiUser(client); if (response) return response;
    const {id} = await params;
    const pieceId = request.headers.get("x-piece-id") ?? "";
    const auteur = request.headers.get("x-auteur-id"); const entreprise = request.headers.get("x-entreprise-id");
    const revisionTexte = request.headers.get("x-revision") ?? "";
    if (!/^[1-9][0-9]{0,9}$/.test(revisionTexte) || Number(revisionTexte) >= 2147483647) throw new PieceError("Révision invalide.", 400);
    const revision = Number(revisionTexte);
    let nom: string; try { nom = decodeURIComponent(request.headers.get("x-nom-fichier") ?? ""); } catch { throw new PieceError("Nom de fichier invalide.", 400); }
    const {data: profil, error: profilError} = await client.from("profiles").select("role,entreprise_id").eq("id",user.id).single();
    if (profilError || !profil) throw new PieceError("Vérification du profil indisponible.", 503);
    if (auteur !== user.id || entreprise !== profil.entreprise_id || !["administrateur","inspecteur"].includes(profil.role)) throw new PieceError("Compte ou rôle incompatible.", 403);
    const {data: ecart, error: ecartError} = await client.from("ecarts").select("chantier_id,statut").eq("id",id).single();
    if (ecartError || !ecart || !(await canAccessChantier(client,user.id,ecart.chantier_id))) throw new PieceError("Affectation actuelle requise.", 403);
    // UUID et nom bornés avant de lire les octets.
    try { validerNomPreuve(nom); } catch(e) { throw new PieceError((e as Error).message,400); }
    cheminPiece(entreprise!,id,pieceId,"0".repeat(64),"application/pdf");
    if (Number(request.headers.get("content-length")) > MAX_TAILLE_PREUVE) throw new PieceError("Le fichier dépasse 5 Mo.", 413);
    if (!(await checkRateLimit(`ecart-piece:${user.id}`,20,3600000))) throw new PieceError("Limite d’envoi atteinte ou compteur indisponible.", 429);
    if (!request.body) throw new PieceError("Fichier absent.", 400);
    const bytes = await lireFluxPreuve(request.body);
    const {mime,sha256} = identifierPreuve(nom,bytes);
    const chemin = cheminPiece(entreprise!,id,pieceId,sha256,mime);
    const {data: existant, error: lectureError} = await client.from("ecart_pieces").select("*").eq("id",pieceId).maybeSingle();
    if (lectureError) throw new PieceError("État de l’envoi indisponible.", 503, false);
    if (existant) {
      if (existant.ecart_id !== id || existant.auteur_id !== user.id || existant.revision_preparation !== revision || existant.nom !== nom || existant.mime !== mime || existant.taille !== bytes.length || existant.sha256 !== sha256) throw new PieceError("Identifiant de fichier déjà utilisé.", 409);
      return json({id:pieceId,nom,mime,taille:bytes.length,sha256,revision_preparation:revision});
    }
    const {data: suivi,error: suiviError} = await client.from("ecart_suivis").select("revision").eq("ecart_id",id).single();
    if (suiviError) throw new PieceError("Suivi indisponible.", 503);
    if (ecart.statut !== "en_cours_correction" || suivi?.revision !== revision) throw new PieceError("Le suivi a changé. Relisez-le puis sélectionnez à nouveau vos fichiers.", 409);
    const service = await createServiceClient();
    await stockerPiece(service,chemin,bytes,mime);
    const publication = await service.rpc("enregistrer_piece_ecart", {p_id:pieceId,p_ecart_id:id,p_acteur:user.id,p_revision:revision,p_nom:nom,p_mime:mime,p_taille:bytes.length,p_sha256:sha256});
    if (publication.error) {
      const code = publication.error.code;
      throw new PieceError(code === "40001" ? "Le suivi a changé. Relisez-le puis sélectionnez à nouveau ce fichier." : code === "42501" ? "Vos droits ont changé." : "Enregistrement non confirmé. Réessayez le même fichier.", code === "40001" ? 409 : code === "42501" ? 403 : 503, ["40001","42501","22023"].includes(code));
    }
    if (publication.data?.id !== pieceId || publication.data?.sha256 !== sha256) throw new PieceError("Enregistrement non confirmé. Réessayez le même fichier.", 503, false);
    return json({id:pieceId,nom,mime,taille:bytes.length,sha256,revision_preparation:revision});
  } catch (e) {
    if (e instanceof PieceError) return json({error:e.message,refusConfirme:e.refusConfirme},e.status);
    return json({error:"Résultat non confirmé. Réessayez le même fichier.",refusConfirme:false},503);
  }
}
