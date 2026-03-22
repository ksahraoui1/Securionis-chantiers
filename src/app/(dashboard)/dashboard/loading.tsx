import { Spinner } from "@/components/ui/spinner";

/**
 * Loading skeleton affiché pendant le chargement du dashboard (RSC streaming).
 * Fix P13 — absence de loading.tsx.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* KPI skeleton */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-surface-container-lowest rounded-2xl h-40 border-l-4 border-surface-container-high"
          />
        ))}
      </section>

      {/* Chart skeleton */}
      <div className="bg-surface-container-low rounded-2xl h-64" />

      {/* Loading indicator centré */}
      <div className="flex justify-center py-8">
        <Spinner size="lg" className="text-primary-container" />
      </div>
    </div>
  );
}
