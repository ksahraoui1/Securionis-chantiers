"use client";

interface NcChartProps {
  data: { mois: string; ouvertes: number; corrigees: number }[];
}

export function NcChart({ data }: NcChartProps) {
  const max = Math.max(...data.map((d) => d.ouvertes + d.corrigees), 1);

  return (
    <div>
      {/* Légende */}
      <div className="flex gap-4 mb-4 text-sm">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-red-400 inline-block" />
          Ouvertes
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-green-400 inline-block" />
          Corrigées
        </span>
      </div>

      {/* Barres */}
      <div className="flex items-end gap-3 h-48">
        {data.map((d) => {
          const total = d.ouvertes + d.corrigees;
          const ouvertesPct = total > 0 ? (d.ouvertes / max) * 100 : 0;
          const corrigeesPct = total > 0 ? (d.corrigees / max) * 100 : 0;

          return (
            <div key={d.mois} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-xs text-gray-500 font-medium">
                {total > 0 ? total : ""}
              </span>
              <div className="w-full flex flex-col justify-end h-40">
                <div
                  className="w-full bg-red-400 rounded-t-sm transition-all"
                  style={{ height: `${ouvertesPct}%` }}
                  title={`${d.ouvertes} ouvertes`}
                />
                <div
                  className="w-full bg-green-400 rounded-b-sm transition-all"
                  style={{ height: `${corrigeesPct}%` }}
                  title={`${d.corrigees} corrigées`}
                />
              </div>
              <span className="text-xs text-gray-600">{d.mois}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
