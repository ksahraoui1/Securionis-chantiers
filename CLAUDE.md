# CLAUDE.md — Securionis Chantiers

Guide de développement pour Claude et les assistants IA travaillant sur ce projet.

---

## Vue d'ensemble du projet

**Securionis Chantiers** est une application SaaS de gestion des inspections de chantiers (sécurité au travail, basée sur les référentiels SUVA). Elle permet à des inspecteurs de :

- Gérer des chantiers et des visites d'inspection
- Remplir des checklists de points de contrôle (568 points SUVA : catégories → thèmes → points)
- Annoter des photos, saisir des écarts / non-conformités
- Générer et envoyer des rapports PDF par email (Resend)
- Travailler hors-ligne (PWA + IndexedDB + Service Worker)
- Recevoir des notifications push

**Stack :** Next.js 16 · TypeScript · Supabase (Postgres + Auth + Storage + RLS) · Tailwind CSS v4 · React PDF · Resend · Stripe · Anthropic Claude · Sentry · Web Push (VAPID)

---

## Commandes essentielles

```bash
# Développement
npm run dev

# Vérification TypeScript (sans emit)
npx tsc --noEmit

# Lint
npm run lint

# Build production
npm run build

# Générer les clés VAPID (Web Push)
npx web-push generate-vapid-keys
```

---

## Architecture du projet

```
src/
├── app/
│   ├── (auth)/              # Login, register, forgot/reset password
│   ├── (dashboard)/         # Pages protégées (layout avec nav)
│   │   ├── dashboard/       # KPIs + graphique NC + chantiers urgents
│   │   ├── chantiers/       # CRUD chantiers, visites, checklist, rapport
│   │   └── admin/           # Points de contrôle, documents, utilisateurs, entreprise
│   └── api/                 # Routes API (Next.js Route Handlers)
│       ├── visites/[id]/    # CRUD visite + email rapport
│       ├── ecarts/[id]/     # Statut NC
│       ├── documents/       # Upload + email document
│       ├── push/            # Subscribe/unsubscribe/test Web Push
│       ├── stripe/          # Webhook + checkout
│       └── admin/           # create-user, ia-analyse-photo, legal-assistant
├── components/
│   ├── visite/              # Checklist, items, photo-annotator, etc.
│   ├── admin/               # Formulaires admin (points de contrôle, documents…)
│   └── ui/                  # Composants génériques (offline-banner, etc.)
├── hooks/                   # use-autosave, use-push-notifications, use-online-status, etc.
├── lib/
│   ├── supabase/            # client.ts, server.ts, middleware.ts
│   ├── email/               # send-rapport.ts
│   ├── offline/             # db.ts (IndexedDB), sync.ts
│   ├── push.ts              # sendPushToUser()
│   ├── env.ts               # Getters paresseux pour variables d'env (avec garde server-side)
│   └── utils/               # canvas-annotations, storage-path, storage-upload, format, etc.
└── types/
    └── database.ts          # Types TypeScript générés depuis le schéma Supabase
```

---

## Variables d'environnement

Copier `.env.example` → `.env.local` et renseigner :

| Variable | Description | Côté |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase | Client + Server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé anon Supabase | Client + Server |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service role (admin) | **Server uniquement** |
| `RESEND_API_KEY` | Clé API Resend pour les emails | **Server uniquement** |
| `RESEND_FROM_EMAIL` | Expéditeur email (domaine racine vérifié) | Server |
| `ANTHROPIC_API_KEY` | Clé API Claude (analyse photos + assistant) | **Server uniquement** |
| `STRIPE_SECRET_KEY` | Clé secrète Stripe | **Server uniquement** |
| `STRIPE_WEBHOOK_SECRET` | Secret webhook Stripe | Server |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Clé publique Stripe | Client |
| `STRIPE_PRICE_MONTHLY` / `YEARLY` | IDs des prix Stripe | Server |
| `NEXT_PUBLIC_APP_URL` | URL de l'application | Client + Server |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Clé publique VAPID (Web Push) | Client |
| `VAPID_PRIVATE_KEY` | Clé privée VAPID | **Server uniquement** |
| `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` | DSN Sentry (optionnel, no-op si absent) | Client + Server |

