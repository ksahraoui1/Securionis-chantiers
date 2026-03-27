"use client";

import Link from "next/link";

interface UpgradeBannerProps {
  message: string;
}

export function UpgradeBanner({ message }: UpgradeBannerProps) {
  return (
    <div className="rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 p-4 flex items-start gap-3">
      <span className="material-symbols-outlined text-blue-600 text-xl shrink-0 mt-0.5">lock</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-blue-900">{message}</p>
        <Link
          href="/dashboard/abonnement"
          className="inline-flex items-center gap-1 mt-2 px-4 py-2 min-h-[44px] bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <span className="material-symbols-outlined text-sm">upgrade</span>
          Passer à l'offre payante
        </Link>
      </div>
    </div>
  );
}
