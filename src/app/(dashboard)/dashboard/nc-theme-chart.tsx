"use client";

interface NcThemeChartProps {
  data: {
    theme: string;
    categorie: string;
    ouvertes: number;
    corrigees: number;
  }[];
}

export function NcThemeChart({ data }: NcThemeChartProps) {
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

      {/* Barres horizontales */}
      <div className="space-y-2.5">
        {data.map((d) => {
          const total = d.ouvertes + d.corrigees;
          const ouvertesPct = (d.ouvertes / max) * 100;
          const corrigeesPct = (d.corrigees / max) * 100;

          return (
            <div key={d.theme} className="group">
              <div className="flex items-center justify-between mb-0.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {d.categorie ? `${d.categorie} — ${d.theme}` : d.theme}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-3 shrink-0 text-xs">
                  {d.ouvertes > 0 && (
                    <span className="text-red-600 font-semibold">{d.ouvertes}</span>
                  )}
                  {d.corrigees > 0 && (
                    <span className="text-green-600 font-semibold">{d.corrigees}</span>
                  )}
                  <span className="text-gray-400">({total})</span>
                </div>
              </div>
              <div className="flex h-5 rounded-md overflow-hidden bg-gray-100">
                {d.ouvertes > 0 && (
                  <div
                    className="bg-red-400 transition-all rounded-l-md"
                    style={{ width: `${ouvertesPct}%` }}
                    title={`${d.ouvertes} ouvertes`}
                  />
                )}
                {d.corrigees > 0 && (
                  <div
                    className={`bg-green-400 transition-all ${d.ouvertes === 0 ? "rounded-l-md" : ""} rounded-r-md`}
                    style={{ width: `${corrigeesPct}%` }}
                    title={`${d.corrigees} corrigées`}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {data.length === 10 && (
        <p className="text-[10px] text-gray-400 mt-3 text-center">
          Top 10 des thèmes avec le plus de non-conformités
        </p>
      )}
    </div>
  );
}
