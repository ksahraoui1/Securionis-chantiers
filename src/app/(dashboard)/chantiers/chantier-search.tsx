"use client";

import { useState } from "react";
import Link from "next/link";
import { ChantierCard } from "@/components/chantier/chantier-card";
import type { Tables } from "@/types/database";

interface ChantierWithStats {
  chantier: Tables<"chantiers">;
  visiteCount: number;
  ecartCount: number;
}

interface ChantierSearchProps {
  chantiersWithStats: ChantierWithStats[];
}

export function ChantierSearch({ chantiersWithStats }: ChantierSearchProps) {
  const [search, setSearch] = useState("");

  const filtered = chantiersWithStats.filter((item) =>
    item.chantier.adresse.toLowerCase().includes(search.toLowerCase())
  );

  if (chantiersWithStats.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500 mb-4">Aucun chantier trouve</p>
        <Link
          href="/chantiers/nouveau"
          className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Creer un chantier
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <input
          type="search"
          placeholder="Rechercher par adresse..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-4 py-3 min-h-[44px] text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          Aucun chantier ne correspond a votre recherche.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((item) => (
            <ChantierCard
              key={item.chantier.id}
              chantier={item.chantier}
              visiteCount={item.visiteCount}
              ecartCount={item.ecartCount}
            />
          ))}
        </div>
      )}
    </div>
  );
}
