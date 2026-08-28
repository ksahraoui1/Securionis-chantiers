// ESLint 9 flat config + Next.js 16.
// eslint-config-next 16+ exporte directement un tableau de configs flat
// — plus besoin de FlatCompat (qui crashait avec "Converting circular
// structure to JSON" sur ESLint 9).
import nextConfig from "eslint-config-next";

export default [
  ...nextConfig,
  {
    ignores: [
      "node_modules/",
      ".next/",
      "dist/",
      "build/",
      "coverage/",
      "public/sw.js",
      // Copie locale d'OpenCV.js : code tiers minifié, pas notre style
      "public/vendor/",
      "supabase/",
    ],
  },
];
