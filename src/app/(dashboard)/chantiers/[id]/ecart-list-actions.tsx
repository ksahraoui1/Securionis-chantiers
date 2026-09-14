import { EcartList } from "@/components/ecart/ecart-list";
import type { Tables } from "@/types/database";
import type { SuiviEcart } from "@/lib/ecarts/cycle";
export function EcartListWithActions(props:{ecarts:Tables<"ecarts">[];chantierId:string;suivis:SuiviEcart[];suiviIndisponible:boolean;aujourdHui:string}) { return <EcartList {...props}/>; }
