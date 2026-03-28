import React from "react";

type BadgeVariant =
  | "conforme"
  | "non-conforme"
  | "pas-necessaire"
  | "ouvert"
  | "en-cours"
  | "corrige"
  | "brouillon"
  | "en_cours"
  | "terminee";

interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  conforme: "bg-emerald-50 text-emerald-700 ring-emerald-600/10",
  "non-conforme": "bg-red-50 text-red-700 ring-red-600/10",
  "pas-necessaire": "bg-gray-50 text-gray-600 ring-gray-500/10",
  ouvert: "bg-red-50 text-red-700 ring-red-600/10",
  "en-cours": "bg-amber-50 text-amber-700 ring-amber-600/10",
  corrige: "bg-emerald-50 text-emerald-700 ring-emerald-600/10",
  brouillon: "bg-gray-50 text-gray-600 ring-gray-500/10",
  en_cours: "bg-amber-50 text-amber-700 ring-amber-600/10",
  terminee: "bg-emerald-50 text-emerald-700 ring-emerald-600/10",
};

export function Badge({ variant, children, className = "" }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center
        rounded-lg px-2 py-0.5
        text-[11px] font-semibold uppercase tracking-wide
        ring-1 ring-inset
        ${variantClasses[variant]}
        ${className}
      `}
    >
      {children}
    </span>
  );
}
