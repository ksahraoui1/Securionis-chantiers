/** Le nonce est remplacé pour chaque document, jamais accepté depuis le client. */
export function politiqueCsp(nonce: string, supabaseUrl: string, development = false): string {
  const origine = new URL(supabaseUrl).origin;
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${development ? " 'unsafe-eval'" : ""}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    `img-src 'self' ${origine} data: blob:`,
    "font-src 'self' https://fonts.gstatic.com",
    `connect-src 'self' ${origine} ${origine.replace('https:', 'wss:')} https://*.sentry.io${development ? " ws: http://localhost:*" : ""}`,
    `frame-src 'self' ${origine} blob:`,
    "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'",
    "worker-src 'self' blob:", "object-src 'none'",
  ].join('; ');
}
