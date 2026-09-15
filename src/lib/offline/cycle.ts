import { assertOfflineScope, type OfflineScope } from "@/lib/offline/scope";
import { validerDemandeCycle, type DemandeCycle } from "@/lib/ecarts/cycle";
import { validerFichierPreuve, type PieceEcart } from "@/lib/ecarts/pieces";

export interface PieceBrouillon { id:string; file:File; revision:number; piece?:PieceEcart; erreur?:string; refuse?:boolean }
export interface BrouillonCycle {
 id:string; ecartId:string; auteurId:string; entrepriseId:string; updatedAt:string;
 responsable:string; echeance:string; commentaire:string; baseRevision:number;
 pieces:PieceBrouillon[]; pending:DemandeCycle|null; termine:boolean;
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Stored = Omit<BrouillonCycle,"pieces"> & {pieces:(Omit<PieceBrouillon,"file"> & {blob:Blob;nom:string})[]};
function validate(scope:OfflineScope,d:BrouillonCycle) {
 if(d.auteurId!==scope.userId || d.entrepriseId!==scope.entrepriseId || ![d.id,d.ecartId].every(x=>UUID.test(x)) || !Number.isInteger(d.baseRevision) || d.baseRevision<0 || typeof d.responsable!=="string" || d.responsable.length>200 || typeof d.echeance!=="string" || d.echeance.length>10 || typeof d.commentaire!=="string" || d.commentaire.length>5000 || !Array.isArray(d.pieces) || d.pieces.length>5) throw new Error("Brouillon invalide ou d’un autre compte.");
 for(const p of d.pieces) {if(!UUID.test(p.id) || !Number.isInteger(p.revision) || p.revision<0) throw new Error("Pièce locale invalide.");validerFichierPreuve(p.file);}
 if(d.pending) {
  const p=validerDemandeCycle(d.pending);
  if(p.auteurId!==scope.userId || p.entrepriseId!==scope.entrepriseId || p.revision!==d.baseRevision) throw new Error("Demande locale incohérente.");
 }
}
function open(scope:OfflineScope):Promise<IDBDatabase> {
 return new Promise((resolve,reject)=>{
  // Base indépendante : les anciennes files de visites restent en version 3.
  const r=indexedDB.open(`${scope.database}:corrections`,1);
  r.onupgradeneeded=()=>{const store=r.result.createObjectStore("brouillons",{keyPath:"id"});store.createIndex("ecartId","ecartId");};
  r.onsuccess=()=>{r.result.onversionchange=()=>r.result.close();resolve(r.result);};
  r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error("Stockage local occupé."));
 });
}
export async function sauverCycle(scope:OfflineScope,d:BrouillonCycle):Promise<void> {
 assertOfflineScope(scope);validate(scope,d);
 return writeAccepted(scope,d);
}
async function writeAccepted(scope:OfflineScope,d:BrouillonCycle):Promise<void> {
 const stored:Stored={...d,pieces:d.pieces.map(({file,...p})=>({...p,blob:file,nom:file.name}))};
 const db=await open(scope);
 await new Promise<void>((resolve,reject)=>{
  // Une écriture acceptée termine dans son périmètre initial même après verrouillage.
  const tx=db.transaction("brouillons","readwrite");
  tx.oncomplete=()=>{db.close();resolve();};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error??new Error("Sauvegarde locale interrompue."));};
  try {tx.objectStore("brouillons").put(stored);} catch(e) {tx.abort();db.close();reject(e);}
 });
}
export async function lireCycles(scope:OfflineScope,ecartId:string):Promise<BrouillonCycle[]> {
 assertOfflineScope(scope);const db=await open(scope);
 const records=await new Promise<Stored[]>((resolve,reject)=>{
  const tx=db.transaction("brouillons","readonly"),r=tx.objectStore("brouillons").index("ecartId").getAll(ecartId);
  tx.oncomplete=()=>{db.close();resolve(r.result);};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error);};
 });
 assertOfflineScope(scope);
 return records.map(r=>{const d:BrouillonCycle={...r,pieces:r.pieces.map(({blob,nom,...p})=>({...p,file:new File([blob],nom,{type:blob.type})}))};validate(scope,d);return d;}).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
}
/** Une reprise est une copie indépendante. Deux onglets ne remplacent jamais leurs saisies. */
export function copierCycle(d:BrouillonCycle):BrouillonCycle {
 return {...d,id:crypto.randomUUID(),updatedAt:new Date().toISOString(),pieces:d.pieces.map(p=>({...p})),pending:d.pending?{...d.pending,pieces:d.pending.pieces?[...d.pending.pieces]:undefined}:null};
}
/** Ordre des frappes et barrière durable avant tout envoi réseau. */
export class EcrivainCycle {
 private queue:Promise<void>=Promise.resolve();
 constructor(private scope:OfflineScope) {}
 save(d:BrouillonCycle):Promise<void> {
  assertOfflineScope(this.scope);validate(this.scope,d);
  // Capturer les métadonnées immédiatement ; les octets de File sont immuables.
  const snapshot={...d,pieces:d.pieces.map(p=>({...p})),pending:d.pending?{...d.pending,pieces:d.pending.pieces?[...d.pending.pieces]:undefined}:null};
  this.queue=this.queue.catch(()=>{}).then(()=>writeAccepted(this.scope,snapshot));
  return this.queue;
 }
}
