import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        heading: ['"Outfit"', "system-ui", "sans-serif"],
        body: ['"DM Sans"', "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          50: "#FFF7ED",
          100: "#FFEDD5",
          200: "#FED7AA",
          300: "#FDBA74",
          400: "#FB923C",
          500: "#F97316",
          600: "#E8590C",
          700: "#C2410C",
          800: "#9A3412",
          900: "#7C2D12",
        },
        navy: {
          50: "#F0F3F9",
          100: "#D9E0EF",
          200: "#B3C1DF",
          300: "#8DA2CF",
          400: "#6783BF",
          500: "#3D5A9E",
          600: "#2D4373",
          700: "#1A2744",
          800: "#0F1729",
          900: "#0A0F1C",
        },
        stone: {
          50: "#FAFAF8",
          100: "#F7F5F2",
          150: "#F0EDE8",
          200: "#E8E4DD",
          300: "#D5CFC5",
          400: "#B8B0A3",
        },
        conforme: "#059669",
        "non-conforme": "#DC2626",
        "pas-necessaire": "#6B7280",
        "ecart-ouvert": "#DC2626",
        "ecart-en-cours": "#D97706",
        "ecart-corrige": "#059669",
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.25rem",
      },
      boxShadow: {
        subtle: "0 1px 2px rgba(15, 23, 41, 0.04)",
        card: "0 1px 3px rgba(15, 23, 41, 0.04), 0 1px 2px rgba(15, 23, 41, 0.02)",
        lifted: "0 4px 12px rgba(15, 23, 41, 0.06), 0 1px 3px rgba(15, 23, 41, 0.04)",
        float: "0 12px 32px rgba(15, 23, 41, 0.08), 0 4px 8px rgba(15, 23, 41, 0.04)",
        glow: "0 0 0 3px rgba(233, 89, 12, 0.15)",
      },
      minWidth: {
        touch: "44px",
      },
      minHeight: {
        touch: "44px",
      },
      animation: {
        "fade-in": "fadeIn 0.4s ease-out",
        "slide-up": "slideUp 0.4s ease-out",
        "slide-in-left": "slideInLeft 0.3s ease-out",
        "scale-in": "scaleIn 0.2s ease-out",
        shimmer: "shimmer 2s infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideInLeft: {
          "0%": { opacity: "0", transform: "translateX(-12px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
