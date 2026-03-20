"use client";

import React from "react";
import { Spinner } from "./spinner";

type ButtonVariant = "primary" | "secondary" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  type?: "button" | "submit" | "reset";
  className?: string;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 focus-visible:ring-blue-500",
  secondary:
    "bg-gray-200 text-gray-800 hover:bg-gray-300 active:bg-gray-400 focus-visible:ring-gray-400",
  danger:
    "bg-red-600 text-white hover:bg-red-700 active:bg-red-800 focus-visible:ring-red-500",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-[44px] min-w-[44px] px-3 py-2 text-sm",
  md: "min-h-[44px] min-w-[44px] px-4 py-2.5 text-base",
  lg: "min-h-[52px] min-w-[52px] px-6 py-3 text-lg",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  children,
  onClick,
  type = "button",
  className = "",
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      className={`
        inline-flex items-center justify-center gap-2
        rounded-lg font-medium
        transition-colors duration-150
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
        disabled:cursor-not-allowed disabled:opacity-50
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${className}
      `}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
}
