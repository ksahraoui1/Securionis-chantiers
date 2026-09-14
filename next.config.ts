import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Image Docker multi-étapes (SEC-02) : `standalone` produit un `server.js`
  // autonome avec les seuls modules importés, au lieu d'embarquer le code
  // source et tout `node_modules` dans l'image livrée.
  output: "standalone",
  serverExternalPackages: ["@react-pdf/renderer"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        // En-têtes communs à toutes les routes, CSP mise à part.
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "0" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "geolocation=(), microphone=(), camera=(), payment=(), usb=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
      {
        // OpenCV.js pèse 7,5 Mo (2,4 Mo compressés) et son chemin est fixe : à
        // défaut d'en-tête, Next.js le sert en `max-age=0` et il repart du
        // serveur à chaque chargement de la page de comparaison.
        // ⚠️ Une mise à jour de la bibliothèque impose donc de renommer le
        // dossier, faute de quoi les clients garderont l'ancienne un mois.
        source: "/vendor/opencv/:fichier*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=2592000" },
        ],
      },
    ];
  },
};

// Wrapper Sentry. Si SENTRY_DSN n'est pas défini, les SDK Sentry sont no-op
// (cf. sentry.*.config.ts) — l'app continue de fonctionner sans crash.
export default withSentryConfig(nextConfig, {
  // Pas d'upload de source maps tant qu'on n'a pas SENTRY_AUTH_TOKEN
  silent: true,
  // Cache organisations/projets : skip si pas configuré
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Désactive l'upload des source maps si pas de token (build CI sans Sentry)
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
  // Tunnel les requêtes Sentry à travers /monitoring pour éviter les bloqueurs de pub
  tunnelRoute: "/monitoring",
});
