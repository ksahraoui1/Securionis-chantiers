import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@react-pdf/renderer"],
  poweredByHeader: false,
  async headers() {
    return [
      {
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
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // 'unsafe-inline' reste requis par les scripts RSC inline de Next.js
              // (Turbopack ne propage pas le nonce). 'unsafe-eval' RETIRÉ : inutile
              // en production et vecteur d'escalade XSS (eval/Function).
              "script-src 'self' 'unsafe-inline'",
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
            ].join("; "),
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
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
