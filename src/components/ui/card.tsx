import React from "react";

interface CardProps {
  title?: string;
  subtitle?: string;
  icon?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}

export function Card({ title, subtitle, icon, children, footer, className = "", noPadding = false }: CardProps) {
  return (
    <div
      className={`rounded-2xl bg-white shadow-card border border-stone-200/80 ${className}`}
    >
      {title && (
        <div className="px-5 pt-5 pb-0">
          <div className="flex items-center gap-2.5">
            {icon && (
              <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-base text-gray-500">{icon}</span>
              </div>
            )}
            <div>
              <h3 className="text-base font-semibold text-gray-900">{title}</h3>
              {subtitle && (
                <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
              )}
            </div>
          </div>
        </div>
      )}
      <div className={noPadding ? "" : "p-5"}>{children}</div>
      {footer && (
        <div className="border-t border-stone-100 px-5 py-4">{footer}</div>
      )}
    </div>
  );
}
