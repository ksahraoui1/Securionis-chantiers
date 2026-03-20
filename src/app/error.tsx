"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center">
        <h2 className="text-xl font-bold text-gray-900 mb-2">
          Une erreur est survenue
        </h2>
        <p className="text-gray-500 mb-6">
          {error.message || "Veuillez réessayer."}
        </p>
        <button
          onClick={reset}
          className="px-6 py-3 min-h-[44px] bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
        >
          Réessayer
        </button>
      </div>
    </div>
  );
}
