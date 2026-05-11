// Next.js instrumentation hook (App Router).
// Charge la config Sentry côté server/edge selon le runtime.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Capture des erreurs serveur non-handled (Server Components, Server Actions, route handlers)
// Next.js >= 15 utilise `onRequestError`, Sentry v10 l'expose sous `captureRequestError`.
export { captureRequestError as onRequestError } from "@sentry/nextjs";
