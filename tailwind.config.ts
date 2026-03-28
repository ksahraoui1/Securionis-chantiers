import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        conforme: "#16a34a",
        "non-conforme": "#dc2626",
        "pas-necessaire": "#6b7280",
        "ecart-ouvert": "#dc2626",
        "ecart-en-cours": "#f59e0b",
        "ecart-corrige": "#16a34a",
      },
      minWidth: {
        touch: "44px",
      },
      minHeight: {
        touch: "44px",
      },
    },
  },
  plugins: [],
};

export default config;
