"use client";
import { useEffect, useState, type SetStateAction } from "react";
import { useOfflineScope } from "@/components/ui/offline-provider";
import { assertOfflineScope, type OfflineScope } from "@/lib/offline/scope";
import { useCycleDraft } from "./use-cycle-draft";
import { useRouter } from "next/navigation";
import { ACTIONS_CYCLE, estEnRetard, etapeCorrectionRapide, jourSuisse, textesCorrectionRapide, validerDemandeCycle, type ActionCycle, type DemandeCycle, type EvenementEcart, type SuiviEcart } from "@/lib/ecarts/cycle";
import { EcartStatusBadge } from "./ecart-status-badge";
import { EcartPieces, LiensPieces, televerserPiece, type PieceBrouillon } from "./ecart-pieces";
import { compressPhoto } from "@/lib/utils/photo-compress";
import { MAX_PIECES_PREUVE, MAX_TAILLE_PREUVE } from "@/lib/ecarts/pieces";
import type { PieceEcart } from "@/lib/ecarts/pieces";
interface Etat { ecart: {id:string;statut:string}; suivi:SuiviEcart|null; historique:EvenementEcart[]; piecesActuelles?:PieceEcart[]; peutModifier:boolean; auteurId:string;entrepriseId:string }
export function EcartCycle({ecartId,auteurId,nomAuteur}:{ecartId:string;auteurId:string;nomAuteur:string}) {
 const scope=useOfflineScope();
 return <CycleLocal key={`${scope.database}:${ecartId}`} ecartId={ecartId} auteurId={auteurId} nomAuteur={nomAuteur} scope={scope}/>;
}
function CycleLocal({ecartId,auteurId,nomAuteur,scope}:{ecartId:string;auteurId:string;nomAuteur:string;scope:OfflineScope}) {
 const router=useRouter();
 const local=useCycleDraft(scope,ecartId);
 const {draft}=local;
 const pieces=draft?.pieces??[];
 const responsable=draft?.responsable??"", echeance=draft?.echeance??"", commentaire=draft?.commentaire??"", pending=draft?.pending??null;
 const edit=(patch:Parameters<typeof local.update>[0])=>{void local.update(patch).catch(()=>{});};
 const setResponsable=(v:string)=>edit({responsable:v});
 const setEcheance=(v:string)=>edit({echeance:v});
 const setCommentaire=(v:string)=>edit({commentaire:v});
 const setPieces=(v:SetStateAction<PieceBrouillon[]>)=>edit({pieces:typeof v==="function"?v(local.current.current?.pieces??[]):v});
 const [envoiPiece,setEnvoiPiece]=useState(false);
 const [etat,setEtat]=useState<Etat|null>(null);
 const [busy,setBusy]=useState(false); const [conflit,setConflit]=useState(false); const [message,setMessage]=useState("");
 async function charger(initial=false):Promise<Etat> {
  const response=await fetch(`/api/ecarts/${ecartId}/statut`,{cache:"no-store",signal:scope.signal});
  const data=await response.json();
  if(!response.ok) throw new Error(data.error || "Suivi indisponible.");
  assertOfflineScope(scope);
  if(data.auteurId!==auteurId || data.entrepriseId!==scope.entrepriseId) throw new Error("Le compte a changé. Rechargez la page.");
  setEtat(data);
  local.initialiser(data.suivi?.responsable??"",data.suivi?.echeance??"",data.suivi?.revision??0);
  if(initial) await local.update({responsable:data.suivi?.responsable??"",echeance:data.suivi?.echeance??"",baseRevision:data.suivi?.revision??0});
  return data;
 }
 useEffect(()=>{ let active=true;
  fetch(`/api/ecarts/${ecartId}/statut`,{cache:"no-store",signal:scope.signal}).then(async r=>{const d=await r.json();if(!r.ok) throw new Error(d.error||"Suivi indisponible.");assertOfflineScope(scope);if(d.auteurId!==auteurId || d.entrepriseId!==scope.entrepriseId) throw new Error("Rechargez la page pour le compte actuel.");return d;}).then(d=>{if(active){setEtat(d);local.initialiser(d.suivi?.responsable??"",d.suivi?.echeance??"",d.suivi?.revision??0);}}).catch(e=>{if(active)setMessage(e.message);});
  return ()=>{active=false;};
 // Le périmètre et la NC sont immuables pour cette instance (clé du composant).
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[ecartId,auteurId,scope]);
 useEffect(()=>{const handler=(e:BeforeUnloadEvent)=>{if(local.unsaved)e.preventDefault();};window.addEventListener("beforeunload",handler);return()=>window.removeEventListener("beforeunload",handler);},[local.unsaved]);
/** Envoie une demande déjà conservée et relit le suivi. La demande reste en attente si le résultat est incertain. */
 async function executer(demande:DemandeCycle):Promise<Etat> {
  await local.update({pending:demande});assertOfflineScope(scope);
  const response=await fetch(`/api/ecarts/${ecartId}/statut`,{method:"PATCH",signal:scope.signal,headers:{"Content-Type":"application/json"},body:JSON.stringify(demande)});
  const data=await response.json();assertOfflineScope(scope);
  if(!response.ok) {if(data.refusConfirme===true){await local.update({pending:null});if(response.status===409)setConflit(true);}throw new Error(data.error||"Résultat non confirmé.");}
  if(data.operation_id!==demande.operationId || data.revision!==demande.revision+1) throw new Error("Résultat non confirmé. Réessayez la même demande.");
  const courant=local.current.current;
  await local.update({pending:null,baseRevision:data.revision,pieces:demande.action==="soumettre"?[]:courant?.pieces??[],commentaire:demande.action!=="planifier"?"":courant?.commentaire??"",termine:demande.action==="valider"});
  try {const relu=await charger(true);router.refresh();return relu;}
  catch {setConflit(true);throw new Error("Action enregistrée. La relecture est indisponible ; actualisez le suivi avant de continuer.");}
 }
 async function envoyer(action:ActionCycle, retry=false) {
  if(!etat || !draft || busy || envoiPiece || (!retry && (pending || conflit || draft.baseRevision!==(etat.suivi?.revision??0)))) return;
  if(action==="soumettre" && !retry && pieces.some(p=>!p.piece || p.revision!==etat.suivi?.revision)) {setMessage("Envoyez chaque pièce sélectionnée pour la révision actuelle, ou retirez-la avant de soumettre.");return;}
  let demande:DemandeCycle;
  try { demande=retry && pending ? pending : validerDemandeCycle({operationId:crypto.randomUUID(),auteurId,entrepriseId:etat.entrepriseId,revision:etat.suivi?.revision??0,action,responsable:action==="planifier"?responsable:etat.suivi?.responsable,echeance:action==="planifier"?echeance:etat.suivi?.echeance,commentaire:action==="planifier"?null:commentaire,pieces:action==="soumettre"?pieces.map(p=>p.id):[]}); } catch(e) {setMessage((e as Error).message);return;}
  setBusy(true);setMessage("");
  try {await executer(demande);setMessage("Action enregistrée dans l’historique.");}
  catch(e) {if(!scope.signal.aborted)setMessage((e as Error).message);} finally {if(!scope.signal.aborted)setBusy(false);}
 }
 /**
  * « C'est corrigé » : planifier si besoin, envoyer la photo, soumettre puis
  * valider — les mêmes demandes que le suivi détaillé, textes préremplis.
  * Interrompu (réseau, conflit), il reprend à l'étape où en est la NC.
  */
 async function corrigeRapide() {
  if(!etat || !draft || busy || envoiPiece || pending || conflit || draft.baseRevision!==(etat.suivi?.revision??0)) return;
  setBusy(true);setMessage("");
  try {
   let e=etat;
   const jour=jourSuisse();
   for(let garde=0;garde<3;garde++) {
    const action=etapeCorrectionRapide(e.ecart.statut);
    if(!action) break;
    const revision=e.suivi?.revision??0;
    let idsPieces:string[]=[];
    if(action==="soumettre") {
     // Une photo choisie avant la planification change de révision : nouvel identifiant.
     const aEnvoyer=(local.current.current?.pieces??[]).map(p=>p.revision===revision?p:{id:crypto.randomUUID(),file:p.file,revision});
     await local.update({pieces:aEnvoyer});
     for(const p of aEnvoyer) {
      if(p.piece) continue;
      setMessage("Envoi de la photo…");
      const piece=await televerserPiece({ecartId,auteurId,entrepriseId:e.entrepriseId,scope,piece:p});
      await local.update({pieces:(local.current.current?.pieces??[]).map(x=>x.id===p.id?{...x,piece,erreur:undefined}:x)});
     }
     idsPieces=aEnvoyer.map(p=>p.id);
    }
    const textes=textesCorrectionRapide(jour,local.current.current?.commentaire??"",idsPieces.length);
    const demande=validerDemandeCycle({operationId:crypto.randomUUID(),auteurId,entrepriseId:e.entrepriseId,revision,action,
     responsable:action==="planifier"?(e.suivi?.responsable||nomAuteur):e.suivi?.responsable,
     echeance:action==="planifier"?(e.suivi?.echeance||jour):e.suivi?.echeance,
     commentaire:action==="planifier"?null:action==="soumettre"?textes.preuve:textes.conclusion,
     pieces:idsPieces});
    setMessage(action==="planifier"?"Ouverture du suivi…":action==="soumettre"?"Enregistrement de la correction…":"Validation…");
    e=await executer(demande);
   }
   setMessage(e.ecart.statut==="corrige"?"NC marquée corrigée. Le détail est dans l’historique ci-dessous.":"Correction interrompue. Relancez « C’est corrigé » : les étapes déjà enregistrées ne sont pas refaites.");
  } catch(err) {
   if(!scope.signal.aborted)setMessage(`${(err as Error).message}\nLes étapes déjà enregistrées sont conservées : relancez « C’est corrigé » pour terminer.`);
  } finally {if(!scope.signal.aborted)setBusy(false);}
 }
 async function ajouterPhoto(fichier:File|undefined) {
  if(!fichier || !etat) return;
  try {
   if((local.current.current?.pieces.length??0)>=MAX_PIECES_PREUVE) throw new Error("Cinq pièces au maximum.");
   // Recompressée en JPEG : les photos d’appareil dépassent souvent 5 Mo.
   const blob=await compressPhoto(fichier);
   if(blob.size>MAX_TAILLE_PREUVE) throw new Error("Photo trop volumineuse, même compressée (5 Mo maximum).");
   const file=new File([blob],`photo-correction-${Date.now()}.jpg`,{type:"image/jpeg"});
   await local.update({pieces:[...(local.current.current?.pieces??[]),{id:crypto.randomUUID(),file,revision:etat.suivi?.revision??0}]});
  } catch(err) {setMessage((err as Error).message);}
 }
 async function relire() {setBusy(true);try{await charger(!etat);setConflit(false);setMessage("État actualisé. Vos textes sont conservés : comparez-les au suivi avant une nouvelle action.");}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 async function historiqueAncien() {
  if(!etat?.historique.length || busy) return;
  setBusy(true);
  try {
   const avant=etat.historique[etat.historique.length-1].revision;
   const response=await fetch(`/api/ecarts/${ecartId}/statut?avant=${avant}`,{cache:"no-store",signal:scope.signal});
   const data=await response.json();assertOfflineScope(scope);
   if(!response.ok || data.auteurId!==auteurId) throw new Error("Historique indisponible pour ce compte.");
   setEtat(current=>current?{...current,historique:[...current.historique,...data.historique.filter((e:EvenementEcart)=>!current.historique.some(h=>h.id===e.id))]}:current);
  } catch(e) {if(!scope.signal.aborted)setMessage((e as Error).message);} finally {if(!scope.signal.aborted)setBusy(false);}
 }
 const statut=etat?.ecart.statut; const planifiable=statut==="ouvert" || statut==="en_cours_correction";
 const baseChangee=!!draft && !!etat && draft.baseRevision!==(etat.suivi?.revision??0);
 const verrouille=busy||envoiPiece||!!pending||conflit||baseChangee||!draft;
 const bouton="min-h-[44px] rounded-lg px-4 py-2 text-sm font-medium bg-[#002855] text-white disabled:opacity-50";
 return <section className="bg-white rounded-xl border border-gray-300 p-4 space-y-4" aria-label="Cycle des actions correctives">
  <h2 className="text-lg font-semibold text-[#002855]">Cycle des actions correctives</h2>
  <p className="text-sm text-gray-600">Planifier → Corriger → Soumettre une preuve → Vérifier. Ce suivi est distinct du constat et des rapports archivés.</p>
  {local.status && <p role="status" className="text-sm text-gray-600">{local.status}</p>}
  {local.unsaved && <button className={bouton} disabled={busy||envoiPiece} onClick={()=>{void local.update({}).catch(()=>{});}}>Réessayer la sauvegarde locale</button>}
  {local.copies.filter(d=>d.id!==draft?.id && !d.termine).length>0 && <details className="rounded-lg border p-3"><summary>Copies conservées sur cet appareil</summary><p className="text-xs my-2">La reprise crée une copie indépendante. Comparez-la au suivi actuel ; aucun envoi automatique.</p><ul>{local.copies.filter(d=>d.id!==draft?.id && !d.termine).map(d=><li key={d.id} className="my-3 text-sm"><p>{new Date(d.updatedAt).toLocaleString("fr-CH")} · {d.responsable || "Sans responsable"} · {d.pieces.length} pièce(s){d.pending?" · Demande à confirmer":""}</p><p className="whitespace-pre-wrap break-words">{d.commentaire.slice(0,200)}</p><button className={bouton} disabled={busy||envoiPiece||!!pending||local.unsaved||!etat} onClick={()=>{void local.reprendre(d).then(()=>{setConflit(false);setMessage("Copie reprise. Vérifiez le suivi actuel avant de continuer.");}).catch(()=>{});}}>Reprendre cette copie</button></li>)}</ul></details>}
  {message && <p role="status" className="text-sm rounded-lg bg-blue-50 p-3 whitespace-pre-wrap">{message}</p>}
  {!etat && <button className={bouton} disabled={busy} onClick={relire}>Charger le suivi</button>}
  {etat && <>
   <div className="flex flex-wrap gap-2 items-center"><EcartStatusBadge statut={etat.ecart.statut}/>{estEnRetard(etat.ecart.statut,etat.suivi?.echeance) && <strong className="text-sm text-red-700">Échéance dépassée</strong>}</div>
   {etat.suivi && <dl className="text-sm space-y-2"><div><dt className="text-gray-500">Responsable enregistré</dt><dd>{etat.suivi.responsable}</dd></div><div><dt className="text-gray-500">Échéance</dt><dd>{etat.suivi.echeance.split("-").reverse().join(".")}</dd></div>{etat.suivi.preuve && <div><dt className="text-gray-500">Dernière preuve soumise</dt><dd className="whitespace-pre-wrap">{etat.suivi.preuve}</dd></div>}</dl>}
   <LiensPieces ecartId={ecartId} pieces={etat.piecesActuelles??[]}/>
   {statut==="corrige" && !etat.suivi && <p className="text-sm text-gray-600">Correction historique : aucune validation issue du nouveau cycle n’est enregistrée.</p>}
   {!etat.peutModifier && <p className="text-sm text-gray-600">Consultation seule. Un inspecteur affecté au chantier ou un administrateur peut agir.</p>}
   {etat.peutModifier && statut!=="corrige" && <>
    <div className="rounded-xl border-2 border-green-600 bg-green-50 p-4 space-y-3">
     <h3 className="font-semibold text-green-900">Correction rapide</h3>
     <p className="text-sm text-green-900">{statut==="a_verifier"?"Une correction a été soumise : confirmez-la si elle est constatée sur place.":"Ajoutez une photo si vous le souhaitez, puis confirmez. Le suivi (responsable, preuve, validation) est rempli et journalisé automatiquement."}</p>
     {statut!=="a_verifier" && <div className="flex flex-wrap items-center gap-2">
      <label className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-green-700 bg-white px-4 text-sm font-medium text-green-800 ${verrouille||pieces.length>=MAX_PIECES_PREUVE?"opacity-50 pointer-events-none":"cursor-pointer"}`}>
       <span translate="no" className="material-symbols-outlined text-lg">photo_camera</span>
       {pieces.length?"Ajouter une autre photo":"Ajouter une photo (facultatif)"}
       <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={verrouille||pieces.length>=MAX_PIECES_PREUVE} onChange={ev=>{void ajouterPhoto(ev.target.files?.[0]);ev.target.value="";}}/>
      </label>
      {pieces.length>0 && <span className="text-sm text-green-900">{pieces.length} photo{pieces.length>1?"s":""} prête{pieces.length>1?"s":""}</span>}
     </div>}
     {pieces.length>0 && statut!=="a_verifier" && <ul className="flex flex-wrap gap-2">{pieces.map(p=><li key={p.id}><button type="button" disabled={verrouille||!!p.piece} onClick={()=>setPieces(old=>old.filter(x=>x.id!==p.id))} className="min-h-[44px] rounded-lg border border-gray-300 bg-white px-3 text-xs disabled:opacity-50" title="Retirer cette photo">{p.piece?"Envoyée":"Retirer"} · {p.file.name.slice(0,24)}</button></li>)}</ul>}
     {statut!=="a_verifier" && <label className="block text-sm text-green-900">Précision (facultatif)<textarea rows={2} maxLength={4900} disabled={verrouille} placeholder="Ex. : garde-corps reposé, lisse intermédiaire ajoutée" className="mt-1 block w-full rounded-lg border border-gray-400 bg-white p-2" value={commentaire} onChange={e=>setCommentaire(e.target.value)}/></label>}
     <button type="button" disabled={verrouille} onClick={corrigeRapide} className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-lg bg-green-700 px-5 text-base font-semibold text-white hover:bg-green-800 disabled:opacity-50 sm:w-auto">
      <span translate="no" className="material-symbols-outlined">check_circle</span>
      {busy?"Enregistrement…":"C’est corrigé"}
     </button>
    </div>
    <details className="rounded-lg border border-gray-300 p-3 space-y-4">
    <summary className="min-h-[44px] cursor-pointer text-sm font-medium text-[#002855] flex items-center">Suivi détaillé : responsable, échéance, pièces, vérification ou reprise</summary>
    <div className="space-y-4 mt-3">
    <p className="text-xs text-gray-500">Textes et fichiers sont conservés sur cet appareil après confirmation de la sauvegarde. Retrouvez les copies depuis cette NC avec le même compte. Connexion requise pour charger le suivi et transmettre ; aucun envoi automatique. L’effacement des données du navigateur supprime les copies locales.</p>
    {planifiable && <fieldset disabled={verrouille} className="space-y-3">
     <legend className="font-medium text-sm">Planification</legend>
     <label className="block text-sm">Responsable (personne ou entreprise)<input className="mt-1 block w-full rounded-lg border border-gray-400 p-2" value={responsable} onChange={e=>setResponsable(e.target.value)} maxLength={200}/></label>
     <label className="block text-sm">Échéance<input type="date" min="2000-01-01" max="2100-12-31" className="mt-1 block w-full rounded-lg border border-gray-400 p-2" value={echeance} onChange={e=>setEcheance(e.target.value)}/></label>
     <button className={bouton} disabled={verrouille} onClick={()=>envoyer("planifier")}>Enregistrer la planification</button>
    </fieldset>}
    {((statut==="en_cours_correction" && !!etat.suivi) || pieces.length>0) && <EcartPieces demandeEnAttente={!!pending} scope={scope} avantEnvoi={()=>local.update({})} ecartId={ecartId} auteurId={auteurId} entrepriseId={etat.entrepriseId} revision={etat.suivi?.revision??0} pieces={pieces} setPieces={setPieces} disabled={verrouille} peutAjouter={statut==="en_cours_correction"} onActivite={setEnvoiPiece}/>}
    {(statut==="en_cours_correction" && !!etat.suivi || statut==="a_verifier") && <fieldset disabled={verrouille} className="space-y-3">
     <label className="block text-sm">{statut==="a_verifier" && pending?.action!=="soumettre"?"Conclusion de vérification ou motif de reprise (10 caractères minimum)":"Preuve écrite : travaux réalisés, contrôle effectué et références (20 caractères minimum)"}<textarea rows={5} maxLength={5000} className="mt-1 block w-full rounded-lg border border-gray-400 p-2" value={commentaire} onChange={e=>setCommentaire(e.target.value)}/></label>
     <div className="flex flex-wrap gap-2">{statut==="a_verifier"?<><button disabled={verrouille} className={bouton} onClick={()=>envoyer("valider")}>Valider la correction</button><button disabled={verrouille} className={bouton} onClick={()=>envoyer("reprendre")}>Demander une reprise</button></>:<button disabled={verrouille || pieces.some(p=>!p.piece || p.revision!==etat.suivi?.revision) || responsable!==etat.suivi?.responsable || echeance!==etat.suivi?.echeance} className={bouton} onClick={()=>envoyer("soumettre")}>Soumettre à vérification</button>}</div>
     {statut==="en_cours_correction" && (responsable!==etat.suivi?.responsable || echeance!==etat.suivi?.echeance) && <p className="text-sm text-amber-800">Enregistrez la planification modifiée avant de soumettre la preuve.</p>}
    </fieldset>}
    </div>
    </details>
   </>}
   {pending && <div className="space-y-2"><p className="text-sm text-amber-800">Le résultat reste à confirmer. La demande conservée permet de réessayer après réouverture avec le même identifiant et le même contenu.</p><button className={bouton} disabled={busy} onClick={()=>envoyer(pending.action,true)}>Vérifier / réessayer la même demande</button></div>}
   {baseChangee && !pending && <div className="space-y-2"><p className="text-sm text-amber-800">Cette copie vient d’une autre révision. Comparez vos textes au responsable, à l’échéance et aux preuves enregistrées ci-dessus. Les pièces d’une ancienne révision devront être sélectionnées à nouveau.</p><button className={bouton} disabled={busy||envoiPiece} onClick={()=>{void local.update({baseRevision:etat.suivi?.revision??0}).then(()=>setConflit(false)).catch(()=>{});}}>J’ai comparé : travailler sur cette révision</button></div>}
   {conflit && <button className={bouton} disabled={busy} onClick={relire}>Relire l’état actuel en conservant mes textes</button>}
   <h3 className="font-semibold text-[#002855]">Historique ({etat.suivi?.revision??0})</h3>
   {etat.historique.length===0?<p className="text-sm text-gray-500">Aucune action enregistrée dans ce cycle.</p>:<ol className="space-y-3">{etat.historique.map(e=><li key={e.id} className="border-l-2 border-blue-200 pl-3 text-sm space-y-1"><p className="font-medium">{ACTIONS_CYCLE[e.action]} · {e.auteur_nom}</p><p className="text-xs text-gray-500">{new Date(e.created_at).toLocaleString("fr-CH",{timeZone:"Europe/Zurich"})}</p><p>{e.responsable} · échéance {e.echeance.split("-").reverse().join(".")}</p><EcartStatusBadge statut={e.statut_apres}/>{e.commentaire && <p className="whitespace-pre-wrap">{e.commentaire}</p>}<LiensPieces ecartId={ecartId} pieces={e.ecart_pieces??[]}/></li>)}</ol>}
   {etat.historique.length>0 && etat.historique[etat.historique.length-1].revision>1 && <button className={bouton} disabled={busy} onClick={historiqueAncien}>Voir les actions plus anciennes</button>}
  </>}
 </section>;
}
