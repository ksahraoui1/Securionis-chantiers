import React from "react";

interface CardProps {
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function Card({ title, children, footer, className = "" }: CardProps) {
  return (
    <div
      className={`rounded-lg bg-white p-4 shadow-sm border border-gray-400 ${className}`}
    >
      {title && (
        <h3 className="mb-3 text-lg font-semibold text-gray-900">{title}</h3>
      )}
      <div>{children}</div>
      {footer && (
        <div className="mt-4 border-t border-gray-100 pt-4">{footer}</div>
      )}
    </div>
  );
}
