import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

/**
 * Content-Security-Policy
 *
 * Une seule directive change d'une page à l'autre : `script-src`. Le reste est
 * commun, défini une fois ici pour qu'aucune des deux politiques ne dérive.
 *
 * ⚠️ Les deux règles d'en-têtes ci-dessous doivent rester **mutuellement
 * exclusives**. Lorsqu'un navigateur reçoit deux en-têtes CSP, il applique leur
 * **intersection** : envoyer les deux à la même page reviendrait à appliquer la
 * plus stricte partout, et la page de comparaison cesserait de fonctionner.
 */
const CSP_COMMUNE = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' https: data: blob:",
  "font-src 'self' https://fonts.gstatic.com",
  // Supabase + Sentry ingest (ingestion + replay)
  "connect-src 'self' https://*.supabase.co https://*.supabase.in https://*.sentry.io https://*.ingest.sentry.io",
  "frame-src 'self' https://*.supabase.co https://*.supabase.in",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
];

// 'unsafe-inline' reste requis par les scripts RSC inline de Next.js (Turbopack
// ne propage pas le nonce). 'unsafe-eval' est RETIRÉ : inutile en production et
// vecteur d'escalade XSS (eval / new Function).
const SCRIPT_SRC_STRICT = "'self' 'unsafe-inline'";

/**
 * Exception unique : la comparaison de plans.
 *
 * OpenCV.js est bâti sur Embind, qui **fabrique chaque fonction liée à partir
 * d'une chaîne de caractères** (`craftInvokerFunction`, via `new_(Function,…)`).
 * Rien ne permet de l'en empêcher sans recompiler la bibliothèque avec
 * `-sDYNAMIC_EXECUTION=0`. Deux autres sites d'évaluation ont pu être
 * neutralisés dans la copie locale (voir `public/vendor/opencv/LISEZ-MOI.md`),
 * celui-ci non.
 *
 * `'unsafe-eval'` est donc accordé à cette seule route, et couvre du même coup
 * `WebAssembly.instantiate`. Le reste de l'application conserve la politique
 * durcie lors de l'audit de juillet 2026.
 *
 * OpenCV.js est servi depuis `/vendor/opencv` — donc `'self'`, jamais un CDN :
 * `'unsafe-eval'` n'ouvre la porte à aucun code tiers.
 */
const SCRIPT_SRC_COMPARAISON = `${SCRIPT_SRC_STRICT} 'unsafe-eval'`;

const CHEMIN_COMPARAISON = "/chantiers/:id/comparaison";

// Toutes les routes sauf la comparaison. La négation est portée par le motif
// lui-même : c'est ce qui garantit qu'une seule des deux règles s'applique.
const CHEMIN_HORS_COMPARAISON =
  "/:chemin((?!chantiers/[^/]+/comparaison$).*)";

function politique(scriptSrc: string): string {
  return [`script-src ${scriptSrc}`, ...CSP_COMMUNE].join("; ");
}

const nextConfig: NextConfig = {
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
          { key: "X-XSS-Protection", value: "1; mode=block" },
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
        source: CHEMIN_HORS_COMPARAISON,
        headers: [
          {
            key: "Content-Security-Policy",
            value: politique(SCRIPT_SRC_STRICT),
          },
        ],
      },
      {
        source: CHEMIN_COMPARAISON,
        headers: [
          {
            key: "Content-Security-Policy",
            value: politique(SCRIPT_SRC_COMPARAISON),
          },
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
