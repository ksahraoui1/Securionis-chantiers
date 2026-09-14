"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ACTIONS_CYCLE, estEnRetard, validerDemandeCycle, type ActionCycle, type DemandeCycle, type EvenementEcart, type SuiviEcart } from "@/lib/ecarts/cycle";
import { EcartStatusBadge } from "./ecart-status-badge";
import { EcartPieces, LiensPieces, type PieceBrouillon } from "./ecart-pieces";
import type { PieceEcart } from "@/lib/ecarts/pieces";
interface Etat { ecart: {id:string;statut:string}; suivi:SuiviEcart|null; historique:EvenementEcart[]; piecesActuelles?:PieceEcart[]; peutModifier:boolean; auteurId:string;entrepriseId:string }
export function EcartCycle({ecartId,auteurId}:{ecartId:string;auteurId:string}) {
 const router=useRouter();
 const [pieces,setPieces]=useState<PieceBrouillon[]>([]);
 const [envoiPiece,setEnvoiPiece]=useState(false);
 const [etat,setEtat]=useState<Etat|null>(null);
 const [responsable,setResponsable]=useState(""); const [echeance,setEcheance]=useState(""); const [commentaire,setCommentaire]=useState("");
 const [pending,setPending]=useState<DemandeCycle|null>(null); const [busy,setBusy]=useState(false); const [conflit,setConflit]=useState(false); const [message,setMessage]=useState("");
 async function charger(initial=false) {
  const response=await fetch(`/api/ecarts/${ecartId}/statut`,{cache:"no-store"});
  const data=await response.json();
  if(!response.ok) throw new Error(data.error || "Suivi indisponible.");
  if(data.auteurId!==auteurId) throw new Error("Le compte a changé. Rechargez la page.");
  setEtat(data);
  if(initial) {setResponsable(data.suivi?.responsable??"");setEcheance(data.suivi?.echeance??"");}
 }
 useEffect(()=>{ let active=true;
  fetch(`/api/ecarts/${ecartId}/statut`,{cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok) throw new Error(d.error||"Suivi indisponible.");if(d.auteurId!==auteurId) throw new Error("Rechargez la page pour le compte actuel.");return d;}).then(d=>{if(active){setEtat(d);setResponsable(d.suivi?.responsable??"");setEcheance(d.suivi?.echeance??"");}}).catch(e=>{if(active)setMessage(e.message);});
  return ()=>{active=false;};
 },[ecartId,auteurId]);
 useEffect(()=>{const handler=(e:BeforeUnloadEvent)=>{if(pending || pieces.length || commentaire || (etat && (responsable!==(etat.suivi?.responsable??"") || echeance!==(etat.suivi?.echeance??"")))){e.preventDefault();}};window.addEventListener("beforeunload",handler);return()=>window.removeEventListener("beforeunload",handler);},[pending,pieces.length,commentaire,responsable,echeance,etat]);
 async function envoyer(action:ActionCycle, retry=false) {
  if(!etat || busy || envoiPiece) return;
  if(action==="soumettre" && !retry && pieces.some(p=>!p.piece || p.revision!==etat.suivi?.revision)) {setMessage("Envoyez chaque pièce sélectionnée pour la révision actuelle, ou retirez-la avant de soumettre.");return;}
  let demande:DemandeCycle;
  try { demande=retry && pending ? pending : validerDemandeCycle({operationId:crypto.randomUUID(),auteurId,entrepriseId:etat.entrepriseId,revision:etat.suivi?.revision??0,action,responsable:action==="planifier"?responsable:etat.suivi?.responsable,echeance:action==="planifier"?echeance:etat.suivi?.echeance,commentaire:action==="planifier"?null:commentaire,pieces:action==="soumettre"?pieces.map(p=>p.id):[]}); } catch(e) {setMessage((e as Error).message);return;}
  setPending(demande);setBusy(true);setMessage("");
  try {
   const response=await fetch(`/api/ecarts/${ecartId}/statut`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(demande)});
   const data=await response.json();
   if(!response.ok) {if(data.refusConfirme===true){setPending(null);if(response.status===409)setConflit(true);}throw new Error(data.error||"Résultat non confirmé.");}
   if(data.operation_id!==demande.operationId || data.revision!==demande.revision+1) throw new Error("Résultat non confirmé. Réessayez la même demande.");
   setPending(null);if(demande.action==="soumettre")setPieces([]);if(demande.action!=="planifier")setCommentaire("");setMessage("Action enregistrée dans l’historique.");
   try {await charger(true);router.refresh();} catch {setConflit(true);setMessage("Action enregistrée. La relecture est indisponible ; actualisez le suivi avant de continuer.");}
  } catch(e) {setMessage((e as Error).message);} finally {setBusy(false);}
 }
 async function relire() {setBusy(true);try{await charger(!etat);setConflit(false);setMessage("État actualisé. Vos textes sont conservés : comparez-les au suivi avant une nouvelle action.");}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 async function historiqueAncien() {
  if(!etat?.historique.length || busy) return;
  setBusy(true);
  try {
   const avant=etat.historique[etat.historique.length-1].revision;
   const response=await fetch(`/api/ecarts/${ecartId}/statut?avant=${avant}`,{cache:"no-store"});
   const data=await response.json();
   if(!response.ok || data.auteurId!==auteurId) throw new Error("Historique indisponible pour ce compte.");
   setEtat(current=>current?{...current,historique:[...current.historique,...data.historique.filter((e:EvenementEcart)=>!current.historique.some(h=>h.id===e.id))]}:current);
  } catch(e) {setMessage((e as Error).message);} finally {setBusy(false);}
 }
 const statut=etat?.ecart.statut; const planifiable=statut==="ouvert" || statut==="en_cours_correction";
 const verrouille=busy||envoiPiece||!!pending||conflit;
 const bouton="min-h-[44px] rounded-lg px-4 py-2 text-sm font-medium bg-[#002855] text-white disabled:opacity-50";
 return <section className="bg-white rounded-xl border border-gray-300 p-4 space-y-4" aria-label="Cycle des actions correctives">
  <h2 className="text-lg font-semibold text-[#002855]">Cycle des actions correctives</h2>
  <p className="text-sm text-gray-600">Planifier → Corriger → Soumettre une preuve → Vérifier. Ce suivi est distinct du constat et des rapports archivés.</p>
  {message && <p role="status" className="text-sm rounded-lg bg-blue-50 p-3 whitespace-pre-wrap">{message}</p>}
  {!etat && <button className={bouton} disabled={busy} onClick={relire}>Charger le suivi</button>}
  {etat && <>
   <div className="flex flex-wrap gap-2 items-center"><EcartStatusBadge statut={etat.ecart.statut}/>{estEnRetard(etat.ecart.statut,etat.suivi?.echeance) && <strong className="text-sm text-red-700">Échéance dépassée</strong>}</div>
   {etat.suivi && <dl className="text-sm space-y-2"><div><dt className="text-gray-500">Responsable enregistré</dt><dd>{etat.suivi.responsable}</dd></div><div><dt className="text-gray-500">Échéance</dt><dd>{etat.suivi.echeance.split("-").reverse().join(".")}</dd></div>{etat.suivi.preuve && <div><dt className="text-gray-500">Dernière preuve soumise</dt><dd className="whitespace-pre-wrap">{etat.suivi.preuve}</dd></div>}</dl>}
   <LiensPieces ecartId={ecartId} pieces={etat.piecesActuelles??[]}/>
   {statut==="corrige" && !etat.suivi && <p className="text-sm text-gray-600">Correction historique : aucune validation issue du nouveau cycle n’est enregistrée.</p>}
   {!etat.peutModifier && <p className="text-sm text-gray-600">Consultation seule. Un inspecteur affecté au chantier ou un administrateur peut agir.</p>}
   {etat.peutModifier && statut!=="corrige" && <>
    <p className="text-xs text-gray-500">Connexion requise. Les textes non enregistrés restent dans cette page. Aucun rappel n’est envoyé automatiquement.</p>
    {planifiable && <fieldset disabled={verrouille} className="space-y-3">
     <legend className="font-medium text-sm">Planification</legend>
     <label className="block text-sm">Responsable (personne ou entreprise)<input className="mt-1 block w-full rounded-lg border border-gray-400 p-2" value={responsable} onChange={e=>setResponsable(e.target.value)} maxLength={200}/></label>
     <label className="block text-sm">Échéance<input type="date" min="2000-01-01" max="2100-12-31" className="mt-1 block w-full rounded-lg border border-gray-400 p-2" value={echeance} onChange={e=>setEcheance(e.target.value)}/></label>
     <button className={bouton} disabled={verrouille} onClick={()=>envoyer("planifier")}>Enregistrer la planification</button>
    </fieldset>}
    {((statut==="en_cours_correction" && !!etat.suivi) || pieces.length>0) && <EcartPieces ecartId={ecartId} auteurId={auteurId} entrepriseId={etat.entrepriseId} revision={etat.suivi?.revision??0} pieces={pieces} setPieces={setPieces} disabled={verrouille} peutAjouter={statut==="en_cours_correction"} onActivite={setEnvoiPiece}/>}
    {(statut==="en_cours_correction" && !!etat.suivi || statut==="a_verifier") && <fieldset disabled={verrouille} className="space-y-3">
     <label className="block text-sm">{statut==="a_verifier"?"Conclusion de vérification ou motif de reprise (10 caractères minimum)":"Preuve écrite : travaux réalisés, contrôle effectué et références (20 caractères minimum)"}<textarea rows={5} maxLength={5000} className="mt-1 block w-full rounded-lg border border-gray-400 p-2" value={commentaire} onChange={e=>setCommentaire(e.target.value)}/></label>
     <div className="flex flex-wrap gap-2">{statut==="a_verifier"?<><button disabled={verrouille} className={bouton} onClick={()=>envoyer("valider")}>Valider la correction</button><button disabled={verrouille} className={bouton} onClick={()=>envoyer("reprendre")}>Demander une reprise</button></>:<button disabled={verrouille || pieces.some(p=>!p.piece || p.revision!==etat.suivi?.revision) || responsable!==etat.suivi?.responsable || echeance!==etat.suivi?.echeance} className={bouton} onClick={()=>envoyer("soumettre")}>Soumettre à vérification</button>}</div>
     {statut==="en_cours_correction" && (responsable!==etat.suivi?.responsable || echeance!==etat.suivi?.echeance) && <p className="text-sm text-amber-800">Enregistrez la planification modifiée avant de soumettre la preuve.</p>}
    </fieldset>}
   </>}
   {pending && <div className="space-y-2"><p className="text-sm text-amber-800">Le résultat reste à confirmer. Gardez cette page ouverte ; la reprise renvoie exactement la même demande.</p><button className={bouton} disabled={busy} onClick={()=>envoyer(pending.action,true)}>Vérifier / réessayer la même demande</button></div>}
   {conflit && <button className={bouton} disabled={busy} onClick={relire}>Relire l’état actuel en conservant mes textes</button>}
   <h3 className="font-semibold text-[#002855]">Historique ({etat.suivi?.revision??0})</h3>
   {etat.historique.length===0?<p className="text-sm text-gray-500">Aucune action enregistrée dans ce cycle.</p>:<ol className="space-y-3">{etat.historique.map(e=><li key={e.id} className="border-l-2 border-blue-200 pl-3 text-sm space-y-1"><p className="font-medium">{ACTIONS_CYCLE[e.action]} · {e.auteur_nom}</p><p className="text-xs text-gray-500">{new Date(e.created_at).toLocaleString("fr-CH",{timeZone:"Europe/Zurich"})}</p><p>{e.responsable} · échéance {e.echeance.split("-").reverse().join(".")}</p><EcartStatusBadge statut={e.statut_apres}/>{e.commentaire && <p className="whitespace-pre-wrap">{e.commentaire}</p>}<LiensPieces ecartId={ecartId} pieces={e.ecart_pieces??[]}/></li>)}</ol>}
   {etat.historique.length>0 && etat.historique[etat.historique.length-1].revision>1 && <button className={bouton} disabled={busy} onClick={historiqueAncien}>Voir les actions plus anciennes</button>}
  </>}
 </section>;
}
