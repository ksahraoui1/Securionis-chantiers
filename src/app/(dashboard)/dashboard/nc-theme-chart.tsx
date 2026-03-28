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
    <div className="mt-4">
      {/* Légende */}
      <div className="flex gap-5 mb-5 text-sm">
        <span className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
          <span className="text-gray-500">Ouvertes</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
          <span className="text-gray-500">Corrigées</span>
        </span>
      </div>

      {/* Barres horizontales */}
      <div className="space-y-3">
        {data.map((d, i) => {
          const total = d.ouvertes + d.corrigees;
          const ouvertesPct = (d.ouvertes / max) * 100;
          const corrigeesPct = (d.corrigees / max) * 100;

          return (
            <div key={d.theme} className="group" style={{ animationDelay: `${i * 40}ms` }}>
              <div className="flex items-center justify-between mb-1">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-700 truncate">
                    {d.categorie ? `${d.categorie} — ${d.theme}` : d.theme}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-3 shrink-0 text-xs tabular-nums">
                  {d.ouvertes > 0 && (
                    <span className="text-red-600 font-semibold">{d.ouvertes}</span>
                  )}
                  {d.corrigees > 0 && (
                    <span className="text-emerald-600 font-semibold">{d.corrigees}</span>
                  )}
                  <span className="text-gray-300 font-medium">({total})</span>
                </div>
              </div>
              <div className="flex h-2 rounded-full overflow-hidden bg-stone-100">
                {d.ouvertes > 0 && (
                  <div
                    className="bg-gradient-to-r from-red-500 to-red-400 transition-all duration-500 rounded-l-full"
                    style={{ width: `${ouvertesPct}%` }}
                    title={`${d.ouvertes} ouvertes`}
                  />
                )}
                {d.corrigees > 0 && (
                  <div
                    className={`bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500 ${d.ouvertes === 0 ? "rounded-l-full" : ""} rounded-r-full`}
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
        <p className="text-[10px] text-gray-400 mt-4 text-center">
          Top 10 des thèmes avec le plus de non-conformités
        </p>
      )}
    </div>
  );
}
