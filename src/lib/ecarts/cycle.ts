import type { PieceEcart } from "./pieces";
export type ActionCycle = "planifier" | "soumettre" | "valider" | "reprendre";
export interface SuiviEcart { ecart_id: string; revision: number; responsable: string; echeance: string; preuve: string | null; updated_at: string; soumission_id?: string | null }
export interface EvenementEcart { id: string; revision: number; auteur_nom: string; action: ActionCycle; statut_avant: string; statut_apres: string; responsable: string; echeance: string; commentaire: string | null; created_at: string; ecart_pieces?: PieceEcart[] }
export interface DemandeCycle { operationId: string; auteurId: string; entrepriseId: string; revision: number; action: ActionCycle; responsable: string; echeance: string; commentaire: string | null; pieces?: string[] }
export const ACTIONS_CYCLE: Record<ActionCycle, string> = { planifier: "Planification", soumettre: "Correction soumise", valider: "Correction validée", reprendre: "Reprise demandée" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validerDemandeCycle(value: unknown): DemandeCycle {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Demande invalide.");
  const v = value as Record<string, unknown>;
  if (![v.operationId,v.auteurId,v.entrepriseId].every(x => typeof x === "string" && UUID.test(x)) || !Number.isInteger(v.revision) || (v.revision as number) < 0 || (v.revision as number) >= 2147483647 || typeof v.action !== "string" || !Object.hasOwn(ACTIONS_CYCLE,v.action)) throw new Error("Rechargez le suivi avant de continuer.");
  if (typeof v.responsable !== "string" || v.responsable.trim().length < 2 || v.responsable.trim().length > 200) throw new Error("Indiquez un responsable (2 à 200 caractères).");
  if (typeof v.echeance !== "string" || !/^20\d{2}-\d{2}-\d{2}$|^2100-\d{2}-\d{2}$/.test(v.echeance) || !Number.isFinite(Date.parse(v.echeance)) || new Date(v.echeance).toISOString().slice(0,10) !== v.echeance) throw new Error("Indiquez une date valide entre 2000 et 2100.");
  if (v.commentaire !== null && typeof v.commentaire !== "string") throw new Error("Commentaire invalide.");
  const commentaire = typeof v.commentaire === "string" ? v.commentaire.trim() || null : null;
  const min = v.action === "soumettre" ? 20 : v.action === "planifier" ? 0 : 10;
  if ((commentaire?.length ?? 0) < min || (commentaire?.length ?? 0) > 5000 || (v.action === "planifier" && commentaire !== null)) throw new Error(`Le texte doit contenir entre ${min} et 5000 caractères.`);
  const pieces = v.pieces === undefined ? [] : v.pieces;
  if (!Array.isArray(pieces) || pieces.length>5 || pieces.some(x=>typeof x!=="string" || !UUID.test(x)) || new Set(pieces).size!==pieces.length || (v.action!=="soumettre" && pieces.length>0)) throw new Error("Sélection de pièces invalide.");
  return { ...(v.pieces === undefined ? {} : {pieces: [...pieces].sort()}), operationId: v.operationId as string, auteurId: v.auteurId as string, entrepriseId: v.entrepriseId as string, revision: v.revision as number, action: v.action as ActionCycle, responsable: v.responsable.trim(), echeance: v.echeance, commentaire };
}
export function jourSuisse(date = new Date()): string { return new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Zurich",year:"numeric",month:"2-digit",day:"2-digit"}).format(date); }
export function estEnRetard(statut: string, echeance: string | null | undefined, aujourdHui = jourSuisse()): boolean { return statut !== "corrige" && !!echeance && echeance < aujourdHui; }
