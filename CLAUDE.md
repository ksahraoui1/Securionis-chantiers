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

### Date de visite dans le bandeau NC corrigées — page rapport (2026-07-04)

Le bandeau vert « Toutes les non-conformités … ont été corrigées » de la page rapport (`src/app/(dashboard)/chantiers/[id]/visites/[visiteId]/rapport/page.tsx`) affiche désormais la date de la visite : « Toutes les non-conformités **de la visite du JJ.MM.AAAA** ont été corrigées ». Le bandeau équivalent de la page chantier affichait déjà la date. Le message de `ecart-list.tsx` porte sur l'ensemble des NC d'un chantier (multi-visites) et reste sans date volontairement.

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
- **Cloudflare Full (Strict)** : certificat Let's Encrypt sur l'origine (`/etc/letsencrypt/live/chantiers.securionis.com/`), Nginx en 443, port 443 ouvert dans UFW pour les IP Cloudflare. Renouvellement auto via `certbot.timer` (dry-run OK à travers firewall+CF). Le trafic Cloudflare→origine est désormais chiffré et validé (vérifié : CF se connecte en 443, réponse 200 sans erreur 526).

**Reste à traiter (non appliqué)** :
- Buckets Storage encore `public: true` — voir décision ci-dessous.

### Suivi audit v3 — traitement des points résiduels (2026-07-04)

- **`xlsx` → `exceljs` (FAIT)** : SheetJS retiré (vuln high sans patch). Export `/api/export/xlsx` réécrit (helper `appendSheet`), import `import-excel-points.tsx` migré vers `exceljs.xlsx.load`. Round-trip write/read vérifié.
- **CSP `'unsafe-eval'` retiré (FAIT)** : `script-src 'self' 'unsafe-inline'` + `object-src 'none'`. ⚠️ **`'unsafe-inline'` doit rester** : l'approche nonce + `strict-dynamic` a été testée et **écarte** — Turbopack ne propage pas le nonce aux scripts RSC inline (`self.__next_f.push`), ce qui bloque l'hydratation React (page non interactive). Ne pas re-tenter le nonce sans changer de bundler.
- **Buckets privés (NON FAIT — décision)** : conservés `public: true`. Risque réel faible (aucune policy RLS `anon` → pas de listing/énumération ; chemins UUID non devinables). Passer en privé casserait la prod : le bucket `rapports` stocke aussi le **logo embarqué dans les emails** (une URL signée expire en 1h → logo cassé dans un email ouvert plus tard) + migration de toutes les URLs stockées en base (photos `reponses.photos`, documents, logos). Nécessite une ré-architecture (bucket privé sensible + bucket public assets email) à planifier séparément.

### Familles + recherche full-text des points de contrôle (2026-08-27)

**Objectif** : rendre `/admin/points-controle` utilisable malgré 487 points répartis sur 28 catégories.

