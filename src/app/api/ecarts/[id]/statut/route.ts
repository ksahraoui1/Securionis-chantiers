import { requireApiUser } from "@/lib/supabase/require-api-user";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { validerDemandeCycle } from "@/lib/ecarts/cycle";
const json = (body: unknown, status = 200) => NextResponse.json(body, {status, headers:{"Cache-Control":"private, no-store"}});
export async function GET(request: NextRequest, {params}:{params:Promise<{id:string}>}) {
  try {
    const client = await createClient();
    const { user, response } = await requireApiUser(client); if (response) return response;
    const {id} = await params;
    const avant=request.nextUrl.searchParams.get("avant");
    if(avant!==null && (!/^[1-9][0-9]{0,9}$/.test(avant) || Number(avant)>2147483647)) return json({error:"Page invalide."},400);
    let historiqueQuery=client.from("ecart_evenements").select("id,revision,auteur_nom,action,statut_avant,statut_apres,responsable,echeance,commentaire,created_at").eq("ecart_id",id).order("revision",{ascending:false}).limit(50);
    if(avant!==null) historiqueQuery=historiqueQuery.lt("revision",Number(avant));
    const {data: ecart,error} = await client.from("ecarts").select("id,statut,chantier_id").eq("id",id).single();
    if (error || !ecart) return json({error:"Non-conformité inaccessible."},404);
    const [{data:suivi,error:e1},{data:historique,error:e2},{data:profil,error:e3}] = await Promise.all([
      client.from("ecart_suivis").select("*").eq("ecart_id",id).maybeSingle(),
      historiqueQuery,
      client.from("profiles").select("id,entreprise_id,role").eq("id",user.id).single(),
    ]);
    if (e1 || e2 || e3 || !profil) return json({error:"Suivi indisponible."},503);
    let peutModifier = profil.role === "administrateur";
    if (profil.role === "inspecteur") {
      const {data, error: affectationError} = await client.from("chantier_inspecteurs").select("id").eq("chantier_id",ecart.chantier_id).eq("inspecteur_id",user.id).maybeSingle();
      if (affectationError) return json({error:"Droits indisponibles."},503);
      peutModifier=!!data;
    }
    return json({ecart,suivi,historique,peutModifier,auteurId:profil.id,entrepriseId:profil.entreprise_id});
  } catch { return json({error:"Suivi indisponible."},503); }
}
export async function PATCH(request: NextRequest, {params}:{params:Promise<{id:string}>}) {
  try {
    const client = await createClient();
    const {user,response}=await requireApiUser(client); if(response) return response;
    const {id}=await params;
    if (!(await checkRateLimit(`ecart-statut:${user.id}`,60,3600000))) return json({error:"Limite atteinte ou compteur indisponible. Réessayez plus tard.",refusConfirme:true},429);
    // Limite pendant la lecture, y compris sans Content-Length.
    const reader=request.body?.getReader(); if(!reader) return json({error:"Demande vide.",refusConfirme:true},400);
    const chunks:Uint8Array[]=[]; let size=0;
    while(true) { const {done,value}=await reader.read(); if(done) break; size+=value.byteLength; if(size>24000) {await reader.cancel();return json({error:"Demande trop volumineuse.",refusConfirme:true},413);} chunks.push(value); }
    let demande;
    try { demande=validerDemandeCycle(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch(error) {return json({error:error instanceof Error?error.message:"Demande invalide.",refusConfirme:true},400);}
    const {data:profil,error:profilError}=await client.from("profiles").select("entreprise_id").eq("id",user.id).single();
    if(profilError || !profil) return json({error:"Vérification du compte indisponible.",refusConfirme:false},503);
    if(demande.auteurId!==user.id || demande.entrepriseId!==profil.entreprise_id) return json({error:"Le compte a changé. Rechargez la page.",refusConfirme:true},403);
    const {data,error}=await client.rpc("avancer_cycle_ecart",{p_ecart_id:id,p_operation_id:demande.operationId,p_revision:demande.revision,p_action:demande.action,p_responsable:demande.responsable,p_echeance:demande.echeance,p_commentaire:demande.commentaire});
    if(error) {
      if(error.code==="40001") return json({error:"Le suivi a changé. Relisez l’état actuel avant une nouvelle action.",refusConfirme:true},409);
      if(error.code==="42501") return json({error:"Rôle ou affectation insuffisants.",refusConfirme:true},403);
      if(["22023","22007","22008","22P02"].includes(error.code)) return json({error:"Action incompatible avec le suivi actuel ou champs incomplets.",refusConfirme:true},400);
      return json({error:"Résultat non confirmé. Réessayez la même demande.",refusConfirme:false},503);
    }
    if(data?.operation_id!==demande.operationId || data?.revision!==demande.revision+1) return json({error:"Résultat non confirmé. Réessayez la même demande.",refusConfirme:false},503);
    return json(data);
  } catch { return json({error:"Résultat non confirmé. Réessayez la même demande.",refusConfirme:false},503); }
}