> **IMPORTANT** : Ne jamais accéder à `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` ou `ANTHROPIC_API_KEY` depuis du code client. Utiliser les getters de `src/lib/env.ts` qui incluent une garde `requireServer()`.

---

## Base de données (Supabase)

### Schéma principal

| Table | Description |
|---|---|
| `profiles` | Utilisateurs (role: `administrateur` \| `inspecteur` \| `invité`) |
| `entreprises` | Entreprises d'inspection (logo, coordonnées) |
| `chantiers` | Chantiers (inspecteur, archived) |
| `chantier_inspecteurs` | Relation N:N chantiers ↔ inspecteurs |
| `destinataires` | Destinataires emails par chantier |
| `visites` | Visites d'inspection (categorie_ids, renseignements_par) |
| `categories` | Catégories de points de contrôle |
| `themes` | Thèmes (sous-catégories SUVA) |
| `points_controle` | 568+ points SUVA (catégorie → thème → point) |
| `reponses` | Réponses checklist par visite |
| `ecarts` | Non-conformités (statut: ouvert/en_cours/corrigé) |
| `documents` | Base documentaire (PDF liés aux points de contrôle) |
| `audit_logs` | Logs d'actions (send_rapport_email, delete_visite, etc.) |
| `push_subscriptions` | Abonnements Web Push (RLS user-scoped) |
| `subscriptions` | Abonnements Stripe |

### Migrations

Les migrations sont dans `supabase/migrations/`. Numérotées `001` → `034`. Appliquer via :
```bash
npx supabase db push --linked
# ou pour une migration spécifique :
npx supabase db query --linked < supabase/migrations/NNN_xxx.sql
```

> Attention : les migrations 001-015 ont été appliquées manuellement hors du tracking CLI. `supabase/all_migrations.sql` contient le script complet consolidé.

### RLS (Row Level Security)

**Toutes les tables ont RLS activé.** Règles clés :
- Les inspecteurs ne voient que leurs propres chantiers (via `chantier_inspecteurs`)
- `profiles` : lecture publique, écriture self uniquement
- `audit_logs` : `resource` (pas `resource_type`) est le nom de colonne correct (depuis migration 022)
- `categories` : écriture admin seulement pour `is_custom = true` (migration 033)
- Utiliser `serviceClient` (avec `SUPABASE_SERVICE_ROLE_KEY`) pour les opérations qui bypassent le RLS côté server

---

## Patterns de code à respecter

### Clients Supabase

```ts
// Côté serveur (Server Components, Route Handlers)
import { createClient } from "@/lib/supabase/server";
const supabase = await createClient();

// Service role (bypass RLS) — server uniquement
import { createServiceClient } from "@/lib/supabase/server";
const serviceClient = createServiceClient();

// Côté client
import { createClient } from "@/lib/supabase/client";
const supabase = createClient();
```

### Variables d'environnement

Toujours utiliser les getters de `src/lib/env.ts` :
```ts
import { getResendApiKey, getServiceRoleKey, requireServer } from "@/lib/env";
requireServer(); // Lance une erreur si exécuté côté client
const key = getResendApiKey();
```

### Chemins de stockage Supabase

Utiliser les helpers de `src/lib/utils/storage-path.ts` :
```ts
import { buildStoragePath, extractStoragePath } from "@/lib/utils/storage-path";
const path = buildStoragePath("rapports", "pdf");
const storagePath = extractStoragePath(publicUrl, "rapports");
```

### Upload de fichiers

