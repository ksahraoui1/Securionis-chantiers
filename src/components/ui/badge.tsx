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
  conforme: "bg-green-100 text-green-800",
  "non-conforme": "bg-red-100 text-red-800",
  "pas-necessaire": "bg-gray-100 text-gray-600",
  ouvert: "bg-red-100 text-red-800",
  "en-cours": "bg-amber-100 text-amber-800",
  corrige: "bg-green-100 text-green-800",
  brouillon: "bg-gray-100 text-gray-600",
  en_cours: "bg-amber-100 text-amber-800",
  terminee: "bg-green-100 text-green-800",
};

export function Badge({ variant, children, className = "" }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center
        rounded-full px-2.5 py-0.5
        text-xs font-medium
        ${variantClasses[variant]}
        ${className}
      `}
    >
      {children}
    </span>
  );
}
