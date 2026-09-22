"use client";
import { useState, type Dispatch, type SetStateAction } from "react";
import { assertOfflineScope, type OfflineScope } from "@/lib/offline/scope";
import type { PieceBrouillon } from "@/lib/offline/cycle";
export type { PieceBrouillon } from "@/lib/offline/cycle";
import { MAX_PIECES_PREUVE, validerFichierPreuve, type PieceEcart } from "@/lib/ecarts/pieces";
/** Refus confirmé par le serveur : réessayer le même fichier ne changerait rien. */
export class RefusPiece extends Error {}
/**
 * Envoie une pièce déjà conservée dans le brouillon. Même identifiant et même
 * révision au rejeu : l’enregistrement côté serveur est idempotent.
 */
export async function televerserPiece({ecartId,auteurId,entrepriseId,scope,piece:p}:{ecartId:string;auteurId:string;entrepriseId:string;scope:OfflineScope;piece:PieceBrouillon}):Promise<PieceEcart> {
 assertOfflineScope(scope);
 const response=await fetch(`/api/ecarts/${ecartId}/pieces`,{method:"POST",signal:scope.signal,headers:{"Content-Type":"application/octet-stream","X-Piece-Id":p.id,"X-Auteur-Id":auteurId,"X-Entreprise-Id":entrepriseId,"X-Revision":String(p.revision),"X-Nom-Fichier":encodeURIComponent(p.file.name)},body:p.file});
 let data;
 try {data=await response.json();} catch {throw new Error("Réponse non confirmée. Réessayez le même fichier.");}
 assertOfflineScope(scope);
 if(!response.ok) {
  const message=data.error||"Envoi non confirmé.";
  throw data.refusConfirme===true?new RefusPiece(message):new Error(message);
 }
 if(data.id!==p.id || data.revision_preparation!==p.revision || data.taille!==p.file.size) throw new Error("Enregistrement non confirmé. Réessayez le même fichier.");
 return data as PieceEcart;
}
export function LiensPieces({pieces,ecartId}:{pieces:PieceEcart[];ecartId:string}) {
  if (!pieces.length) return null;
  return <ul className="space-y-2 mt-2" aria-label="Pièces de preuve">{pieces.map(p=><li key={p.id} className="rounded-lg border border-gray-200 p-2">
    {p.mime.startsWith("image/") && (
      // L’image privée exige les cookies du navigateur et ne passe pas par le cache de l’optimiseur.
      // eslint-disable-next-line @next/next/no-img-element
      <img loading="lazy" src={`/api/ecarts/${ecartId}/pieces/${p.id}?apercu=1`} alt={`Preuve : ${p.nom}`} className="max-h-40 max-w-full rounded object-contain mb-2"/>
    )}
    <a className="inline-flex min-h-[44px] items-center text-sm text-blue-700 underline break-all" href={`/api/ecarts/${ecartId}/pieces/${p.id}`} download>{p.nom} · {(p.taille/1024/1024).toFixed(2)} Mo</a>
  </li>)}</ul>;
}
export function EcartPieces({ecartId,auteurId,entrepriseId,revision,pieces,setPieces,disabled,peutAjouter,onActivite,scope,avantEnvoi,demandeEnAttente}:{demandeEnAttente:boolean;scope:OfflineScope;avantEnvoi:()=>Promise<void>;ecartId:string;auteurId:string;entrepriseId:string;revision:number;pieces:PieceBrouillon[];setPieces:Dispatch<SetStateAction<PieceBrouillon[]>>;disabled:boolean;peutAjouter:boolean;onActivite:(active:boolean)=>void}) {
 const [erreur,setErreur]=useState("");
 function ajouter(files:File[]) {
  try {
   if (files.length+pieces.length>MAX_PIECES_PREUVE) throw new Error("Cinq pièces au maximum par soumission.");
   files.forEach(validerFichierPreuve);
   setPieces(old=>[...old,...files.map(file=>({id:crypto.randomUUID(),file,revision}))]);setErreur("");
  } catch(e) {setErreur((e as Error).message);}
 }
 async function envoyer(p:PieceBrouillon) {
  onActivite(true);setErreur("");
  try {
   await avantEnvoi();
   const piece=await televerserPiece({ecartId,auteurId,entrepriseId,scope,piece:p});
   setPieces(old=>old.map(x=>x.id===p.id?{...x,piece,erreur:undefined,refuse:false}:x));
  } catch(e) {if(!scope.signal.aborted)setPieces(old=>old.map(x=>x.id===p.id?{...x,erreur:(e as Error).message,refuse:e instanceof RefusPiece}:x));}
  finally {onActivite(false);}
 }
 return <fieldset disabled={disabled} className="space-y-3 rounded-lg border border-gray-300 p-3">
  <legend className="text-sm font-medium">Pièces de preuve facultatives ({pieces.length}/{MAX_PIECES_PREUVE})</legend>
  <p className="text-xs text-gray-600">PDF, JPEG ou PNG · 5 Mo par fichier. Envoyez les pièces, puis soumettez la correction pour les rattacher à la preuve écrite.</p>
  {peutAjouter && <label className="block text-sm">Ajouter des pièces<input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="block w-full mt-2 text-sm" onChange={e=>{ajouter(Array.from(e.target.files??[]));e.target.value="";}}/></label>}
  {erreur && <p role="status" className="text-sm text-red-700">{erreur}</p>}
  <ul className="space-y-3">{pieces.map(p=><li key={p.id} className="text-sm space-y-1">
   <p className="break-all font-medium">{p.file.name}</p>
   {demandeEnAttente?<p className="text-gray-600">Pièce conservée dans la demande à confirmer.</p>:p.revision!==revision?<p className="text-amber-800">Le suivi a changé. Retirez cette sélection puis choisissez à nouveau le fichier.</p>:p.piece?<p className="text-green-700">Pièce prête pour la soumission.</p>:p.erreur?<p role="status" className="text-amber-800">{p.erreur}</p>:<p className="text-gray-500">À envoyer.</p>}
   <div className="flex flex-wrap gap-2">{!p.piece && !p.refuse && p.revision===revision && peutAjouter && <button type="button" className="min-h-[44px] rounded-lg bg-blue-50 px-3 text-[#002855]" onClick={()=>envoyer(p)} disabled={disabled}>{p.erreur?"Réessayer le même fichier":"Envoyer cette pièce"}</button>}
   <button type="button" className="min-h-[44px] rounded-lg px-3 border border-gray-300" disabled={disabled} onClick={()=>setPieces(old=>old.filter(x=>x.id!==p.id))}>Retirer de la sélection</button></div>
  </li>)}</ul>
 </fieldset>;
}