Utiliser `uploadFileToStorage` de `src/lib/utils/storage-upload.ts` :
```ts
import { uploadFileToStorage } from "@/lib/utils/storage-upload";
const url = await uploadFileToStorage(file, { bucket: "documents", pathPrefix: "pdfs", validate: true });
```

### Emails (Resend)

**Important** : Le SDK Resend renvoie `{ data, error }` **sans throw** en cas d'erreur. Toujours vérifier `result.error` :
```ts
const result = await resend.emails.send({ ... });
if (result.error) {
  return NextResponse.json({ error: result.error.message }, { status: 502 });
}
```

L'expéditeur doit utiliser le domaine racine vérifié (`RESEND_FROM_EMAIL`), pas un sous-domaine.

### Audit logs

```ts
await supabase.from("audit_logs").insert({
  action: "send_rapport_email",
  resource: "visites",        // ← "resource", pas "resource_type" !
  resource_id: visiteId,
  metadata: { sent_to: emails },
});
```

---

## Rôles utilisateurs

| Rôle | Accès |
|---|---|
| `administrateur` | Tout : points de contrôle, documents, utilisateurs, entreprise |
| `inspecteur` | Ses chantiers, visites, checklists, rapports |
| `invité` | Vue limitée + page abonnement Stripe |

Le middleware (`src/middleware.ts`) protège toutes les routes sauf : `/login`, `/register`, `/forgot-password`, `/reset-password`, `/auth`.

---

## PWA & Offline

- **Service Worker** : `public/sw.js` — cache-first pour assets, network-first pour pages
- **IndexedDB** : `src/lib/offline/db.ts` — stockage local des réponses en attente
- **Sync** : `src/lib/offline/sync.ts` — synchronisation au retour du réseau
- **Hook** : `use-online-status.ts` — détecte online/offline, déclenche la sync
- **Bannière** : `<OfflineBanner />` dans le layout dashboard
- **Cache version** : incrémenter `CACHE_VERSION` dans `sw.js` pour forcer le renouvellement

---

## Notifications Push (Web Push)

- Infra VAPID complète dans `src/lib/push.ts`
- API : `/api/push/subscribe` (POST/DELETE), `/api/push/test`
- Hook : `usePushNotifications()` dans `src/hooks/use-push-notifications.ts`
- Composant : `<PushNotificationsCard>` sur `/dashboard/notifications`
- Cleanup automatique des subscriptions expirées (erreurs 404/410)
- **Triggers métier non implémentés** — MVP test uniquement pour l'instant

---

## Monitoring (Sentry)

- Config dans `sentry.{client,server,edge}.config.ts`
- **No-op si `SENTRY_DSN` absent** — l'app fonctionne sans config Sentry
- `instrumentation.ts` avec `onRequestError` pour capturer les erreurs Next.js

---

## CI/CD

- **GitHub Actions** : `.github/workflows/ci.yml` — `npx tsc --noEmit` + `npm run build` à chaque push/PR sur `main`
- **Docker** : `Dockerfile` + `docker-compose.yml` pour déploiement VPS
- **Production** : `chantiers.securionis.com`

---

## Nouvelles Features

### Export des photos en ZIP (2026-06-07)

**API Route** : `GET /api/photos/export`
- Télécharge toutes les photos de tous les chantiers en un seul fichier ZIP
- **Réservé aux administrateurs uniquement** (vérification RLS)
- Authentification obligatoire
- Timeout : 5 minutes
- Organisation des fichiers : `chantier-id/date-visite/point-controle-id/photo.jpg`

**Interface Admin** : `/admin`
- Nouvelle page d'accueil admin avec grille des options
- Bouton "Télécharger toutes les photos (ZIP)" dans section dédiée
- Composant : `src/components/admin/photos-export-button.tsx`

**Dépendances ajoutées** :
- `jszip` (^3.10.1) — génération du ZIP en mémoire (compatible serverless)
- `lucide-react` (^1.17.0) — icônes UI

