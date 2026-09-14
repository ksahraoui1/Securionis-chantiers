"use client";
import { useState } from "react";
import Link from "next/link";
import { EcartStatusBadge } from "./ecart-status-badge";
import { estEnRetard, jourSuisse, type SuiviEcart } from "@/lib/ecarts/cycle";
import type { Tables } from "@/types/database";
interface Props { ecarts:Tables<"ecarts">[]; chantierId?:string; suivis?:SuiviEcart[]; suiviIndisponible?:boolean; aujourdHui?:string }
export function EcartList({ecarts,chantierId,suivis=[],suiviIndisponible=false,aujourdHui=jourSuisse()}:Props) {
 const [filtre,setFiltre]=useState("actives");
 const parId=new Map(suivis.map(s=>[s.ecart_id,s]));
 const retard=(e:Tables<"ecarts">)=>estEnRetard(e.statut,parId.get(e.id)?.echeance,aujourdHui);
 const visibles=ecarts.filter(e=>filtre==="corrigees"?e.statut==="corrige":filtre==="retard"?retard(e):filtre==="a_verifier"?e.statut==="a_verifier":e.statut!=="corrige").sort((a,b)=>(parId.get(a.id)?.echeance??"9999").localeCompare(parId.get(b.id)?.echeance??"9999"));
 return <div className="space-y-3">
  <label className="block text-sm font-medium">Afficher<select className="block mt-1 border border-gray-400 rounded-lg p-2 min-h-[44px] w-full" value={filtre} onChange={e=>setFiltre(e.target.value)}>
   <option value="actives">NC actives ({ecarts.filter(e=>e.statut!=="corrige").length})</option><option value="a_verifier">À vérifier ({ecarts.filter(e=>e.statut==="a_verifier").length})</option><option value="retard" disabled={suiviIndisponible}>Échéance dépassée ({ecarts.filter(retard).length})</option><option value="corrigees">Corrigées ({ecarts.filter(e=>e.statut==="corrige").length})</option>
  </select></label>
  {suiviIndisponible && <p role="status" className="text-sm text-amber-800">Les échéances sont momentanément indisponibles. Rechargez la page pour consulter les retards.</p>}
  {!visibles.length && <p className="text-sm text-gray-500 py-4">Aucune non-conformité dans cette sélection.</p>}
  {visibles.map(ecart=><article key={ecart.id} className="bg-white rounded-lg border border-gray-400 p-4 space-y-2">
   <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-bold text-[#002855]">NC #{ecart.numero}{ecart.type==="ecart_plan"?" · Écart de plan":""}</p>{ecart.titre && <p className="text-sm font-semibold mt-1">{ecart.titre}</p>}</div><EcartStatusBadge statut={ecart.statut}/></div>
   <p className="text-sm whitespace-pre-wrap">{ecart.description}</p>
   {ecart.delai && <p className="text-xs text-gray-500">Délai du constat : {ecart.delai}</p>}
   {parId.has(ecart.id)?<p className={`text-sm ${retard(ecart)?"font-medium text-red-700":"text-gray-600"}`}>{parId.get(ecart.id)!.responsable} · {retard(ecart)?"Échéance dépassée : ":"Échéance : "}{parId.get(ecart.id)!.echeance.split("-").reverse().join(".")}</p>:!suiviIndisponible && <p className="text-xs text-gray-500">{ecart.statut==="corrige"?"Correction historique":"Responsable et échéance à planifier"}</p>}
   {chantierId && <Link href={`/chantiers/${chantierId}/nc/${ecart.id}`} className="inline-flex min-h-[44px] items-center rounded-lg px-3 py-2 text-sm text-[#002855] bg-blue-50 font-medium">{ecart.statut==="corrige"?"Consulter le détail et l’historique":"Ouvrir le suivi de correction"}</Link>}
  </article>)}
 </div>;
}
