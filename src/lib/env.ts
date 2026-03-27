// Validation centralisée des variables d'environnement.
//
// IMPORTANT : Next.js inline les NEXT_PUBLIC_* au build via remplacement
// statique. Il faut y accéder directement (process.env.NEXT_PUBLIC_X),
// pas dynamiquement (process.env[name]) sinon la valeur est undefined
// côté client.

function requireValue(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Variable d'environnement manquante : ${name}. ` +
        `Vérifiez votre fichier .env.local (voir .env.example).`
    );
  }
  return value;
}

// --- Clés publiques (accessibles côté client et serveur) ---
// Accès statique direct pour que Next.js puisse les inliner.

export function getSupabaseUrl(): string {
  return requireValue(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL
  );
}

export function getSupabaseAnonKey(): string {
  return requireValue(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

// --- Clés secrètes (serveur uniquement) ---
// Ces fonctions lèvent une erreur si appelées côté client.

function requireServer(name: string, value: string | undefined): string {
  if (typeof window !== "undefined") {
    throw new Error(
      `SECURITE: tentative d'accès à ${name} côté client. ` +
        `Cette clé ne doit être utilisée que côté serveur.`
    );
  }
  return requireValue(name, value);
}

export function getServiceRoleKey(): string {
  return requireServer("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getResendApiKey(): string {
  return requireServer("RESEND_API_KEY", process.env.RESEND_API_KEY);
}

export function getResendFromEmail(): string {
  return process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
}

export function getAnthropicApiKey(): string {
  return requireServer("ANTHROPIC_API_KEY", process.env.ANTHROPIC_API_KEY);
}

export function getStripeSecretKey(): string {
  return requireServer("STRIPE_SECRET_KEY", process.env.STRIPE_SECRET_KEY);
}

export function getStripeWebhookSecret(): string {
  return requireServer("STRIPE_WEBHOOK_SECRET", process.env.STRIPE_WEBHOOK_SECRET);
}

export function getStripePublishableKey(): string {
  return requireValue(
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  );
}

export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://chantiers.securionis.com";
}
