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
      <div className="text-center py-20">
        <div className="w-16 h-16 rounded-2xl bg-stone-100 flex items-center justify-center mx-auto mb-4">
          <span className="material-symbols-outlined text-3xl text-stone-400">foundation</span>
        </div>
        <h3 className="font-heading font-semibold text-gray-900 mb-2">Aucun chantier</h3>
        <p className="text-gray-400 text-sm mb-6">Commencez par créer votre premier chantier</p>
        <Link
          href="/chantiers/nouveau"
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 bg-brand-600 text-white font-medium rounded-xl hover:bg-brand-700 transition-all shadow-sm hover:shadow-md"
        >
          <span className="material-symbols-outlined text-lg">add</span>
          Créer un chantier
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5">
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-xl text-gray-400">search</span>
          <input
            type="search"
            placeholder="Rechercher par adresse..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-12"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <span className="material-symbols-outlined text-3xl text-stone-300 block mb-2">search_off</span>
          <p className="text-gray-400 text-sm">
            Aucun chantier ne correspond à votre recherche.
          </p>
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
