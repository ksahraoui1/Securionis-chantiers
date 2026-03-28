import { Spinner } from "@/components/ui/spinner";

export default function ChantiersLoading() {
  return (
    <div className="max-w-5xl mx-auto space-y-4 animate-pulse">
      {/* Header skeleton */}
      <div className="flex justify-between items-end">
        <div>
          <div className="h-8 w-40 bg-stone-200 rounded-xl" />
          <div className="h-4 w-24 bg-stone-150 rounded-lg mt-2" />
        </div>
        <div className="flex gap-2">
          <div className="h-11 w-24 bg-stone-200 rounded-xl" />
          <div className="h-11 w-36 bg-stone-200 rounded-xl" />
        </div>
      </div>
      {/* Search skeleton */}
      <div className="h-12 bg-white rounded-xl border border-stone-200/80" />
      {/* Cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-stone-200/80 h-32" />
        ))}
      </div>
      <div className="flex justify-center py-8">
        <Spinner size="lg" className="text-stone-300" />
      </div>
    </div>
  );
}
