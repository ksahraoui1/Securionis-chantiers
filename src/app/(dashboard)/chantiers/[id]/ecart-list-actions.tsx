"use client";

import { EcartList } from "@/components/ecart/ecart-list";
import type { Tables } from "@/types/database";

interface EcartListWithActionsProps {
  ecarts: Tables<"ecarts">[];
}

export function EcartListWithActions({ ecarts }: EcartListWithActionsProps) {
  async function handleUpdateStatut(id: string, statut: string) {
    await fetch(`/api/ecarts/${id}/statut`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statut }),
    });
  }

  return <EcartList ecarts={ecarts} onUpdateStatut={handleUpdateStatut} />;
}
