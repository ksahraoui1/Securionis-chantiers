"use client";
import { useEffect, useRef, useState } from "react";
import { assertOfflineScope, type OfflineScope } from "@/lib/offline/scope";
import { copierCycle, EcrivainCycle, lireCycles, type BrouillonCycle } from "@/lib/offline/cycle";

export function useCycleDraft(scope:OfflineScope,ecartId:string) {
 const [draft,setDraft]=useState<BrouillonCycle|null>(null);
 const current=useRef<BrouillonCycle|null>(null);
 const [copies,setCopies]=useState<BrouillonCycle[]>([]);
 const [status,setStatus]=useState(""); const [unsaved,setUnsaved]=useState(false);
 const [writer]=useState(()=>new EcrivainCycle(scope)); const sequence=useRef(0);
 useEffect(()=>{lireCycles(scope,ecartId).then(setCopies).catch(()=>{if(!scope.signal.aborted)setStatus("Lecture des copies locales impossible. Elles n’ont pas été effacées.");});},[scope,ecartId]);
 function initialiser(responsable:string,echeance:string,baseRevision:number) {
  if(current.current) return;
  const d:BrouillonCycle={id:crypto.randomUUID(),ecartId,auteurId:scope.userId,entrepriseId:scope.entrepriseId!,responsable,echeance,baseRevision,commentaire:"",pieces:[],pending:null,termine:false,updatedAt:new Date().toISOString()};
  current.current=d;setDraft(d);
 }
 function save(next:BrouillonCycle):Promise<void> {
  assertOfflineScope(scope);current.current=next;setDraft(next);setUnsaved(true);setStatus("Sauvegarde sur cet appareil…");
  const seq=++sequence.current;
  return writer.save(next).then(()=>{
   if(scope.signal.aborted) return;
   setCopies(old=>[next,...old.filter(d=>d.id!==next.id)]);
   if(seq===sequence.current){setUnsaved(false);setStatus("Brouillon conservé sur cet appareil.");}
  }).catch(e=>{if(!scope.signal.aborted && seq===sequence.current)setStatus("Sauvegarde locale impossible. Gardez cette page ouverte et réessayez avant de partir.");throw e;});
 }
 function update(patch:Partial<BrouillonCycle>):Promise<void> {
  if(!current.current)return Promise.reject(new Error("Chargez le suivi avant de saisir."));
  return save({...current.current,...patch,updatedAt:new Date().toISOString()});
 }
 function reprendre(copy:BrouillonCycle) {return save(copierCycle(copy));}
 return {draft,current,copies,status,unsaved,initialiser,update,reprendre};
}