**Base de données** (migrations 035 et 036, table `points_controle` — attention : la table s'appelle bien `points_controle`, pas `points_de_controle`) :
- `famille` (text) : regroupement métier des 28 catégories en **12 familles**, contraint par un CHECK. Répartition obtenue : Protections antichute 107, Fouilles & Terrasse 66, Engins & Levage 51, Accès & Circulation 51, Dispositions générales 45, Électricité & Énergies 42, Structures & Toitures 37, Démolition & Désamiantage 26, EPI & Santé 25, Machines & Outils 22, Produits & Incendie 14, Autres 1.
- `mots_cles` (text[]) : mots-clés dérivés de l'intitulé + libellé du thème + libellé de la catégorie (mots ≥ 4 caractères, mots vides exclus). Permet de retrouver un point via le vocabulaire de son thème même s'il est absent de l'intitulé.
- `search_vector` (tsvector **généré**, index GIN) : `intitule` et `mots_cles` en poids A, `famille` en B, `critere`/`objet`/`base_legale` en C, `explications` en D.
- Configuration de recherche `french_unaccent` (`unaccent` + `french_stem`) : sans elle, « echa » ne remontait rien là où « écha » remontait 57 points.
- `immutable_array_to_string()` : `array_to_string` est déclarée STABLE et ne peut pas être utilisée telle quelle dans une colonne générée.

**Page `/admin/points-controle`** :
- Barre de recherche en haut (icône loupe lucide, bouton d'effacement, spinner pendant la frappe), full-text Supabase avec debounce 250 ms — aucun rechargement de page.
- Filtres en cascade : **Famille** (1er niveau, 12 options) → **Catégorie** (2e niveau, désactivée tant qu'aucune famille n'est choisie, limitée aux catégories de la famille) → **Thème** (3e niveau) → **Statut**.
- Badge de famille coloré sur chaque point, en plus des badges catégorie / thème existants.
- Le `select()` liste explicitement les colonnes pour ne pas rapatrier `search_vector`.
- Les thèmes ne sont plus chargés tant qu'aucune catégorie n'est sélectionnée (auparavant les 442 thèmes partaient à chaque montage pour alimenter un select désactivé).
- Le badge catégorie est masqué lorsqu'il porte le même libellé que la famille (Dispositions générales, Démolition & Désamiantage).

**Miroirs applicatifs** (`src/lib/utils/familles.ts`, `src/lib/utils/mots-cles.ts`) : la correspondance catégorie → famille et la génération de mots-clés existent en TypeScript pour que les points créés depuis le formulaire admin ou l'import Excel soient renseignés comme ceux de la migration. Toute catégorie non répertoriée retombe sur « Autres ».

> Depuis la migration 038, un trigger `points_controle_famille_trg` renseigne `famille` en base quand elle est absente (déduite du libellé de la catégorie, « Autres » par défaut). Les miroirs applicatifs restent la source principale ; le trigger est le filet pour les écritures qui les contournent. `mots_cles` n'est en revanche **pas** couvert par le trigger et reste à la charge de l'appelant.

**Recherche côté client** : la saisie est convertie en tsquery à préfixe (`echa:*`) ; le découpage sur les caractères non alphanumériques neutralise au passage les opérateurs de la syntaxe tsquery.

### Débordement de la nav dashboard en tablette (2026-08-27)

**Problème** : sur toutes les pages du dashboard, un **administrateur** faisait déborder la page de 188 px à 768 px. La bascule barre horizontale / menu déroulant était fixée à `md` (768 px), alors que les 6 liens du rôle administrateur ne tiennent pas dans cette largeur. Les rôles `inspecteur` (2 liens) et `invité` (3 liens) n'ont jamais été concernés.

**Mesures** (à 1024 px, largeur utile 986 px) : logo 140 px + liens **638 px** + zone utilisateur 217 px + gouttières 32 px = **1027 px requis**. Il manquait 41 px.

**Correction** dans `src/app/(dashboard)/nav.tsx` — le seuil dépend désormais du nombre de liens du rôle :
- `links.length > 3` (administrateur) → barre horizontale à partir de `xl` (1280 px), soit 221 px de marge
- sinon (inspecteur, invité) → `md` (768 px) conservé, aucune régression pour eux
- `whitespace-nowrap` sur les liens : sans lui, « Points de contrôle » se cassait sur trois lignes quand la barre serrait
- `gap-4` entre les trois zones de la barre

> Les classes responsives sont construites par ternaire (`barreChargee ? "xl:flex" : "md:flex"`). Tailwind scanne le source en texte brut : les littéraux doivent rester écrits en entier, jamais assemblés (`` `${bp}:flex` `` ne serait pas généré). Présence vérifiée dans le CSS compilé.

**Vérifié** en session administrateur à 375 / 768 / 1024 / 1279 / 1280 / 1440 px : débordement nul et aucun élément écrasé partout, bascule exactement à 1280 px. Le cas inspecteur est établi par le calcul (577 px requis pour 736 px utiles à 768 px), faute de compte de test.

### Suivi des points résiduels (2026-08-27)

- **Trigger `famille` (FAIT, migration 038)** : `points_controle_famille_trg`, en `SECURITY INVOKER` (`categories` est lisible par tous les authentifiés, aucune élévation nécessaire). Testé par insertion réelle : catégorie « Grues & Levage » → `Engins & Levage`, catégorie nulle → `Autres`. Lignes de test supprimées, 487 points, 0 sans famille.
- **Nav rôle inspecteur (VÉRIFIÉ)** : mesuré en simulant le DOM du rôle (2 liens, seuil `md`) à 768 px — barre en `display:flex`, burger en `display:none`, mutuellement exclusifs, débordement nul, aucun écrasement. Largeurs : 140 (logo) + 188 (liens) + 217 (utilisateur) = 545 px pour 736 px utiles.
- **Worktree orphelin (NETTOYÉ)** : `.claude/worktrees/practical-buck` pointait vers un gitdir inexistant (`/Users/macbookairm4/…`), contenu figé au 29 mars, aucun fichier absent de `main`. Supprimé avec la branche locale `claude/practical-buck`.
- **Policy SELECT admin (FAIT, migration 037, appliquée manuellement depuis le SQL Editor Supabase)** : `pc_select_active` limitait la lecture à `actif = true` pour tous, administrateurs compris — désactiver un point le faisait disparaître de l'admin sans moyen de le réactiver. La policy permissive `pc_select_admin` (`user_role() = 'administrateur'`) s'ajoute en OR : les non-administrateurs restent limités aux points actifs. Cycle complet validé en production sur un point de test temporaire (créé inactif → visible sous « Désactivés uniquement » → bouton « Réactiver » fonctionnel → point supprimé). Base revérifiée : 487 points, 487 actifs, 0 sans famille, 0 résidu.

### Audit de sécurité v4 (2026-08-28)

Audit complet : application, dépendances, base de données, en-têtes.

**SSRF sur deux routes d'export (élevé, CORRIGÉ)** — `photos/export` et `rapports/export` téléchargeaient des URL issues de la base sans `isAllowedSupabaseUrl()`, alors que `documents/email` et `photos/analyze` l'appliquaient. Or `reponses.photos` et `visites.rapport_url` restent modifiables par un inspecteur via l'API REST : il pouvait y écrire une URL arbitraire et faire émettre au serveur une requête vers une cible interne, déclenchée à son insu par un administrateur lançant un export. Whitelist + timeout de 30 s ajoutés.

**Dépendances (élevé, CORRIGÉ)** — 19 vulnérabilités dont 7 hautes ramenées à 3 modérées, **aucune haute ni critique**. `npm audit fix` + override ciblé dans `package.json` : `"overrides": { "minimatch@3": { "brace-expansion": "^1.1.18" } }` (DoS via eslint ; la 5.x transitive n'est pas concernée, d'où le ciblage). Les 3 modérées restantes (`@anthropic-ai/sdk`, `exceljs`/`uuid`) exigeraient un changement majeur — dont un **downgrade** d'exceljs qui réintroduirait la vulnérabilité SheetJS écartée en juillet. Écartées sciemment.

**Cloisonnement multi-entreprise (moyen, CORRIGÉ)** — `targetProfile.entreprise_id !== profile.entreprise_id` était contournable : `null !== null` vaut `false`, donc un administrateur sans entreprise pouvait modifier ou supprimer tout profil sans entreprise, hors de son organisation. Garde explicite sur `update-user` et `delete-user`.

**Écritures silencieuses (moyen, CORRIGÉ)** — `create-user` ne vérifiait ni l'upsert du profil ni le journal d'audit et renvoyait `success: true` quoi qu'il arrive ; un échec laissait un compte au rôle « invité » posé par `handle_new_user`. L'upsert est vérifié et le compte Auth supprimé en cas d'échec.

**Rate limiting (moyen, CORRIGÉ)** — ajouté sur 7 routes : `photos/export` et `rapports/export` (5/h), `stripe/checkout` et `stripe/portal` (10/h), `stripe/setup` (3/j), `push/subscribe` (30/h), `push/test` (10/h).

**`VAPID_PRIVATE_KEY` (faible, CORRIGÉ)** — lue via `process.env` sans la garde `requireServer()` ; passe par `getVapidPrivateKey()` dans `env.ts`.

**Base de données (migrations 039 et 040, APPLIQUÉES)** — `search_path` fixé sur les trois fonctions `SECURITY DEFINER` (sans quoi un objet homonyme dans un schéma prioritaire permettrait un détournement avec les droits du propriétaire), et retrait de l'exposition RPC de `handle_new_user` et `prevent_user_self_role_change`, jusque-là appelables par `anon` via `/rest/v1/rpc/`.

> La 040 corrige la 039 : `revoke ... from anon` seul est **sans effet**, le privilège venant du pseudo-rôle `PUBLIC` dont `anon` hérite. Il faut révoquer sur `PUBLIC` puis ré-accorder explicitement.

Vérifié après application : triggers toujours activés (le privilège `EXECUTE` n'est contrôlé qu'à la création du trigger, pas à son déclenchement), RLS intacte, **advisors Supabase 10 → 2**.

**Restant, assumé** :
- `user_role()` reste exécutable par `authenticated` — le retirer casserait la RLS, les policies l'appellent dans le contexte de l'utilisateur.
- Protection contre les mots de passe compromis : à activer dans le dashboard Supabase (Authentication → Password security).

**Vérifié sain** : RLS active sur les 19 tables, toutes avec policies · signature du webhook Stripe · middleware à correspondance exacte · aucun `dangerouslySetInnerHTML`/`eval`/`innerHTML` · exports réservés aux administrateurs · validation des uploads · en-têtes complets (HSTS preload, `X-Frame-Options: DENY`, nosniff, Referrer-Policy, Permissions-Policy) · CSP stricte. `Permissions-Policy: camera=()` ne gêne pas la prise de photo : l'app utilise `capture="environment"` sur un `<input type="file">`, non soumis à cette politique.

### Rattachement des profils à l'entreprise (2026-08-28)

Les 3 profils de production avaient `entreprise_id = null` alors que l'entreprise FWN existait. Conséquences :
- `create-user` échouait systématiquement sur `if (!profile.entreprise_id)` — d'où l'**absence totale** de journaux `create_user` dans `audit_logs`, et le fait que les comptes existants avaient été créés via `/register` (donc en rôle « invité »).
- Le durcissement du cloisonnement ci-dessus aurait rendu `update-user` et `delete-user` inopérants.

Tous rattachés à FWN. ⚠️ L'`UPDATE` direct est **refusé par le trigger** `enforce_role_immutability` (« La modification de l'entreprise n'est pas autorisée ») : il faut passer par `set role service_role;`, l'exemption prévue par le trigger et déjà utilisée par les routes API côté serveur.

### Incident 502 — buffers proxy Nginx (2026-08-28)

**Symptôme** : 502 Bad Gateway pour les utilisateurs **connectés** uniquement. Un `curl` sans cookie répondait 200, le navigateur avec session tombait en 502 — d'où un diagnostic initial trompeur (« le site répond »).

**Cause** : aucune directive `proxy_buffer_*` n'était définie dans `/etc/nginx/sites-available/securionis`. Nginx utilisait donc les valeurs par défaut (4k/8k), insuffisantes pour les en-têtes de Next.js combinés aux cookies de session Supabase (JWT volumineux) :

```
upstream sent too big header while reading response header from upstream
```

**Correctif** appliqué dans les deux blocs `location /` (sauvegarde `.bak-AAAAMMJJ-HHMMSS` créée avant) :

```nginx
proxy_buffer_size 32k;
proxy_buffers 8 32k;
proxy_busy_buffers_size 64k;
```

Puis `nginx -t` et `systemctl reload nginx` (rechargement sans coupure).

**À savoir** :
- L'incident était **antérieur** au déploiement de l'audit v4 (première erreur à 00:21, déploiement à 00:56) — la corrélation temporelle était trompeuse.
- Après un `reload`, les anciens workers terminent leurs requêtes en cours avec l'**ancienne** configuration : quelques erreurs peuvent encore apparaître dans les secondes qui suivent, sans signifier que le correctif a échoué. Vérifier en générant du trafic authentifié puis en relisant l'horodatage de la dernière erreur.
- Symptôme voisin possible si les en-têtes grossissent encore : augmenter à 64k.

---

### Plans PE / EXE et onglets du chantier (2026-08-28)

**Objectif** : marquer un document de chantier comme *plan d'enquête publique* (PE) ou *plan d'exécution* (EXE), le versionner, et préparer leur comparaison.

**Base de données** (migration 041, table `documents`, appliquée) :
- `plan_type` text nullable, CHECK `'PE' | 'EXE' | NULL`
- `plan_version` integer nullable, CHECK `> 0`
- `parent_version_id` uuid nullable → `documents(id) ON DELETE SET NULL`, avec une garde anti-auto-référence
- index partiel `idx_documents_plan_type (chantier_id, plan_type) WHERE plan_type IS NOT NULL`

Aucune policy RLS à ajouter : les policies de `documents` (migration 022) portent sur la ligne entière et couvrent donc ces colonnes — écriture pour l'inspecteur assigné au chantier ou l'administrateur.

**Interface** (`src/components/chantier/document-manager.tsx`) :
- Menu `more_vert` par document : « Marquer comme plan PE / EXE » et « Retirer le marquage » (ce dernier seulement si le document est marqué).
- Le choix ouvre un champ « Numéro de version » pré-rempli avec la prochaine version libre du type (max + 1).
- `parent_version_id` est calculé côté client : dernier document du **même type** dont la version est inférieure. Pas de trigger DB.
- Badge `PE V{n}` (vert #2E7D32) / `EXE V{n}` (orange #E67E22) à côté du nom, plus deux bandeaux en tête de section : « Plan PE de référence » et « Plan EXE V{n} », qui suivent la version la plus élevée de chaque type.

**Onglets** (`src/components/chantier/chantier-tabs.tsx`) : la page chantier n'avait pas de navigation — Documents, Visites, Destinataires et NC étaient des sections empilées. Les sections Documents et Visites sont désormais le contenu des deux premiers onglets, `Comparaison` s'ajoute en troisième (`plan-comparaison.tsx`, écran « Bientôt disponible »). Informations, Destinataires, bandeau « NC corrigées » et Non-conformités restent hors onglets, à leur place.

Les panneaux inactifs sont rendus avec l'attribut `hidden` plutôt que démontés : l'état des composants clients survit au changement d'onglet.

> Deux pièges CSS rencontrés et corrigés lors de la vérification navigateur :
> - `overflow-x-auto` seul fait passer l'axe **Y** en `auto` ; combiné au `-mb-px` des onglets (1 px de débordement), il affichait une barre de défilement verticale parasite. D'où le `overflow-y-hidden`.
> - La ligne d'actions d'un document accueille désormais 4 boutons et débordait de l'écran en 375 px : `flex-wrap` est obligatoire.

⚠️ **Suppression d'un document** : `handleDelete` efface le fichier de stockage sans vérifier qu'aucun autre document ne référence la même `fichier_url`. Comportement préexistant, à garder en tête si des documents venaient à partager un fichier.

### Comparaison des plans PE / EXE (2026-08-28)

Page `/chantiers/[id]/comparaison` (`src/app/(dashboard)/chantiers/[id]/comparaison/page.tsx` + `src/components/chantier/comparaison-plans.tsx`). L'onglet « Comparaison » de la page chantier y renvoie.

**Dépendances ajoutées** : `openseadragon` (visualiseur) et `pdfjs-dist` (rendu des PDF). Toutes deux embarquent leurs types ; aucune vulnérabilité npm ajoutée.

**Pourquoi pdf.js** : OpenSeadragon n'affiche que des sources image, or **tous les plans de production sont des PDF**. `construireSource()` rend donc la page demandée dans un canvas, la convertit en blob et passe l'URL blob à OpenSeadragon (`tileSource: { type: "image", url }`). Les images (JPEG/PNG) sont passées directement. Tout autre format déclenche un message explicite.

**Superposition sans désynchronisation possible** : un **seul** viewer OpenSeadragon contenant deux `TiledImage`, chacune posée avec `width: 1` dans les coordonnées monde. Le zoom et la position sont donc partagés par construction — il n'y a aucun code de synchronisation entre deux viewers à maintenir.
- Superposition : les deux images à l'origine, celle du dessus reçoit l'opacité du curseur.
- Côte à côte (« Split view ») : l'image du dessus est déplacée en `x = 1.05`, les deux à 100 % (le curseur d'opacité est alors désactivé, et le dit).
- « Inverser les calques » : `world.setItemIndex()` échange l'ordre ; le libellé du curseur suit (« Opacité du plan PE / EXE »).

**PDF multi-pages** : `nbPages` est lu au rendu ; un sélecteur de page apparaît par plan dès qu'il y a plus d'une page (les dossiers réels font une douzaine de pages). Changer de page reconstruit la source de ce plan.

**Mémoire** : chaque rendu PDF crée une URL blob, révoquée au démontage de l'effet ; la tâche de chargement pdf.js est détruite via `tache.destroy()` (c'est `PDFDocumentLoadingTask` qui porte `destroy()`, pas `PDFDocumentProxy`). Le rendu vise `LARGEUR_RENDU_PDF` = 2400 px de large, plafonné à une échelle de 4.

**Worker pdf.js** : `GlobalWorkerOptions.workerSrc` est résolu par `new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url)` — pas de fichier vendu dans `public/`, et compatible avec la CSP (`worker-src 'self' blob:`).

> Pièges rencontrés :
> - OpenSeadragon zoome au **simple clic** par défaut. Insupportable pour un outil où l'on désigne des points : `gestureSettingsMouse/Touch: { clickToZoom: false }`, le double-clic et la molette suffisent.
> - `requestFullscreen()` peut être refusé (`TypeError: Permissions check failed` dans certains navigateurs embarqués). Le refus est désormais rattrapé et affiché, sinon le bouton paraît simplement inerte. La `Permissions-Policy` de l'app ne bloque pas `fullscreen`.

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
10. **`revoke ... from anon` est insuffisant** : les privilèges des fonctions viennent du pseudo-rôle `PUBLIC`, dont `anon` hérite. Révoquer sur `PUBLIC`, puis `grant` explicitement aux rôles nécessaires.
11. **Modifier `profiles.role` ou `profiles.entreprise_id`** exige `set role service_role;` — le trigger `enforce_role_immutability` refuse toute autre origine.
12. **Familles des points de contrôle** : `famille` est renseignée par le trigger `points_controle_famille_trg` (migration 038) si l'appelant ne la fournit pas ; `mots_cles` n'a pas d'équivalent et doit être fourni par l'appelant (`genererMotsCles()`).
13. **Plans PE/EXE** : `plan_type`, `plan_version` et `parent_version_id` sont renseignés uniquement côté application (aucun trigger). Le chaînage `parent_version_id` est calculé au marquage à partir des documents déjà chargés.
14. **pdf.js** : `destroy()` est porté par la tâche de chargement (`getDocument(...)`), pas par le document. Toute URL blob créée pour OpenSeadragon doit être révoquée au démontage.
15. **`updated_at` non auto-géré** : aucune table n'a de trigger PostgreSQL pour rafraîchir `updated_at` automatiquement — il faut le fixer explicitement dans chaque `.update(...)` qui en dépend (cf. `ecarts`, `visites`).

---

## ESLint

20 erreurs et 15 warnings connus (relevé du 2026-08-27, après suppression d'un worktree orphelin `.claude/worktrees/practical-buck` qui faisait scanner le code en double et gonflait le total à 34/27). Ne pas bloquer le développement sur ces erreurs existantes — les corriger progressivement.

```bash
npm run lint
```

Config : `eslint.config.mjs` (flat config ESLint 9, sans `FlatCompat`).
