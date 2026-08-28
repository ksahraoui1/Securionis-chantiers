"use client";

import { useState } from "react";
import type { ReactNode } from "react";

const TABS = [
  { id: "documents", label: "Documents", icon: "folder" },
  { id: "visites", label: "Visites", icon: "event_note" },
  { id: "comparaison", label: "Comparaison", icon: "compare_arrows" },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface ChantierTabsProps {
  documents: ReactNode;
  visites: ReactNode;
  comparaison: ReactNode;
}

export function ChantierTabs({ documents, visites, comparaison }: ChantierTabsProps) {
  const [active, setActive] = useState<TabId>("documents");

  const panneaux: Record<TabId, ReactNode> = { documents, visites, comparaison };

  return (
    <div>
      <div
        role="tablist"
        aria-label="Sections du chantier"
        className="flex gap-1 border-b border-gray-200 overflow-x-auto overflow-y-hidden"
      >
        {TABS.map((tab) => {
          const actif = active === tab.id;
          return (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={actif}
              aria-controls={`panel-${tab.id}`}
              onClick={() => setActive(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 min-h-touch text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                actif
                  ? "border-[#002855] text-[#002855]"
                  : "border-transparent text-gray-500 hover:text-[#002855] hover:border-gray-300"
              }`}
            >
              <span className="material-symbols-outlined text-lg">{tab.icon}</span>
              {tab.label}
            </button>
          );
        })}
      </div>

      {TABS.map((tab) => (
        <div
          key={tab.id}
          id={`panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${tab.id}`}
          hidden={active !== tab.id}
          className="pt-4"
        >
          {panneaux[tab.id]}
        </div>
      ))}
    </div>
  );
}
