import Link from "next/link";

export function PlanComparaison({ chantierId }: { chantierId: string }) {
  return (
    <div className="text-center py-10 px-4">
      <div className="w-14 h-14 rounded-full bg-[#002855]/10 flex items-center justify-center mx-auto mb-3">
        <span translate="no" className="material-symbols-outlined text-[#002855] text-2xl">
          compare_arrows
        </span>
      </div>
      <h3 className="text-lg font-semibold text-[#002855]">
        Comparer le plan PE et le plan EXE
      </h3>
      <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
        Superposez le plan d&apos;enquête publique (
        <span className="font-semibold text-[#2E7D32]">PE</span>) et le plan
        d&apos;exécution (<span className="font-semibold text-[#E67E22]">EXE</span>)
        pour repérer les écarts, avec réglage de l&apos;opacité et vue côte à côte.
      </p>

      <Link
        href={`/chantiers/${chantierId}/comparaison`}
        className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 mt-4 bg-[#002855] text-white font-medium rounded-lg hover:bg-[#002855]/90 transition-colors text-sm"
      >
        <span translate="no" className="material-symbols-outlined text-lg">rule</span>
        Sélectionner les plans à comparer
      </Link>
    </div>
  );
}
