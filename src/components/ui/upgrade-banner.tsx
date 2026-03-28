"use client";

import Link from "next/link";

interface UpgradeBannerProps {
  message: string;
}

export function UpgradeBanner({ message }: UpgradeBannerProps) {
  return (
    <div className="rounded-2xl bg-gradient-to-r from-brand-50 to-amber-50 border border-brand-200/60 p-5 flex items-start gap-3">
      <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center shrink-0">
        <span className="material-symbols-outlined text-brand-600 text-xl">workspace_premium</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-800 font-medium">{message}</p>
        <Link
          href="/dashboard/abonnement"
          className="inline-flex items-center gap-1.5 mt-3 px-4 py-2.5 min-h-[44px] bg-brand-600 text-white text-sm font-medium rounded-xl hover:bg-brand-700 transition-all shadow-sm hover:shadow-md"
        >
          <span className="material-symbols-outlined text-base">upgrade</span>
          Passer à l&apos;offre payante
        </Link>
      </div>
    </div>
  );
}
