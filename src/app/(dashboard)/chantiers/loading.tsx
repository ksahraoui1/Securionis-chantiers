import { Spinner } from "@/components/ui/spinner";

/**
 * Loading state pour la liste de chantiers.
 * Fix P13 — absence de loading.tsx.
 */
export default function ChantiersLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Barre de recherche skeleton */}
      <div className="h-12 bg-surface-container-low rounded-2xl" />
      {/* Cards skeleton */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="bg-surface-container-lowest rounded-2xl h-24" />
      ))}
      <div className="flex justify-center py-8">
        <Spinner size="lg" className="text-primary-container" />
      </div>
    </div>
  );
}