**Requête Supabase** :
```ts
.select(`id, photos, visite_id, point_controle_id, visites (...), points_controle (...)`)
.not("photos", "is", null)
```

### Avertissement "Ne pas répondre à cet email" (2026-06-19)

**Modification** : Tous les emails envoyés (rapports de visite + documents) contiennent maintenant un avertissement en début de message :
> **Ne veuille pas répondre à cette email ! Utilisez : ks.aigle@gmail.com**

**Fichiers modifiés** :
- `src/lib/email/send-rapport.ts` — Rapports de visite
- `src/app/api/documents/email/route.ts` — Envoi de documents de la base documentaire

**Raison** : Clarifier aux destinataires que la boîte mail d'envoi n'est pas supervisée et les orienter vers l'adresse de contact directe.

### Refactoring Dashboard et mise à jour branding (2026-06-21)

**Dashboard simplifié** :
- Tableau "Visites ce mois" : grouper par chantier, afficher dates en badges compacts (au lieu d'une ligne par visite)
- Mise en page 2 colonnes : "Visites ce mois" + "NC en attente" côte à côte (responsive mobile)
- Graphique NC reste en pleine largeur en-dessous

**Branding FWN** :
- Copyright mis à jour en `©2026 - FWN - Securionis` partout :
  - `src/app/(auth)/layout.tsx` — Page login
  - `src/app/(dashboard)/layout.tsx` — Footer dashboard
  - `src/app/api/docs/manual/route.ts` — Manuel utilisateur (2 occurrences)

**Fichiers modifiés** :
- `src/app/(dashboard)/dashboard/page.tsx` — Refactoring tableau visites + grille 2 colonnes
- `src/app/(auth)/layout.tsx` — Copyright FWN
- `src/app/(dashboard)/layout.tsx` — Copyright FWN
- `src/app/api/docs/manual/route.ts` — Copyright FWN (page couverture + footer)

### Bandeau "NC corrigées" masqué une fois le rapport à jour (2026-07-04)

**Problème** : sur la page chantier, le bandeau vert "Toutes les NC de la visite sont corrigées → Générer le rapport" restait affiché indéfiniment, même après génération/envoi du rapport mis à jour.

**Solution** : comparaison de timestamps plutôt qu'un simple flag booléen — le bandeau ne s'affiche que si une correction de NC est plus récente que le dernier rapport généré/envoyé pour la visite.
- `ecarts.updated_at` est maintenant explicitement rafraîchi à chaque changement de statut (aucun trigger DB ne le faisait — colonne existait mais restait figée à `created_at`)
- `visites.updated_at` est explicitement rafraîchi à la génération du PDF (`/api/visites/[id]/pdf`) et à l'envoi de l'email (`/api/visites/[id]/email`)
- Nouvelle fonction `isRapportAJour(visiteId, visiteUpdatedAt)` dans `src/app/(dashboard)/chantiers/[id]/page.tsx` : compare `visite.updated_at` au max des `ecarts.updated_at` des NC de la visite

**Fichiers modifiés** :
- `src/app/(dashboard)/chantiers/[id]/page.tsx` — logique `isRapportAJour` + filtre du bandeau
- `src/app/api/ecarts/[id]/statut/route.ts` — `updated_at` explicite sur update
- `src/app/api/visites/[id]/pdf/route.ts` — `updated_at` explicite sur update
- `src/app/api/visites/[id]/email/route.ts` — `updated_at` explicite sur update

**Aucune migration SQL** : les colonnes `updated_at` existaient déjà sur `ecarts` et `visites`, seul le rafraîchissement explicite manquait.

### Audit de sécurité v3 + durcissement infra (2026-07-04)

**Vulnérabilités de dépendances corrigées** : `ws` 8.19.0 → 8.21.0 (CVE-2026-48779, DoS), `next` 16.2.0 → 16.2.10 (CVE-2026-45109, contournement middleware sous Turbopack).

**Durcissement applicatif** :
- `next.config.ts` : `poweredByHeader: false` (ne plus divulguer la stack Next.js)
- Rate-limit ajouté sur `/api/docs/manual`, `DELETE /api/visites/[id]`, `/api/ecarts/[id]/statut`
- `validateFileSignature()` dans `file-validation.ts` : vérification des magic bytes (PDF/JPEG/PNG/Office), branchée dans `uploadFileToStorage`. NB : côté client donc défense en profondeur — le contrôle autoritaire est la config bucket.
- Buckets Storage `rapports` (PDF, 50 Mo) et `visite-photos` (JPEG/PNG, 10 Mo) : `allowed_mime_types` + `file_size_limit` désormais définis.

**Durcissement infra VPS** :
- **Firewall UFW actif** : deny incoming par défaut, `22/tcp` autorisé (SSH), port `80` restreint aux plages IP Cloudflare uniquement. L'accès direct à l'IP du VPS (contournement Cloudflare) est bloqué.
- **Docker bind local** : `docker-compose.yml` → `127.0.0.1:3000:3000` (le port 3000 n'est plus exposé publiquement, Nginx proxifie en local).
- **SSH durci** : `PasswordAuthentication no`, `PermitRootLogin prohibit-password` (clé uniquement), drop-in `/etc/ssh/sshd_config.d/99-hardening.conf`. `fail2ban` installé (jail sshd, ban 1h / 5 échecs).

**Reste à traiter (non appliqué)** :
- Cloudflare SSL est en mode **Flexible** (CF→origine en HTTP clair). Passer en **Full (Strict)** avec certificat d'origine Cloudflare (nécessite config dashboard Cloudflare + Nginx 443).
- Buckets Storage encore `public: true` — passer `rapports` en privé nécessite de vérifier que tout l'affichage passe par des URLs signées.
- `xlsx` : vulnérabilité haute sans correctif amont (prototype pollution / ReDoS) — envisager migration vers `exceljs`.
- CSP `script-src` contient `'unsafe-inline' 'unsafe-eval'` — durcir via nonces si possible.

---

## Pièges connus et gotchas

1. **`resource` vs `resource_type`** dans `audit_logs` : la colonne s'appelle `resource` (depuis migration 022). `resource_type` provoque des inserts silencieusement ignorés.
2. **Resend ne throw pas** en cas d'erreur — toujours vérifier `result.error`.
3. **Domaine Resend** : utiliser le domaine racine `securionis.com`, pas un sous-domaine.
4. **`next lint` supprimé** dans Next.js 16 — utiliser `npm run lint` (`eslint .`).
5. **Stale closure** dans les handlers React : lire l'état avant de le muter (cf. bug `handlePhotoRemove` dans `checklist-item.tsx`).
6. **Tri non-mutant** : toujours faire `[...array].sort()` jamais `array.sort()` directement sur un state.
7. **Variables `NEXT_PUBLIC_*`** : inlinées par Next.js au build — les getters dans `env.ts` sont des fonctions (pas des constantes) pour préserver ce comportement.
8. **Service Worker cache** : incrémenter `CACHE_VERSION` dans `public/sw.js` pour forcer la mise à jour chez les clients.
9. **Migrations Supabase** : les migrations 001-015 sont hors tracking CLI. Ne pas utiliser `supabase db push` sans vérifier l'état réel de la base distante.
10. **`updated_at` non auto-géré** : aucune table n'a de trigger PostgreSQL pour rafraîchir `updated_at` automatiquement — il faut le fixer explicitement dans chaque `.update(...)` qui en dépend (cf. `ecarts`, `visites`).

---

## ESLint

33 erreurs et 27 warnings connus (identifiés après migration vers ESLint 9 flat config). Ne pas bloquer le développement sur ces erreurs existantes — les corriger progressivement.

```bash
npm run lint
```

Config : `eslint.config.mjs` (flat config ESLint 9, sans `FlatCompat`).
