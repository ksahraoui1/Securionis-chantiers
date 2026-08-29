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
import { getResendApiKey, getServiceRoleKey } from "@/lib/env";
// La garde côté serveur est portée par les getters eux-mêmes : `requireServer`
// est privée au module et prend (name, value). Appelé depuis le navigateur, le
// getter lève.
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
import { journaliser } from "@/lib/audit";

await journaliser({
  userId: user.id,
  action: "send_rapport_email",
  resource: "visites",              // ← "resource", pas "resource_type" !
  resourceId: visiteId,
  details: { sent_to: emails },     // ← "details", pas "metadata" !
});
```

Ne plus écrire dans `audit_logs` directement : depuis la migration 046 le rôle
`authenticated` n'en a plus le droit, et `journaliser()` vérifie son résultat.

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

**Branding FWN** (remplacé le 2026-08-28 par BTP-UP — voir plus bas) :
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

### Barre de menu horizontale et bouton Retour (2026-08-29)

Signalé en usage réel : en tablette, tout le menu de l'administrateur passait
sous le bouton burger et il fallait l'ouvrir à chaque page.

#### La barre cède ses libellés, plus jamais sa place

Le seuil de bascule barre / menu déroulant dépendait du **nombre de liens du
rôle** (correctif du 27 août) : `xl` (1280 px) pour l'administrateur et ses six
liens, `md` (768 px) pour les autres. À 1024 px — une tablette en paysage —
l'administrateur n'avait donc aucune barre.

La barre horizontale s'affiche désormais dès **768 px pour tous les rôles**. Ce
sont les **libellés** qui cèdent et non la barre : entre 768 et 1280 px, les
liens d'un rôle chargé se réduisent à leur icône, avec le libellé en `title` et
en `aria-label`. Le menu déroulant ne subsiste qu'en dessous de 768 px, où
aucune barre ne tient.

Mesuré à 768 px, rôle administrateur : les liens passent de **638 px** à
**308 px**, le nom de l'utilisateur cède avant eux (`xl` au lieu de `lg`) et le
bouton de déconnexion suit la même règle que les liens. Débordement nul de
375 px à 1440 px, bascule vérifiée à 767/768 px et 1279/1280 px.

> ⚠️ **La classe de visibilité ne peut pas être posée sur l'icône elle-même.**
> `.material-symbols-outlined` est déclarée **hors couche** dans `globals.css` ;
> son `display: inline-block` l'emporte donc sur les utilitaires Tailwind, qui
> sont dans une couche. `xl:hidden` sur un `<span class="material-symbols-outlined">`
> reste **sans effet** — l'icône et le libellé s'affichaient tous deux. La
> classe porte sur un `<span>` enveloppe.

#### Bouton Retour

Présent dans la barre sur toutes les pages connectées sauf le tableau de bord,
qui est la racine — l'emplacement y reste réservé pour que le logo ne sautille
pas d'une page à l'autre.

C'est un **retour hiérarchique**, pas un `history.back()` : en PWA installée sur
une tablette de chantier, il n'y a pas de bouton de retour du navigateur, et
l'historique peut tout aussi bien mener hors de l'application. Une page donnée a
donc toujours la même destination. C'est un vrai `<Link>` : préchargé, ouvrable
dans un nouvel onglet.

> Le parent **ne s'obtient pas** en retirant le dernier segment du chemin :
> `/chantiers/<id>/visites/nouvelle` remonterait sur `/chantiers/<id>/visites`,
> qui n'existe pas et rendrait un 404. La table de `src/lib/utils/navigation-retour.ts`
> est explicite, et l'infobulle nomme la destination (« Retour au chantier »,
> « Retour à la visite »…).

Vérifié sur les **19 routes** du groupe `(dashboard)` : chaque parent correspond
à une page existante, aucun cycle, et un chemin inconnu retombe sur
`/dashboard` plutôt que de faire disparaître le bouton.

Les liens « Retour au chantier » déjà présents dans le corps de trois pages
(NC, préparation de visite, comparaison) sont **conservés** : ils nomment leur
destination, ce que l'icône de la barre ne fait pas.

`CACHE_VERSION` passe à `v6` dans `public/sw.js` — la barre vit dans le layout,
donc dans **toutes** les pages mises en cache par le Service Worker.

#### Découvert au passage : `tailwind.config.ts` n'est jamais chargé

Tailwind v4 ne lit plus la configuration JavaScript automatiquement ; il faut
une directive `@config` dans le CSS, absente de `globals.css`. Les extensions du
fichier sont donc **toutes inertes** : `min-h-touch` et `min-w-touch`, utilisées
**191 fois** dans l'application, ne produisent aucune règle, et la garantie de
44 × 44 px des éléments tactiles n'est appliquée nulle part. Les couleurs
personnalisées (`conforme`, `ecart-ouvert`…) sont inertes elles aussi, mais
aucune n'est utilisée.

La barre et le bouton Retour posent donc leurs cibles **en dur**
(`min-h-[44px]`). Le reste n'a pas été touché : rétablir `@config` activerait
d'un coup les 44 px sur 191 éléments et déplacerait des mises en page dans toute
l'application — c'est un changement à mener et à vérifier pour lui-même.

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

### SEC-01 — écriture sur les chantiers ouverte à tout compte (2026-08-29)

Trouvé en audit, corrigé par la **migration 045, appliquée**.

`chantiers_inspecteur_update` était définie `USING (true) WITH CHECK (true)`
pour le rôle `authenticated`. Une politique permissive s'ajoute aux autres en
**OU** : celle-ci ne restreignait donc rien. Tout porteur d'un jeton
`authenticated` pouvait écrire sur n'importe quelle ligne de `chantiers` —
renommer, réaffecter `created_by`, archiver les douze en une requête.

`/register` étant publique, obtenir ce jeton ne demandait ni mot de passe volé
ni accès administrateur : un compte créé en ligne, la clé anonyme (publique par
nature) et un `PATCH` sur `/rest/v1/chantiers`. La lecture restait fermée —
c'était une atteinte à l'**intégrité et à la disponibilité**, pas à la
confidentialité.

La politique porte désormais le périmètre voulu : le créateur du chantier, ou
l'inspecteur qui y est rattaché. `chantiers_admin_all` couvre l'administrateur.

**Un trigger complète la politique** : `enforce_chantier_owner_immutability`
fige `created_by`. Sans lui, la brèche subsistait en petit — un inspecteur
rattaché satisfait la clause `exists`, donc son `WITH CHECK` passe **quelle que
soit la valeur qu'il donne à `created_by`**, ce qui lui permettrait de désigner
un compte arbitraire comme créateur et de lui accorder du même coup le droit
d'écriture que cette colonne confère. Une politique RLS ne peut pas comparer
NEW et OLD ; il faut un trigger. Même forme que `enforce_role_immutability` :
`service_role` en est exempté, les routes API serveur restent libres.

> Vérifié avant écriture : `chantier-form.tsx` et `archive-toggle-button.tsx`,
> les deux seuls écrivains de la table, n'envoient jamais `created_by`.

**Vérification, jouée en production dans une transaction annulée** (rôle
`authenticated` endossé, `request.jwt.claims` posés, `raise exception` final) :

| Acteur | Tentative | Lignes touchées |
|---|---|---|
| invité | archiver tous les chantiers | **0** (avant : 12) |
| invité | renommer tous les chantiers | **0** |
| inspecteur non rattaché | renommer | **0** |
| administrateur | écrire | **12** — aucune régression |
| administrateur | réaffecter `created_by` | **refusé par le trigger** |

Données revérifiées après coup : 12 chantiers, aucun nom `PIRATE`, 1 archivé,
1 créateur distinct. Puis modification réelle d'un chantier depuis le
formulaire, en session administrateur : enregistrée sans erreur.

#### Une écriture refusée par la RLS ne lève pas d'erreur

C'est le corollaire qu'il faut retenir : PostgREST ne renvoie **aucune erreur**
quand la RLS écarte les lignes visées — l'`UPDATE` n'en touche simplement
aucune. Sans `.select()`, un refus est **indiscernable d'un succès**.

`archive-toggle-button.tsx` ne vérifiait rien du tout, et `chantier-form.tsx`
ne vérifiait que `error`. Les deux ajoutent désormais `.select("id")` et
traitent le tableau vide comme un refus, avec un message qui dit quoi faire
(« demandez à un administrateur de vous y rattacher »). Sans cela, resserrer la
politique aurait transformé un trou de sécurité en bug silencieux.

### SEC-02 — le journal d'audit était falsifiable (2026-08-29)

`audit_logs_insert` était définie `WITH CHECK (true)` pour le rôle
`authenticated` : n'importe quel compte connecté pouvait insérer une ligne
arbitraire dans le journal.

L'impact n'est pas théorique. La page rapport d'une visite affiche son
historique d'envoi en lisant `audit_logs` filtré sur `(action, resource_id)` :
un tiers pouvait donc y faire apparaître des envois qui n'ont jamais eu lieu,
**sur une visite qui ne lui appartient pas**. Sur une application dont les
rapports peuvent être produits après un accident, la traçabilité est
précisément ce qu'on demande au journal.

#### `journaliser()` — un seul point d'écriture

`src/lib/audit.ts`. Les **huit** sites d'écriture y passent désormais. Deux
apports :

- **Le journal n'est plus falsifiable** : l'écriture se fait par le
  `service_role`, qui contourne la RLS et n'existe que côté serveur.
- **Un échec cesse d'être silencieux** : aucun des huit appels d'origine ne
  vérifiait son résultat — c'est ainsi que trois d'entre eux ont écrit pendant
  des semaines dans une colonne `resource_type` inexistante sans que rien ne le
  signale. `journaliser()` vérifie le retour et journalise l'échec côté
  serveur (donc dans Sentry quand un DSN est configuré), sans jamais lever :
  une action métier réussie ne doit pas échouer parce que sa trace n'a pas pu
  être écrite.

> Vérifié avant conversion : les huit renseignaient déjà `user_id` avec
> l'utilisateur authentifié, et **aucun composant client n'écrit** dans cette
> table — les écritures étaient toutes dans des routes API.

#### Migration 046 — **appliquée**

Elle retire la politique d'insertion, révoque `insert/update/delete/truncate`
à `anon` et `authenticated`, et ajoute un trigger d'ajout seul qui couvre aussi
le `service_role` (protection contre une route serveur compromise), en
exemptant `postgres` et `supabase_admin` pour qu'une purge de conservation
reste possible depuis une migration.

> ⚠️ **L'ordre de déploiement comptait** et a été respecté : le code est parti
> en production d'abord. Appliquer 046 avant lui aurait fait échouer
> silencieusement les cinq écritures qui utilisaient encore le client
> utilisateur.

**Vérification, jouée en production dans une transaction annulée :**

| Rôle | Opération | Résultat |
|---|---|---|
| `authenticated` | INSERT | **refusé** — SQLSTATE 42501, privilège insuffisant |
| `service_role` | INSERT | accepté — le chemin de `journaliser()` fonctionne |
| `service_role` | UPDATE | **refusé** par le trigger |
| `service_role` | DELETE | **refusé** par le trigger |
| `postgres` | DELETE | accepté — la purge de conservation reste possible |

Le refus côté `authenticated` est un **défaut de privilège**, pas un refus RLS :
il n'y a plus de politique d'insertion *et* plus de droit d'écriture. Journal
revérifié après annulation : 170 entrées, aucun résidu de test.
`SUPABASE_SERVICE_ROLE_KEY` confirmée présente dans le conteneur de production —
sans elle, `journaliser()` échouerait en silence.

> Note : un trigger `for each statement` ignore sa valeur de retour — seul un
> `raise` interrompt la commande, `return null` laisse passer.

#### Correction de documentation au passage

Ce fichier documentait `requireServer()` comme un export de `src/lib/env.ts`
appelable sans argument. C'est faux : la fonction est **privée** et prend
`(name, value)`. La garde côté serveur s'obtient en passant par les getters —
`getServiceRoleKey()`, `getResendApiKey()`… — qui l'appellent en interne.

### FONC-01 — un inspecteur ne voyait aucun chantier (2026-08-29)

Trouvé en audit. Migration **047 appliquée**.

Tout l'accès non-administrateur passe par `chantier_inspecteurs` : **21
politiques sur 8 tables** en dépendent. Or la table était **vide** — 12
chantiers, **0 visible** pour le profil `inspecteur` de production. Trois
défauts concouraient à ce qu'elle le reste : aucune politique `INSERT` pour un
inspecteur (l'auto-rattachement de `chantier-form.tsx` était donc
*systématiquement* refusé), le résultat de cette insertion n'était pas vérifié,
et la lecture n'avait aucun repli. Passé au travers de quatre audits parce que
les 12 chantiers et 90 visites ont tous été créés par l'administrateur, pour qui
`chantiers_admin_all` ouvre tout.

#### ⚠️ `INSERT ... RETURNING` évalue la politique **SELECT**

Le point que je n'avais pas prévu, et qui a fait échouer ma première version.
Mesuré sur la production :

| Montage | Résultat |
|---|---|
| trigger `AFTER` + `insert … returning` | **échec** — violation RLS |
| trigger `AFTER` sans `returning` | OK |
| trigger `BEFORE` + `insert … returning` | **échec** — clé étrangère |

`RETURNING` fait relire la ligne insérée, **avant** que le trigger `AFTER`
n'ait créé la liaison. En `BEFORE`, la ligne du chantier n'existe pas encore et
la clé étrangère saute. Aucune position de trigger ne fonctionne — or
`chantier-form.tsx` fait exactement `.insert(...).select("id").single()`.

> Le message est trompeur : PostgreSQL dit « new row violates row-level
> security policy », ce qui fait penser au `WITH CHECK` de l'insertion, alors
> que c'est la politique de **lecture** qui refuse.

Le repli `created_by` en lecture n'est donc pas un confort mais une nécessité.

#### Le modèle retenu

**On voit ce qu'on a créé, on ne modifie que ce à quoi on est rattaché.**

- Trigger `chantier_rattacher_createur` (`SECURITY DEFINER`, `AFTER INSERT`) :
  le créateur est rattaché automatiquement. L'inspecteur n'a toujours pas le
  droit d'écrire dans la table de liaison — attribuer *un autre* inspecteur
  reste réservé à l'administrateur.
- Rattrapage des 12 chantiers existants.
- Lecture : liaison **ou** `created_by`. Écriture : liaison seule.

En pratique les deux coïncident ; ils ne divergent que si un administrateur
retire délibérément quelqu'un — qui continue alors de **voir** le chantier
qu'il a créé sans pouvoir le modifier, ni toucher à ses visites, écarts ou
documents, dont les politiques ne connaissent que la liaison.

L'insertion cliente dans `chantier_inspecteurs` est retirée de
`chantier-form.tsx` (elle était toujours refusée), et la prop `userRole`
devenue morte a été retirée du composant et de ses deux appelants.

#### Vérification, en production, dans une transaction annulée

| Scénario | Résultat |
|---|---|
| rattrapage | 12 liaisons |
| `insert … returning` par l'inspecteur (chemin réel de l'app) | OK |
| chantiers vus par l'inspecteur | 1 — le sien |
| liaison créée par le trigger | 1 |
| il modifie son chantier | 1 ligne |
| il modifie celui d'un autre | **0 ligne** |
| il se rattache au chantier d'un autre | **refusé** (42501) |
| après attribution par l'admin | 2 chantiers, 13 visites, 19 écarts, 4 documents |
| administrateur | 13 chantiers, 90 visites — aucune régression |

Base revérifiée après annulation : 12 chantiers, 0 liaison, aucun trigger, aucun
résidu.

#### Après application, sur la base migrée

12 chantiers, **12 liaisons**, aucun chantier orphelin, trigger actif. Scénario
rejoué sur la base telle qu'elle est désormais : l'inspecteur voit 0 chantier
avant attribution, crée le sien par `insert … returning` (le point de rupture
d'avant), reçoit sa liaison du trigger, le modifie, et ne modifie pas celui d'un
autre ; l'administrateur garde ses 13 chantiers.

> ⚠️ **La migration répare le mécanisme, pas l'attribution.** Le rattrapage lie
> chaque chantier à son créateur — l'administrateur pour les douze. Un
> inspecteur existant ne voit donc toujours rien tant qu'il n'a pas été
> attribué depuis `/chantiers/<id>/modifier`. C'est une décision métier, pas un
> défaut.

#### Confirmation de bout en bout de SEC-02, au passage

Un écart de comptage pendant la vérification — 89 visites au lieu de 90 —
s'expliquait par une **suppression réelle faite depuis l'application** en cours
de session. L'entrée `delete_visite` correspondante est bien au journal, avec
auteur et détails : `journaliser()` écrit correctement en production, par le
`service_role`, sur une table où `authenticated` n'a plus aucun droit
d'écriture. Les deux corrections tiennent ensemble.

### SEC-03 — les buckets ne sont plus publics (2026-08-29)

`rapports` (241 objets, 258 Mo) et `visite-photos` (120 objets, 115 Mo) étaient
`public = true` : n'importe qui connaissant une URL téléchargeait un rapport
d'inspection ou une photo de chantier — donc des personnes au travail
identifiables, associées à un employeur, une date, un lieu et un constat de
non-conformité.

#### Deux prémisses fausses levées

La décision de juillet reposait sur deux affirmations que la mesure contredit :

- **Aucun email ne contient d'URL de stockage.** Rapports et documents partent
  en pièce jointe ; le seul lien présent pointe vers l'application. **Rien ne
  casse rétroactivement** pour les destinataires — c'était le risque principal.
- **Le logo n'est utilisé dans aucun email** : aucun `<img>` dans les
  templates. C'était pourtant l'argument qui avait fait renoncer au passage en
  privé (« une URL signée expire en 1 h, le logo serait cassé »). Il n'est
  affiché qu'aux utilisateurs connectés et intégré aux PDF côté serveur. **Le
  bucket public `assets-email` que proposait l'audit est donc inutile.**

#### Les URL stockées deviennent des identifiants

`src/lib/utils/url-signee.ts` : `signerUrl`, `signerUrls` (un appel par bucket,
une visite peut porter des dizaines de photos), `decomposerUrlStockage`,
`canoniserUrlStockage`.

Les URL en base gardent leur forme publique — elles n'y sont plus qu'un
**identifiant**, retraduit en URL signée au moment de la lecture. **Aucune
migration de données.** Les `getPublicUrl` restants sont tous des chemins
d'écriture, ce qui est voulu.

> ⚠️ **Une URL signée ne doit jamais être écrite en base.** Deux valeurs font
> un aller-retour par le navigateur — `reponses.photos` et
> `entreprises.logo_url` : servies signées pour l'affichage, elles
> reviendraient telles quelles au prochain enregistrement, et la base se
> remplirait d'URL mortes sans que rien ne le signale avant le lendemain. D'où
> `canoniserUrlStockage()`, appliquée dans `use-autosave`, `offline/sync` et la
> page entreprise.

> ⚠️ `extractStoragePath()` retirait mal la chaîne de requête : sur une URL
> signée, le chemin extrait aurait porté `?token=…` et la **suppression** aurait
> visé un objet inexistant — sans erreur. Corrigé.

Points de lecture traités : logo (nav, PDF de visite, rapport de comparaison),
documents de chantier, base documentaire, documents de points de contrôle,
plans de la comparaison (chargés par pdf.js **dans le navigateur**), photos de
visite (existantes et fraîchement prises), capture d'une NC, exports ZIP et
envois par email.

#### Le cloisonnement, plus important que le passage en privé

Rendre un bucket privé n'écarte que les inconnus. Les politiques de lecture
disaient `bucket_id = '…'` : tout compte connecté pouvait signer n'importe quel
objet, y compris les photos d'un chantier qui ne le concerne pas.

> ⚠️ Il y avait **deux** politiques `SELECT` par bucket, une héritée et une
> récente, toutes deux permissives. Les politiques permissives s'additionnent
> en OU : en laisser une annulerait tout le cloisonnement. Les deux sont
> supprimées et remplacées par une seule.

Relevé des chemins réels avant d'écrire la règle : `visite-photos` a
**toujours** un identifiant de chantier en premier dossier ; `rapports` mêle du
référentiel partagé (`base-documentaire/`, `points-controle/`, `logos/`), des
documents de chantier sous `chantiers/<id>/…` — identifiant au **deuxième**
niveau — et des rapports de visite sous `<id>/…`.

**Vérification, en production, dans une transaction annulée :**

| | photos | rapports |
|---|---|---|
| inspecteur non rattaché | **0** | **86** — le référentiel seul (76 + 9 + 1) |
| rattaché à Orllati | **12**, dont **0** d'un autre chantier | **128** = 86 + 10 rapports + 32 plans |
| administrateur | 120 | 241 |

Buckets encore publics après migration : **0**.

#### Migration 048 — ⚠️ à appliquer **après** le déploiement du code

Les URL en base sont de forme publique et c'est le code qui les signe. Sur
l'ancien code, tout affichage d'image ou de document casserait. L'ordre est
l'inverse de celui de la migration 045, et le même que celui de la 046.

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

#### Réglage des opacités, recalage et compteur (2026-08-28)

**Deux opacités indépendantes** (`opacitePE`, `opaciteEXE`, défaut 100 / 50) plutôt qu'une seule valeur sur le calque du dessus : les préréglages demandés (« PE 75 % / EXE 25 % ») supposent que les deux calques soient réglables. Conséquence à connaître : le fond du visualiseur est passé en `bg-gray-100`. Sur l'ancien fond sombre, un plan à 50 % virait au gris sale au lieu de s'estomper.

Le panneau fournit la lecture en direct (« Plan PE : x % — Plan EXE : y % »), des boutons −/+ au pas de 5 % bornés à [0, 100], « Reset » (50/50), « Basculer » (alterne PE seul ↔ EXE seul) et cinq pastilles de préréglage qui s'activent quand les valeurs correspondent. En vue côte à côte, tout ce panneau est désactivé et le dit — les deux plans y sont à 100 %.

**Le cadenas ne synchronise rien** : la synchronisation est structurelle (un seul viewer), rien ne peut dériver. Le bouton sert au **recalage** de deux plans qui ne se superposent pas exactement :
- verrouillé (défaut) : le glissement déplace la vue, les deux plans ensemble ;
- déverrouillé : le gestionnaire `canvas-drag` met `event.preventDefaultAction = true` et déplace le seul calque du dessus (`deltaPointsFromPixels` puis `setPosition`). Le décalage est mémorisé dans `decalageRef` pendant le glissement, puis commité en état sur `canvas-drag-end` — sans quoi `appliquerCalques()` le remettrait à zéro au prochain changement d'opacité. Un bouton de recentrage apparaît dès qu'un décalage existe.

Le cadenas est désactivé en vue côte à côte. Le décalage s'applique toujours au calque du dessus : inverser les calques transfère donc le décalage à l'autre plan.

> Les gestionnaires OpenSeadragon sont enregistrés **une seule fois**, à l'initialisation du viewer : ils lisent les réglages courants via `etatRef` (miroir de `synchro`, `split`, `inverse`), jamais via la fermeture, qui serait figée sur le premier rendu.

**Compteur de différences** : simple entier de session (`+` et remise à zéro visible à partir de 1), affiché en haut à droite de la barre d'outils. Aucune détection automatique, aucune persistance en base.

#### Annotations sur la comparaison (2026-08-28)

**Deux tables** (migration 042, appliquée) :
- `comparaisons` — la « session de comparaison » : le couple `(chantier, document PE, page PE, document EXE, page EXE)`, sous contrainte d'unicité. Elle n'existait pas ; les annotations avaient besoin d'un ancrage stable pour réapparaître au bon endroit. Elle est créée à la volée au premier chargement d'un couple de plans (select puis insert, avec reprise sur conflit si un autre onglet a gagné la course).
- `comparaison_annotations` — `type`, `x`, `y`, `width`, `height`, `color`, `commentaire`, `created_by`, contraintes CHECK sur `type` et `color`.

RLS calquée sur celle des documents : lecture et écriture pour l'inspecteur assigné au chantier ou l'administrateur, via une jointure sur `comparaisons`. La suppression suit le même périmètre (et non « administrateur seulement » comme pour les documents) : le bouton de suppression est par annotation, il doit fonctionner pour celui qui annote.

**Coordonnées en unités monde OpenSeadragon** (le plan PE fait 1 de large, origine à son coin supérieur gauche), et non en pixels. C'est ce qui rend le repositionnement exact au rechargement, quels que soient le zoom, la taille de l'écran et la résolution des plans.

**Rendu** : une seule couche SVG superposée au visualiseur, dont le groupe porte `translate(...) scale(...)` recalculé sur les événements `update-viewport` et `resize`. Les traits utilisent `vector-effect="non-scaling-stroke"` pour rester lisibles à tout zoom ; les pastilles de numéro et la poignée de redimensionnement sont dimensionnées en `1 / échelle` pour garder une taille constante à l'écran.

**Interactions** :
- outil de dessin actif → `setMouseNavEnabled(false)`, la couche capte les pointeurs ; outil « Main » → la couche est en `pointer-events: none`, seules les formes restent cliquables pour être sélectionnées et déplacées ;
- le déplacement et le redimensionnement passent par un aperçu local, commité en base au relâchement ;
- les formes de type `rect` utilisent `fill="transparent"` et non `fill="none"` : sans cela, l'intérieur ne reçoit aucun événement et la forme n'est attrapable que par son trait ;
- la flèche conserve une largeur/hauteur **signée** (le delta depuis son origine), les autres formes sont normalisées en positif.

> Piège React rencontré : après création d'une étiquette de texte, `setTimeout(..., 0)` pour focaliser son champ de commentaire ne fonctionne pas — la ligne n'est pas encore rendue. Il faut passer par un état (`idAFocaliser`) et un `useEffect`, qui s'exécute après la mise à jour du DOM.

**Export** : bouton « Exporter les annotations » → fichier JSON contenant l'horodatage, le chantier, la session, les deux plans avec version et page, le repère de coordonnées et la liste numérotée des annotations.

#### Non-conformité créée depuis une annotation (2026-08-28)

Bouton « Créer une NC » sur chaque annotation de la comparaison → modale pré-remplie → NC dans la liste du chantier et dans le compteur du tableau de bord, page de détail dédiée.

**Le modèle de NC a dû évoluer** (migration 043). Jusque-là, `ecarts.reponse_id` était **NOT NULL** : toute NC dérivait d'une réponse de checklist dans une visite. Une NC née d'une annotation de plan n'a ni visite ni réponse. La colonne est donc devenue nullable, sous contrainte `ecarts_origine_check` (`reponse_id IS NOT NULL OR type = 'ecart_plan'`), afin qu'une NC sans réponse soit forcément une NC de plan.

> Audit des consommateurs, fait avant la migration : le rapport de visite (`rapport/page.tsx`) et le PDF filtrent par identifiants de réponses connus — les NC de plan en sont correctement exclues ; le tableau de bord tolérait déjà l'absence de correspondance et les range sous « Sans thème » ; l'export XLSX les traite génériquement. Aucun code n'a eu à changer.

Colonnes ajoutées à `ecarts` : `titre`, `type` (`'ecart_plan'`), `priorite` (`haute` / `moyenne` / `basse`) et `numero`, un entier d'identité qui donne enfin un numéro lisible aux NC (« NC #79 ») — les 77 NC existantes ont été numérotées par ordre de création.

**`comparaison_nc_links`** relie une annotation à sa NC et porte `capture_url`. Les plans comparés ne sont pas dupliqués sur la NC : on remonte `nc_id → annotation_id → comparaison_id → documents + pages`.

**Le bleu n'est pas stocké.** L'annotation liée à une NC s'affiche en bleu et porte le badge « NC #n », mais sa couleur en base reste celle de la gravité : l'état « liée » se déduit du lien. Ajouter `'blue'` à la contrainte de couleur aurait écrasé l'information de gravité.

**Capture de la zone annotée** : le canevas OpenSeadragon est découpé autour de la boîte de l'annotation, avec marge, et le contour de la forme y est retracé (la couche SVG des annotations n'est pas dans ce canevas). Le visualiseur est passé en `crossOriginPolicy: "Anonymous"` pour que le canevas reste exportable.

> **Bucket** : la capture PNG part dans **`visite-photos`**, avec le chantier en première composante du chemin (`<chantierId>/comparaisons/<uuid>.png`) pour rester dans le périmètre de la policy de suppression du bucket. C'était à l'origine une contrainte — `rapports` n'acceptait alors que les PDF — devenue un choix : une image reste à sa place dans le bucket d'images.

**Page de détail d'une NC** : `/chantiers/[id]/nc/[ncId]` — elle n'existait pas, les NC n'étaient qu'une liste. Section « Plan comparé » avec les versions PE/EXE, la capture et un lien « Voir la comparaison » qui recharge le même couple via les paramètres `?pe=&exe=` lus par la page de comparaison.

### Branding BTP-UP (2026-08-28)

Le pied de page passe de « FWN - Securionis » à **BTP-UP**, partout où la marque est affichée :

| Fichier | Emplacement |
|---|---|
| `src/app/(dashboard)/layout.tsx` | pied de page des pages connectées |
| `src/app/(auth)/layout.tsx` | pied de page de la page de connexion |
| `src/app/api/docs/manual/route.ts` | page de garde et pied du manuel Word |
| `src/app/(dashboard)/admin/entreprise/page.tsx` | exemple du champ « Nom de l'entreprise » |

Deux occurrences de « FWN » restent volontairement :
- le commentaire de `src/components/pdf/rapport-visite.tsx` (« comme le PDF FWN ») désigne le document dont le gabarit s'inspire, pas la marque affichée ;
- le **nom de l'entreprise en base** (table `entreprises`), auquel les 3 profils sont rattachés. Il alimente la signature des emails et le pied des PDF de visite, et se modifie depuis `/admin/entreprise` — pas dans le code.

#### Export, impression et partage de la comparaison (2026-08-28)

Trois sorties depuis la barre d'outils de la comparaison : un menu **Exporter** (PNG / PDF), un bouton **Imprimer** et un bouton **Partager** par email.

**La capture PNG est composée à la main**, pas prise par `html2canvas` (`src/lib/utils/comparaison-capture.ts`). Deux raisons de fond :
- **Tailwind v4 écrit toute sa palette en `oklch()`**, que html2canvas 1.4.1 ne sait pas analyser — il lève « Attempting to parse an unsupported color function ». Le conteneur du visualiseur porte `bg-gray-100` : la capture échouerait dès le premier appel.
- La vue n'est de toute façon que **deux éléments superposés** — le canevas d'OpenSeadragon (les deux plans avec leurs opacités) et la couche SVG des annotations. Les recomposer directement donne la **résolution native** du canevas (2× sur écran HiDPI) là où html2canvas rendrait au mieux à la résolution CSS.

La couche SVG est rasterisée en la sérialisant vers une URL blob chargée dans un `<img>`. Elle est étirée en CSS et **n'a donc aucune dimension intrinsèque** : sans `width`, `height` et `viewBox` explicites posés sur le clone, un `<img>` ne sait pas à quelle taille la rendre. Une pile de polices générique est imposée sur le clone, les polices de la page n'étant pas chargées dans un SVG rendu par `<img>`.

Le canevas d'OpenSeadragon est **transparent** là où aucun plan ne couvre : le fond est peint en blanc avant tout dessin, sans quoi l'image exportée serait illisible. Avant chaque capture, l'annotation sélectionnée est désélectionnée puis on attend deux `requestAnimationFrame` — les poignées de redimensionnement ne doivent pas figurer dans l'export.

**Rapport PDF** : `POST /api/comparaisons/[id]/pdf` reçoit **uniquement l'image** ; les annotations sont **relues en base** côté serveur, jamais reprises du corps de la requête. Trois pages (`src/components/pdf/rapport-comparaison.tsx`) : page de garde, vue de la comparaison **en A4 paysage** (les plans sont larges), puis tableau des annotations, total, date de génération et signature.

> La hauteur du cadre d'image est fixée **en points** (470). Avec `flexGrow: 1`, react-pdf avertit « Node of type IMAGE can't wrap between pages and it's bigger than available page height » : une image ne peut pas se couper entre deux pages et la hauteur du conteneur n'est pas résolue avant sa mise en page.

**Impression** (`src/lib/utils/comparaison-impression.ts`) : un `<iframe srcdoc>` masqué, puis `contentWindow.print()`. Le nettoyage (retrait de l'iframe, révocation de l'URL blob) attend `afterprint`, avec un filet à 120 s pour les navigateurs qui ne l'émettent pas. Vérifié : `about:srcdoc` n'est pas bloqué par la CSP `frame-src 'self'`.

Le document imprimé tient sur **une page A4 paysage** (en-tête + capture), plus une seconde page pour le tableau des annotations quand il y en a.

> ⚠️ **La capture doit être bornée sur ses deux dimensions.** La première version utilisait `img { width: 100%; height: auto }` : sur les 277 mm de large utiles et un ratio de capture 944/844, l'image réclame **248 mm de haut** pour 190 disponibles. Résultat imprimé : page 1 quasi vide (l'image ne tient pas sous le titre), image coupée entre les pages 2 et 3. `max-width: 100%` **et** `max-height` en millimètres.
>
> Valeur de rupture mesurée avec Chrome (`--headless --print-to-pdf`, en-têtes navigateur activés) : à **176 mm** la capture bascule sur une seconde page. La constante est fixée à **168 mm**, soit 8 mm de sécurité.
>
> `print-color-adjust: exact` est indispensable : sans lui les navigateurs suppriment les aplats à l'impression et les pastilles de couleur disparaissent.

Les en-têtes et pieds de page du navigateur (date, URL, numéro de page) ne peuvent pas être désactivés depuis la page — c'est un réglage de la boîte d'impression. Le message de statut le rappelle à l'utilisateur.

**Partage par email** : `POST /api/comparaisons/[id]/email` reprend le chemin de `documents/email` — capture PNG en pièce jointe, lien `?pe=&exe=` vers la même vue, garde-fous habituels (email valide, pas de CRLF, message ≤ 2000 caractères, `escapeHtml`), journal `send_comparaison_email`.

**Contrôles côté serveur communs aux deux routes** (`src/lib/utils/comparaison-rapport.ts`) : capture ≤ 20 Mo et **signature PNG vérifiée** (le type MIME annoncé par le navigateur ne suffit pas), `canAccessChantier()` en plus de la RLS, limites du plan (`canGeneratePdf`, `canSendEmail`) et rate limiting (10/h chacune).

Les libellés français des types et des couleurs d'annotation sont sortis dans `src/lib/utils/comparaison-libelles.ts` : le rapport PDF est généré côté serveur et **ne peut pas importer** `comparaison-annotations.tsx`, qui porte `"use client"`. La couche d'annotations consomme désormais ce module ; sa surface publique (`OUTILS`, `COULEURS`, `HEX_COULEURS`, `CouleurAnnotation`) est inchangée.

> **Aucune migration** : la fonctionnalité ne fait que lire `comparaisons`, `comparaison_annotations` et `comparaison_nc_links`, et écrire une ligne d'`audit_logs`.

#### Types de fichiers acceptés par le bucket `rapports` (2026-08-28)

Le durcissement de juillet (audit v3) avait restreint `rapports` à `application/pdf`. Or l'application autorise pdf, doc, docx, xls, xlsx, jpg, jpeg et png (`ALLOWED_MIME_TYPES` dans `file-validation.ts`) et écrit **tous** ces fichiers dans ce bucket. Conséquences, passées inaperçues pendant six semaines :

- documents de chantier (`document-manager.tsx`) : seuls les PDF passaient, tout le reste était rejeté en 400 — ce qui explique que les 24 documents en base soient tous des PDF ;
- base documentaire (`admin/documents`) : images rejetées ;
- **logo d'entreprise** (`admin/entreprise`) : cassé depuis juillet, et d'autant plus difficile à voir que le `catch` y remplace le message réel par un « Erreur lors de l'upload du logo » générique.

Migration 044 : le bucket accepte désormais exactement les sept types de la whitelist applicative. Le contrôle autoritaire reste la configuration du bucket ; il n'est pas relâché au-delà de ce que le code valide déjà (extension, type MIME, et magic bytes via `validateFileSignature`).

> Vérifié par un envoi réel : un PNG déposé sur le chemin de `document-manager` répond 200 là où il répondait 400.

### Détection automatique des différences — OpenCV.js (2026-08-28)

Bouton « Détecter les différences » dans la barre d'outils de la comparaison.
Pipeline : chargement des deux plans → niveaux de gris → CLAHE → alignement ORB
+ RANSAC → différence absolue → seuillage → morphologie → contours →
classification → filtrage du bruit.

**Trois modules**, tous côté client :
- `src/lib/opencv.ts` — chargement paresseux, mémorisé, réarmé après échec ; typage TypeScript de la surface utilisée (la bibliothèque n'en fournit aucun).
- `src/lib/plan-preprocessing.ts` — `convertToGrayscale`, `resizeToSameDimensions`, `alignPlans`, `normalizeBrightness`, plus `libererTout()` pour les blocs `finally`.
- `src/lib/plan-diff-detection.ts` — `detectStructuralDiffs`, `classifyDiff`, `filterNoise`, et le pipeline `analyserPlans()`.

**Aucune migration.** Le résultat n'est pas persisté : c'est une analyse de session.

#### Le CDN est impossible, et la copie locale ne suffisait pas

`script-src 'self'` interdit `docs.opencv.org` ; l'autoriser reviendrait à
exécuter du code tiers sur une page qui porte la session Supabase. La
bibliothèque est donc **servie localement** depuis `/vendor/opencv`, préparée
par `public/vendor/opencv/preparer.mjs` (script reproductible, empreintes
vérifiées). Voir `public/vendor/opencv/LISEZ-MOI.md`.

Trois obstacles ont été levés :

1. **Le binaire WebAssembly était embarqué en `data:` URI** et Emscripten le
   récupère par `fetch()` — bloqué par `connect-src`, contrairement à ce que
   laisse croire le garde `!isDataURI(...)` d'une autre branche du code. Il est
   extrait dans `opencv_js.wasm` et servi comme un fichier. Effet secondaire :
   le JavaScript passe de 9,8 Mo à 217 Ko, le total de 9,8 à 7,4 Mo.
2. **Le middleware redirigeait `.wasm` vers `/login`** : l'extension manquait au
   `matcher` de `src/middleware.ts`. Le binaire n'aurait jamais pu se charger.
3. **Embind fabrique ses fonctions à partir de chaînes.** Deux sites
   (`createNamedFunction`, `makeDynCaller`) ont été remplacés par leurs
   équivalents sans évaluation — ce que fait Emscripten avec
   `-sDYNAMIC_EXECUTION=0`. Le troisième, `craftInvokerFunction` appelé via
   `new_(Function, …)`, est la fabrique d'invocateurs elle-même : irréductible.
   D'où `'unsafe-eval'` **sur la seule route de comparaison** (`next.config.ts`).

> ⚠️ Les deux règles d'en-têtes de `next.config.ts` doivent rester **mutuellement
> exclusives** : deux en-têtes CSP sur une même page s'appliquent en
> **intersection**, ce qui rendrait la politique permissive inopérante. La règle
> stricte porte donc une négation dans son motif.

#### Le piège qui a coûté le plus cher : le module OpenCV est un *thenable*

Emscripten donne une méthode `then` au module. `resolve(cv)` — ou un simple
`return cv` depuis une fonction `async`, ce qui revient au même — déclenche la
procédure de résolution des promesses, qui appelle `cv.then(resolve, …)`,
lequel rappelle avec le module. **Adoption infinie : boucle de micro-tâches,
onglet figé à 100 % de CPU, sans erreur, sans recouvrement, sans trace.** Le
symptôme ne ressemble en rien à sa cause.

`chargerOpenCv()` renvoie donc `Promise<void>` ; le module se récupère par
`opencv()`, accesseur synchrone. Ce n'est pas cosmétique.

#### Réglages et garde-fous

| Constante | Valeur | Raison |
|---|---|---|
| `LARGEUR_ANALYSE` | 1600 px | au-delà, la finesse gagnée ne paie pas le temps |
| `NB_POINTS_ORB` | 3000 | mesuré à 175 ms ; l'appariement n'est pas le goulot |
| `SEUIL_DIFFERENCE` | 45 | seuil fixe plutôt qu'Otsu, qui amplifierait le bruit sur une page presque blanche |
| `AIRE_MINIMALE_PX` | 40 | garde-fou de **coût** : mesurer l'encre de dizaines de milliers de contours parasites fige l'onglet |
| `DISCORDANCE_MAX` | 0,06 | au-delà, les plans ne représentent pas la même chose |
| `SEUIL_BRUIT_DETECTION` | 0,0005 | la valeur par défaut de `filterNoise` (0,01) vaut un carré de 150 px de côté, plus gros que la plupart des différences réelles |

**La discordance résiduelle est le seul garde-fou fiable.** ORB trouve assez de
correspondances fortuites entre deux pages d'un même dossier — même cartouche,
même cadre, mêmes hachures — pour produire une homographie d'apparence
plausible. Seule la part de surface qui diffère après recalage distingue « deux
versions du même plan » de « deux plans différents ».

Mesures sur les plans de production : plans identiques **0 %**, Villa D contre
Villa C **27 %** (basculé en « Détection impossible », ce qui est correct).

> ⚠️ **Le seuil de 6 % n'a pas pu être validé sur un vrai couple PE/EXE d'un
> même plan** : la base n'en contient aucun, les quatre documents marqués étant
> des dossiers de villas distinctes. À réévaluer dès qu'un couple réel existe.

**Performance** : environ 400 ms par analyse une fois OpenCV chargé (mesuré
362 ms et 379 ms sur les plans de production, à 1600 px). Le premier appel
ajoute le téléchargement de 7,4 Mo. Le pipeline rend la main au navigateur
entre chaque étape (`respirer()`), sinon l'indicateur « Analyse en cours… »
n'est jamais peint.

> Les zones détectées ne sont **pas encore dessinées** sur le visualiseur : le
> résultat se limite au compte et à sa répartition. Les coordonnées sont
> renvoyées en pixels dans le repère de l'image d'analyse, avec ses dimensions,
> ce qui suffira à les convertir en unités monde OpenSeadragon.

### Détection avancée et panneau des différences (2026-08-28)

Le détecteur de base (`detectStructuralDiffs`) reste exporté ; le pipeline
utilise désormais `detectStructuralDiffsAdvanced`, plus sélectif.

**Ce que la version avancée ajoute** :
- **Filtre bilatéral** avant tout : il atténue le grain de numérisation sans émousser les traits, contrairement à un flou gaussien qui les diluerait.
- **Carte de dissimilarité SSIM** au lieu de la seule différence absolue. OpenCV ne fournit pas le SSIM : il est calculé selon la formule de Wang et al. par convolutions gaussiennes (moyennes, variances, covariance), puis ramené en `(1 − SSIM) / 2` sur 8 bits. Il voit ce qu'`absdiff` manque — un trait déplacé, un aplat de densité différente.
- **Seuillage adaptatif** pour les masques d'encre, robuste à un éclairage inégal.
- **`SimpleBlobDetector`** en appoint : la présence d'un blob compact dans une zone renforce sa confiance.
- **Confiance de 0 à 1** par zone, moyenne pondérée de quatre indices concordants : dissimilarité (0,45), contraste d'encre entre les deux plans (0,30), blob (0,15), surface (0,10).

> `cv.SimpleBlobDetector_Params` existe mais **n'a pas de constructeur
> accessible** depuis JavaScript. Le seul chemin est
> `new cv.SimpleBlobDetector()` puis `getParams()` / `setParams()`.

> Pour ajouter une constante à une matrice, `convertTo(dst, type, alpha, beta)`
> calcule `alpha·x + beta` sans allouer de matrice de remplissage. Une première
> version passait par `cv.Mat.ones(...)` à chaque terme du SSIM : autant de
> matrices jamais libérées, à chaque analyse.

**`matchStructuralElements(contours1, contours2)`** apparie les contours des
deux plans (coût mêlant distance des centres, écart d'aire et `matchShapes`) et
qualifie chaque correspondance : `deplace`, `redimensionne`, `ajoute`,
`supprime`, `identique`. Un élément à la fois déplacé et redimensionné est
classé selon le changement dominant.

**`estimateScale(img1, img2)`** compare les distances entre paires de points
appariés et en prend la **médiane** — insensible aux appariements erronés,
nombreux sur des plans aux motifs répétitifs. Une échelle dérivée de
l'homographie mêlerait échelle, rotation et perspective.

#### Panneau latéral

`src/components/chantier/panneau-differences.tsx` : tableau #, Type, Confiance,
Surface, Aperçu, Action. Triable par type, confiance et surface ; filtrable par
confiance minimale (curseur 0–100 %). **Le numéro est figé sur l'ordre d'origine**
(confiance décroissante) pour rester stable quand l'utilisateur change le tri.

Les **aperçus** sont des vignettes « avant / après » côte à côte, découpées dans
les images *effectivement comparées* — en niveaux de gris, après normalisation
et recalage — et non dans les plans d'origine : ce que voit l'utilisateur est ce
qu'a vu l'algorithme. Plafonnées à 60 vignettes.

Le panneau se place à droite du visualiseur à partir de `lg`, en dessous sinon.
Il est **hors de `zoneRef`** : sans cela, la capture PNG (`comparaison-capture.ts`)
risquerait de composer le mauvais canevas.

#### « Ajouter une annotation »

Le bouton crée une annotation `rect` sur la vue. Conversion des coordonnées :
les zones sont en **pixels dans le repère de l'image d'analyse**, les annotations
en **unités monde OpenSeadragon** où le plan PE fait 1 de large — on divise donc
**les deux axes par la largeur**, l'échelle étant isotrope.

> **Pas de bleu.** La spécification demandait vert / rouge / jaune / bleu, mais
> la contrainte `comparaison_annotations.color` (migration 042) n'accepte que
> `red`, `orange`, `green` et `yellow`, et le bleu y est déjà réservé — non
> stocké — à l'état « rattachée à une NC ». Ajout → vert, suppression → rouge,
> modification → jaune.

#### Indicateur de progression

Cinq étapes rapportées par `onEtape` (`LIBELLES_ETAPE`) : analyse de l'image 1/2,
2/2, alignement, détection, classification. Chaque étape rend la main au
navigateur avant d'entamer son travail, sinon l'étiquette n'est jamais peinte.

#### Ce qui reste à valider

La sélectivité de la version avancée **n'a pas pu être éprouvée sur un vrai
couple PE/EXE d'un même plan** : la base n'en contient aucun. Vérifié en
revanche que deux plans identiques donnent 0 différence, et que deux villas
distinctes (85,6 % de la page en écart) basculent en « Détection impossible ».
Le panneau, le tri, le filtre et la création d'annotation ont été éprouvés en
desserrant temporairement `DISCORDANCE_MAX`, puis le garde-fou a été rétabli et
revérifié.

### Calque des écarts sur le visualiseur (2026-08-28)

`src/components/chantier/diff-overlay.tsx` (calque + légende) et
`controles-ecarts.tsx` (barre de contrôle).

**Même principe que la couche d'annotations** : un SVG en coordonnées monde
OpenSeadragon dont le groupe porte le `transform` du viewport, recalculé sur
`update-viewport` et `resize`. Le zoom et le déplacement sont donc suivis **par
construction** — aucun rectangle n'est recalculé individuellement.

Le SVG est `pointer-events: none`, seuls les rectangles captent le pointeur : le
calque ne bloque ni le déplacement de la vue, ni la couche d'annotations posée
au-dessus. Quand un outil de dessin est actif, cette dernière capte les
pointeurs et le calque cesse d'être cliquable — c'est le comportement voulu.

**Code couleur** (partagé par le calque, le panneau et les vignettes, via
`HEX_TYPE`) : vert `#2E7D32` ajouté, rouge `#B41E1E` supprimé, jaune `#F59E0B`
modifié, bleu `#002855` déplacé. Opacité 30 % par défaut, 60 % au survol.

**Le quatrième type, `moved`, est produit par recherche de motif.** Une zone
classée « modifiée » voit son gabarit du plan PE recherché dans son voisinage
sur le plan EXE (`matchTemplate`, `TM_CCOEFF_NORMED`) : une corrélation forte à
une position **décalée** signifie que l'élément n'a pas changé, il a bougé.
`absdiff` et le SSIM en sont incapables — ils voient du tracé qui apparaît ici
et disparaît là. Plafonné à 40 recherches par analyse.

> **Le bleu n'existe pas en base.** La contrainte
> `comparaison_annotations.color` n'accepte que red, orange, green et yellow, et
> le bleu y est réservé — non stocké — à l'état « rattachée à une NC ». Une
> annotation issue d'un écart `moved` est donc **orange**, alors que le calque
> l'affiche en bleu. C'est le seul endroit où les deux palettes divergent.

**Un seul seuil de confiance** gouverne le calque et le panneau. Deux curseurs
indépendants finiraient par se contredire et l'utilisateur ne saurait plus lequel
commande ce qu'il voit — l'état est donc remonté dans `ComparaisonPlans`.

**L'infobulle est en `position: fixed`**, pas dans le SVG : une infobulle en
coordonnées monde grossirait avec le zoom.

**« Tout accepter »** crée une annotation par écart *affiché* (donc filtré), en
série et sous confirmation. **« Tout rejeter »** écarte le résultat de la
détection sans rien supprimer : les annotations déjà créées sont des données de
l'utilisateur et restent en place.

> Vérifié : masquage, opacité, filtres par type et par confiance, clic
> ouvrant le panneau sur la bonne ligne, survol à 60 % avec infobulle (type,
> confiance, surface, position), acceptation en masse et rejet. Le type
> `moved` n'a en revanche **pas pu être observé sur les plans de production** —
> aucune paire n'y présente d'élément simplement déplacé.

### Rapport de comparaison automatique (2026-08-28)

Bouton « Générer le rapport de comparaison » dans la ligne de résultat de la
détection, puis une modale : format **PDF ou DOCX**, et envoi facultatif aux
destinataires du chantier.

**Route** : `POST /api/comparaisons/[id]/rapport-auto`. Elle reçoit du navigateur
la **carte des écarts** (capture de la vue, calque compris), les **miniatures**
des deux plans entiers et la **liste des écarts en JSON** — la détection tourne
côté client, le serveur ne peut pas la refaire. Tout le reste — chantier,
annotations, non-conformités, historique, entreprise, destinataires — est relu
en base, donc autoritatif. Les écarts reçus sont typés et **bornés** avant
d'entrer dans le document ; ils ne servent qu'à composer un fichier, jamais à
écrire en base.

**Six pages** : garde (logo ou nom de marque en repli, plans comparés, chargé de
sécurité) · résumé exécutif (répartition par priorité, NC créées, confiance
moyenne) · carte des écarts en A4 paysage avec légende · liste détaillée en
paysage (N°, type, confiance, surface, position, priorité, recommandation, NC) ·
annexes (miniatures PE et EXE) · annotations manuelles, historique et signature.

**Priorité et recommandation** : `src/lib/utils/priorite-sst.ts`.

> ⚠️ **Ce n'est pas une analyse SST**, et le rapport le dit en page de garde. Rien
> ne « comprend » le plan : la détection est géométrique. La priorité est une
> **règle déterministe** — la confiance domine, la surface pèse, et un élément
> présent au PE mais absent à l'EXE gagne un cran, puisque c'est le cas où une
> disposition a pu disparaître. Elle sert à ordonner les vérifications, pas à
> conclure. Sur un document de sécurité, présenter cela comme une expertise
> serait trompeur.

**Après génération** : le fichier est déposé dans le bucket `rapports`, inscrit
dans les **documents du chantier** (catégorie « autre »), journalisé en
`audit_logs` sous `generate_comparaison_report`, et envoyé aux destinataires si
la case est cochée. L'« historique des rapports » demandé, c'est cette entrée
dans les documents du chantier — il n'existe pas de table dédiée et en créer une
aurait doublonné.

Un échec de classement ou d'envoi **ne fait pas échouer la génération** : le
fichier est renvoyé quand même, l'avertissement voyageant dans l'en-tête
`X-Rapport-Avertissement`.

**DOCX** (`src/lib/comparaison/rapport-auto-docx.ts`) : mêmes données d'entrée
que le PDF, un seul chargement côté route alimente les deux formats pour
qu'aucun ne dérive de l'autre. La dépendance `docx` était déjà présente pour le
manuel utilisateur.

> La capture (`comparaison-capture.ts`) rasterise désormais **toutes** les
> couches SVG de la zone, dans l'ordre du DOM, et non plus la seule couche
> d'annotations : sans cela le calque des écarts serait absent de la carte — et
> l'était aussi des exports PNG, PDF et de l'impression.

### Détection sur la vue recalée (2026-08-28)

Éprouvé sur le chantier **Orllati**, premier de la base à porter de vraies
paires PE/EXE (16 plans de chaque). Trois constats y ont fait évoluer la chaîne.

#### Le bug : déformation anisotrope

`resizeToSameDimensions` forçait la seconde image aux dimensions de la première.
Mesuré sur Orllati : plan PE au rapport **1,000** (page carrée), plan EXE au
rapport **1,415** (A-série paysage), soit **41 % d'étirement vertical**. La
déformation détruit les descripteurs ORB, RANSAC en tire une homographie
dégénérée qui écrase le plan en 5 pixels (facteurs 0,003 / 0,004).

Corrigé : mise à l'échelle par le facteur le plus contraignant, puis centrage
sur fond blanc. Le bug était invisible tant qu'on comparait un document à
lui-même.

#### La limite : les dossiers PE et EXE ne sont pas le même dessin

Deux échecs de nature différente sur Orllati :

- **Emprises différentes** — PE bâtiment A seul contre EXE bâtiments A+B, même
  échelle 1:100. 498 correspondances, homographie toujours dégénérée
  (0,238 / 0,186) : la moitié du plan EXE est un autre bâtiment qui ressemble au
  premier, les appariements sont majoritairement faux.
- **Échelles différentes** — PE 1:100 contre EXE 1:50, même emprise.
  L'alignement **réussit** (613 correspondances, facteurs 1,531 / 1,529,
  isotropes à 0,2 % près), mais **33 % de discordance sur 100 % de
  recouvrement** : à ces échelles, l'épaisseur des traits, la taille des textes
  et le niveau de détail diffèrent intrinsèquement. Le masque de recouvrement
  n'y change rien — il n'y a pas de bordure à exclure.

> La comparaison pixel à pixel suppose **deux versions du même dessin**. Un
> dossier PE et un dossier EXE sont deux jeux de dessins distincts.

#### La réponse : comparer ce que l'utilisateur a superposé

`analyserVue()` rend les deux calques séparément — on éteint l'un, on lit le
canevas du visualiseur, on éteint l'autre — donc **dans le même cadre**, à la
position, à l'échelle et au cadrage que l'utilisateur leur a donnés. Aucun
recalage n'est calculé : il fait le recalage, l'algorithme fait la différence.

Le bouton propose désormais **deux modes** explicites, parce qu'ils ne
conviennent pas aux mêmes plans :

| Mode | Pipeline | Pour |
|---|---|---|
| Sur la vue recalée | `analyserVue` | plans de formats ou d'échelles différents |
| Avec recalage automatique | `analyserPlans` → `alignPlans` | deux versions d'un même dessin |

**Le garde-fou de discordance devient un avertissement** en mode vue :
l'utilisateur a affirmé que ces plans se correspondent en les superposant.
Le refus ne subsiste qu'au-delà de `DISCORDANCE_REFUS` (60 %).

#### Réglage manuel de l'échelle du calque

Cadenas ouvert, la barre d'outils propose l'échelle du calque du dessus
(25 %–400 %, pas de 1 %). Indispensable pour poser un 1:50 sur un 1:100 :
le glissement ne fait que translater.

> Le redimensionnement est **recentré sur le centre de la vue**. `setWidth`
> conserve le coin supérieur gauche : sans recentrage, ce qu'on regarde
> s'échappe du cadre à chaque cran.

`estimateScale` est branchée sur ce mode et mesure l'**échelle résiduelle**
entre les deux calques — la seule information qui dise si le recalage manuel
est à la bonne taille. Vérifié : calque réglé à 60 %, mesure indépendante à
**0,631**.

#### Repère explicite

`ResultatAnalyse.repere` porte l'origine et le pas vers les unités monde
OpenSeadragon, au lieu de supposer que le plan PE fait 1 de large. Le calque et
les annotations créées se placent correctement quel que soit le cadre analysé.
Vérifié au pixel : rectangle détecté et annotation créée à (440, 1459, 106×21)
tous les deux.

#### Paliers d'`alignPlans`

Le traitement dépend du **nombre de correspondances trouvées** (et non du
sous-ensemble retenu pour l'homographie, plafonné à 400) :

| Correspondances | Comportement |
|---|---|
| < 30 | refus — `raison: "Plans trop différents"` |
| 30 à 100 | homographie et transformation, `echelle: null` |
| > 100 | + estimation de l'échelle, tirée des mêmes appariements |

L'image est **toujours** renvoyée : en échec, une copie non transformée du plan
2. Le motif du refus remonte jusqu'à l'écran — « Plans trop différents »
n'appelle pas la même vérification qu'une transformation aberrante.

#### Diagnostic d'un échec de détection (2026-08-28)

Le bandeau d'erreur porte la **cause** entre parenthèses, à la suite du message
générique imposé par la spécification. D'où une règle de lecture utile :

> **Un message sans parenthèse ne peut pas être un refus raisonné.** Les deux
> modes fournissent toujours un motif quand ils renoncent — « Plans trop
> différents », « la transformation replie le plan hors du cadre », « les deux
> plans diffèrent sur une part trop importante de leur surface ». Un message nu
> signale donc une **exception**, pas une incompatibilité de plans.

Les points de panne de la capture lèvent une erreur nommée plutôt que de
renvoyer `null` en silence — dont le cas où OpenSeadragon retombe sur son rendu
HTML, sans canevas, quand le navigateur refuse WebGL **et** le canevas 2D : la
comparaison est alors impossible.

**Ce que les deux modes partagent** est court : `chargerOpenCv()`. Quand les
deux échouent de la même façon, c'est là qu'il faut regarder d'abord.

> Signalé en usage réel sur une paire qui fonctionne pourtant en local
> (15 différences, échelle résiduelle 0,9). Trois pistes écartées par la
> mesure : le SSIM tient jusqu'à 4,6 Mpx sans saturer le tas WebAssembly
> (56 → 174 ms), `opencv.js` et `opencv_js.wasm` répondent 200 avec le bon type
> MIME en production, et le Service Worker n'intercepte pas `/vendor` — ses
> motifs ne couvrent ni `.js` ni `.wasm`.

### Exclusion des cartouches (2026-08-29)

Le contenu d'un cartouche — bureau, date, indice, numéro de plan — **diffère
systématiquement** entre un dossier d'enquête et un dossier d'exécution. Le
comparer produit des écarts à forte confiance qui n'en sont pas.

`detecterCartouches()` (`plan-preprocessing.ts`) en repère les emprises. Un
cartouche réunit trois conditions :

1. c'est un **quadrilatère convexe** — un cadre dessiné ;
2. il **accoste un bord** de la feuille (à 4 % près) ;
3. il occupe une part **intermédiaire** de la page, entre 0,8 % et 30 % — ni un
   détail du dessin, ni le cadre entier.

Le bâtiment ne produit presque jamais les trois à la fois.

> `RETR_LIST` et non `RETR_EXTERNAL` : le cartouche est imbriqué dans le cadre
> de la feuille, donc jamais un contour de premier niveau. Une fermeture
> morphologique précède la recherche, sans quoi un cadre interrompu par du texte
> n'est jamais vu comme un quadrilatère par `approxPolyDP`.

Les emprises des **deux** plans sont écartées : si l'un des deux porte un
cartouche à cet endroit, la comparaison n'y a pas de sens. Les rectangles qui se
recouvrent sont fusionnés — un cadre est souvent détecté deux fois, trait
intérieur et trait extérieur.

**Les zones écartées sont hachurées en gris sur le calque** et annoncées dans la
légende ; la case « Ignorer les cartouches » du menu de détection, cochée par
défaut, les rétablit. Ce n'est pas cosmétique : sur un document de sécurité,
exclure à tort revient à **masquer un écart réel**, et une exclusion invisible ou
non débrayable serait invérifiable.

> ⚠️ **Heuristique non éprouvée sur les plans de production.** Le visualiseur a
> refusé de se charger dans le navigateur d'automatisation au moment de la
> vérification ; aucun cartouche n'a donc été observé réellement détecté. Deux
> risques connus : un cartouche **non encadré** passe au travers, et une grande
> façade ou coupe plaquée au bord peut être **exclue à tort**. À confronter aux
> hachures dès le premier usage réel.

Alternative sans heuristique, quand la certitude prime : cadrer la vue sur le
bâtiment avant de lancer la détection. En mode « vue recalée », ce qui est hors
écran est hors analyse.

### Recoloration des calques (2026-08-29)

Superposer deux plans opaques revient à regarder le second à travers une page
blanche : à 50 % d'opacité, le plan du dessous est délavé et le trait du dessus
l'est autant, et rien ne dit à quel dossier appartient une ligne donnée.

Un sélecteur dans la barre d'outils propose trois lectures :

| Mode | Effet |
|---|---|
| Naturel (défaut) | les plans tels qu'ils sont dessinés |
| Une couleur par plan | PE en vert, EXE en orange, fond transparent |
| PE coloré, EXE gris | fait ressortir l'enquête publique sur l'exécution |

`teinterPlan()` recolore et **rend le fond transparent** : l'opacité de chaque
pixel est prise sur l'encre (1 − luminance), si bien qu'un trait noir devient
opaque, une trame grise translucide, et le blanc de la feuille disparaît. Seuls
les traits se superposent alors, et deux couleurs distinctes disent au premier
coup d'œil de quel dossier vient chaque ligne.

> ⚠️ **Les teintes doivent rester sombres.** `masqueMurs()` ne retient que les
> pixels sous 150 en niveaux de gris ; le vert et l'orange de l'interface
> (#2E7D32, #E67E22) pèsent 93 et **147**. Le second passerait tout juste, ses
> bords adoucis pas du tout. Les variantes retenues — #1B5E20, #A64B00,
> #4B5563 — pèsent 67, 94 et 84.

#### La détection analyse toujours les plans naturels

Même sombre, une teinte **ne peut qu'éclaircir** : le pixel composé sur blanc
vaut `luminance × encre + original`, donc toujours ≥ l'original. Les bords
adoucis d'un trait passent au-dessus du seuil d'encre et le mur maigrit.

Mesuré sur les plans de production, Rez contre Niveau 01 :

| | différences détectées |
|---|---|
| plans naturels | **10** |
| une couleur par plan | 3 |
| PE coloré, EXE gris | 4 |

Une aide à la lecture ne peut pas coûter six écarts sur un document de sécurité.
`capturerCalques()` repose donc les sources d'origine le temps de la capture,
puis rétablit la teinte — la géométrie posée par l'utilisateur (position,
échelle, rotation) étant rejouée à l'identique depuis l'état React.

> ⚠️ **`world.removeAll()` remet le cadrage à zéro.** OpenSeadragon revient à la
> vue d'ensemble dès que le monde se vide, puis se redimensionne sur le nouveau
> contenu. Vérifié dans le navigateur : un centre à (0,31 ; 0,42) et un zoom de
> 4 reviennent à (0,5 ; 0,5) et 0,78. `poserCalques()` relève donc le cadrage
> avant de vider et le repose une fois les deux calques ajoutés — vérifié
> restitué au chiffre près.

Les plans recolorés sont mémorisés par URL d'origine et par couleur : la
recoloration coûte un décodage et un balayage de tous les pixels. Le cache est
révoqué en même temps que les sources.

### Rotation du calque au recalage (2026-08-29)

Deux dessins du même ouvrage ne sont pas toujours orientés pareil : un plan
d'exécution est couramment tourné pour tenir sur sa feuille, ou pour mettre le
nord dans un coin. La translation et l'échelle ne rattrapent pas cela, et comme
la détection compare les calques **tels qu'ils sont superposés**, une
orientation fausse rend tout le bâtiment discordant.

Verrou ouvert, la barre d'outils propose donc la rotation du calque du dessus à
côté de son échelle : curseur sur le tour complet (−180° à +180°), boutons au
dixième de degré — c'est à cette finesse que deux murs finissent par se
superposer — et deux boutons de quart de tour, le cas courant, qu'on n'atteint
pas en traînant un curseur de 96 pixels.

> Contrairement à `setWidth`, **`setRotation` n'a besoin d'aucun recentrage** :
> il pivote autour du centre des bornes non tournées de l'image, qui ne bouge
> pas. Vérifié dans le navigateur — `getBoundsNoRotate().getCenter()` reste à
> l'identique avant et après rotation, le rendu change bien (signature de pixels
> 6 923 796 → 7 084 694 avec le dessinateur WebGL) et revient exactement à sa
> valeur d'origine à 0°.

L'ordre d'application compte : largeur, puis position, puis rotation — le pivot
se calcule sur des bornes qui dépendent des deux premières. La rotation est
remise à zéro en vue côte à côte et par le bouton de recentrage.

Rien à changer côté détection : `capturerCalques()` lit le canevas du
visualiseur, où la rotation est déjà appliquée.

### La comparaison porte sur les murs (2026-08-29)

Signalé en usage réel, capture à l'appui : les différences remontées portaient
sur la **garniture** des plans — blocs de légende, cartouches, textes — et un
seul grand rectangle orange couvrait toute la superposition sans désigner la
moindre modification.

Deux causes distinctes, deux corrections.

#### 1. Comparer les murs, pas le dessin

Ce que l'utilisateur regarde entre deux versions d'un plan, c'est **si les murs
coïncident**. Cotes, textes, axes, trames, contenu des cartouches et garniture
de la feuille changent d'un dossier d'enquête à un dossier d'exécution sans que
l'ouvrage ait bougé d'un centimètre.

`masqueMurs()` (`plan-preprocessing.ts`) les isole. Ce qui distingue un mur du
reste n'est ni sa forme ni sa position mais son **épaisseur** : une ouverture
morphologique ne conserve que ce qui contient entièrement son noyau, donc efface
tout trait plus fin que lui. Aucune heuristique de position n'est nécessaire —
la garniture disparaît parce qu'elle est fine, pas parce qu'on aurait deviné où
elle se trouve. C'est structurellement plus solide que l'exclusion des
cartouches, qui reste en place et la complète.

**Le noyau est mesuré sur le dessin, jamais fixé d'avance.** L'épaisseur d'un
mur en pixels dépend de l'échelle, du format de la feuille et de la résolution
d'analyse — 8 px sur un plan rendu à 1600 px, 4 px sur le même plan vu au
travers du visualiseur avec un calque réduit. Des ouvertures successives font
tomber les traits par ordre d'épaisseur : le dernier noyau qui laisse encore
1 % de l'encre donne l'épaisseur du trait le plus épais, et le seuil est pris à
`FRACTION_MUR` (0,45) de cette valeur, pour garder aussi les cloisons.

> ⚠️ **Le même noyau doit s'appliquer aux deux plans** (`isolerMurs()`).
> Mesuré sur les plans de production : 9 px pour le dossier PE, 6 px pour
> l'EXE. Calibrés séparément, le plan le plus érodé perd ses cloisons, qui
> ressortent toutes comme des murs supprimés. Le plus petit des deux s'impose.

La comparaison devient une soustraction, chaque masque étant dilaté de
`TOLERANCE_MURS_PX` (4 px) avant : un recalage manuel ne pose jamais deux traits
au pixel près. Un mur du PE sans vis-à-vis → **supprimé** ; un mur de l'EXE sans
vis-à-vis → **ajouté** ; un mur supprimé dont le motif se retrouve à moins de
`RAYON_RECHERCHE_MAX` → **déplacé**, et la trace d'arrivée est retirée, sinon un
déplacement compterait double.

Le menu « Détecter les différences » propose **Les murs** (défaut) et **Tout le
dessin**, et la ligne de résultat rappelle lequel a servi.

#### 2. Le grand rectangle qui ne désignait rien

Quand le recalage est légèrement faux, le liseré laissé le long de chaque trait
finit par se souder en **un** contour qui enveloppe tout le dessin. Trois
garde-fous, dans `examinerZone()` :

| Règle | Seuil | Ce qu'elle écarte |
|---|---|---|
| aire du **contour** / page | > 8 % | l'enveloppe soudée sur tout le plan |
| aire de la **boîte** / page | > 25 % | ce qui, dessiné en rectangle, ne montre plus rien |
| pixels de différence / aire du contour | < 10 % | l'enveloppe tendue entre deux résidus lointains |

> ⚠️ **Les deux premiers tests portent sur l'aire du contour, pas sur celle de
> sa boîte.** Un mur en diagonale — et les bâtiments de ce projet sont
> pentagonaux — a une boîte presque vide : le juger sur sa boîte reviendrait à
> écarter systématiquement les murs obliques. Vérifié sur les plans réels : un
> mur oblique du Rez, écarté par la première version de la règle, est
> correctement retenu et classé « déplacé » par la seconde.

Une zone écartée pour cette raison est **comptée et annoncée** (`zonesEcartees`,
badge orange dans la ligne de résultat, phrase dans l'avertissement). Sans quoi
« 0 différence » se lirait « les plans coïncident » là où c'est le recalage qui
est à reprendre.

#### 3. Un piège de `matchTemplate` corrigé au passage

La boîte d'un mur ne contient **que** le mur : une image uniforme.
`TM_CCOEFF_NORMED` divise par l'écart-type du gabarit, nul dans ce cas, d'où un
score `NaN` — et `NaN < seuil` valant faux, **n'importe quelle position passait
pour une correspondance parfaite**. D'où des « déplacés » vers des murs sans
rapport. Le gabarit déborde désormais de `MARGE_GABARIT` (6 px) pour porter du
contexte, l'écart-type est vérifié avant l'appel, et `maxVal` doit être fini.
La fenêtre de recherche est en outre plafonnée à `RAYON_RECHERCHE_MAX` (120 px) :
sans plafond, un plan n'étant fait que de segments parallèles de même épaisseur,
la corrélation trouve toujours un sosie à l'autre bout de la page.

#### Vérification

Menée sur les **plans de production** du chantier Orllati (Villeneuve 1441-1442,
bâtiment A), rendus par pdf.js comme le fait l'application, puis passés dans les
modules réels.

| Cas | Murs | Tout le dessin |
|---|---|---|
| Rez comparé à lui-même | **0** différence | 0 différence |
| Rez contre Niveau 01, même bâtiment et même échelle | **10** différences localisées, 36 ms | 45 différences, 243 ms |

Le masque de murs a été rendu en superposition sur les deux plans réels et
inspecté : il suit les murs et **n'attrape ni le cartouche, ni les blocs de
texte, ni les cotes, ni le mobilier, ni les lignes de site**. Sur un jeu
synthétique où la vérité est connue (une cloison déplacée, un mur ajouté,
garniture entièrement différente), le mode murs rend exactement les 3
différences réelles et **aucune** dans la garniture, là où le mode dessin en
rend 12 dont 9 dans la garniture.

> Limite connue : les murs d'enveloppe dessinés en trait clair ou hachuré ne
> sont pas des traits pleins et n'entrent donc pas dans le masque. Le mode
> « Tout le dessin » reste disponible pour ces cas.

## Pièges connus et gotchas

1. **`resource` vs `resource_type`**, **`details` vs `metadata`** dans `audit_logs` : les colonnes s'appellent `resource` (depuis migration 022) et `details`. Tout autre nom fait échouer l'insert — et comme le résultat n'est presque jamais vérifié, la trace disparaît en silence.
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
15. **Annotations de comparaison** : les coordonnées sont en unités monde OpenSeadragon, jamais en pixels. Une forme SVG qui doit être cliquable sur toute sa surface a besoin de `fill="transparent"`, pas `fill="none"`.
16. **Types acceptés par les buckets** : `rapports` accepte PDF, Word, Excel, JPEG et PNG (migration 044) ; `visite-photos` accepte JPEG et PNG. Un type hors liste est rejeté par le stockage avec un **400**, pas par le code — la configuration du bucket reste le contrôle autoritaire.
17. **Une NC sans `reponse_id`** est forcément de type `ecart_plan` (contrainte `ecarts_origine_check`). Tout code qui joint `ecarts` à `reponses` doit tolérer l'absence de correspondance.
18. **Icônes et traduction automatique** : les Material Symbols fonctionnent par **ligature** — le `<span>` contient le mot `arrow_back`, que la police remplace par le dessin. Si le navigateur traduit la page, ce mot devient « flèche_re » et l'icône disparaît au profit du texte. Tout `<span class="material-symbols-outlined">` doit donc porter `translate="no"` (145 occurrences marquées). `lang="fr"` sur `<html>` ne suffit pas : Chrome propose quand même la traduction, précisément parce que les noms d'icônes sont des mots anglais.
19. **Capture de la comparaison** : ne pas rebrancher `html2canvas` — Tailwind v4 émet `oklch()`, qu'il ne sait pas analyser. La capture recompose directement le canevas OpenSeadragon et la couche SVG (`comparaison-capture.ts`). Un SVG étiré en CSS doit recevoir `width`/`height`/`viewBox` avant d'être rasterisé par un `<img>`.
20. **Image dans un PDF react-pdf** : lui donner une hauteur en points, jamais `flexGrow: 1` — une image ne peut pas se couper entre deux pages et le moteur ne résout pas la hauteur du conteneur avant de la mettre en page.
21. **Le module OpenCV.js est un *thenable*** : ne jamais le faire traverser une promesse (`resolve(cv)`, `return cv` dans une fonction `async`). Adoption infinie, onglet figé sans erreur. `chargerOpenCv()` renvoie `Promise<void>`, le module vient de `opencv()`.
22. **Matrices OpenCV** : elles vivent dans le tas WebAssembly, que le ramasse-miettes de JavaScript ignore. Toute `Mat` doit être `delete()`. Utiliser `libererTout()` dans un `finally`.
23. **CSP par route** : deux en-têtes `Content-Security-Policy` sur une même page s'appliquent en **intersection**. Les règles de `next.config.ts` doivent rester mutuellement exclusives, sinon l'exception de la page de comparaison est annulée par la règle stricte.
24. **`SimpleBlobDetector_Params` n'est pas constructible** depuis JavaScript : passer par `new cv.SimpleBlobDetector()` puis `getParams()` / `setParams()`.
25. **Ajouter une constante à une matrice** : `convertTo(dst, type, alpha, beta)` calcule `alpha·x + beta`. Ne pas fabriquer une matrice `ones()` par terme — elles ne seraient pas libérées.
26. **Coordonnées des zones détectées** : en pixels dans le repère de l'image d'analyse. Vers les unités monde OpenSeadragon, diviser **les deux axes par la largeur** (le plan PE fait 1 de large, l'échelle est isotrope).
27. **Palette des écarts vs couleurs d'annotation** : le calque affiche quatre types (dont `moved` en bleu), la base n'accepte que quatre couleurs sans bleu. `moved` devient orange à l'enregistrement. Toute évolution demande une migration de la contrainte `comparaison_annotations.color`.
28. **Les écarts du rapport viennent du navigateur** : la détection est client-side, le serveur ne peut pas la recalculer. Les valeurs reçues sont bornées et typées avant d'entrer dans le document, et ne sont jamais écrites en base.
29. **`resizeToSameDimensions` ne doit jamais déformer** : deux plans du même ouvrage sont couramment mis en page différemment (page carrée contre A-série). Étirer détruit les descripteurs ORB et rend l'alignement impossible. Mise à l'échelle isotrope puis fond blanc.
30. **`setWidth` d'OpenSeadragon conserve le coin supérieur gauche** : tout redimensionnement de calque doit être recentré à la main, sinon la vue s'échappe.
31. **Message de détection sans parenthèse** = exception, jamais un refus raisonné : les deux modes donnent toujours un motif quand ils renoncent. Les deux ne partagent que `chargerOpenCv()`.
32. **Exclusion des cartouches** : heuristique (quadrilatère convexe, accosté au bord, taille intermédiaire), donc faillible dans les deux sens. Les zones écartées doivent rester visibles et la case débrayable — exclure à tort masque un écart réel.
33. **`world.removeAll()` d'OpenSeadragon remet le cadrage à zéro** : reposer des calques (recoloration, capture) impose de relever centre et zoom avant, et de les restituer après l'ajout des deux images.
34. **Une teinte ne peut qu'éclaircir** : l'encre portée par l'alpha et composée sur blanc donne toujours un pixel plus clair que l'original. La détection doit donc analyser les plans **naturels**, jamais recolorés — mesuré, 10 différences contre 3. Et si l'on teinte quand même, les couleurs doivent rester sous le seuil d'encre (150).
35. **`setRotation` d'OpenSeadragon pivote autour du centre**, là où `setWidth` conserve le coin supérieur gauche : la rotation d'un calque n'a pas besoin du recentrage manuel qu'exige son redimensionnement. L'appliquer **après** la largeur et la position, dont dépend le pivot.
36. **La détection porte sur les murs par défaut** : `masqueMurs()` ne retient que les traits pleins, ce qui écarte par construction textes, cotes, trames et cartouches. Le noyau d'ouverture est **mesuré sur le dessin** et doit être **identique pour les deux plans** (`isolerMurs()`) — calibrés séparément, ils diffèrent (9 px contre 6 px sur les plans de production) et le plan le plus érodé voit toutes ses cloisons ressortir comme supprimées.
37. **Filtrer une zone sur l'aire de sa boîte est un piège** : un mur oblique a une boîte presque vide. Les seuils de `examinerZone()` portent sur l'aire du **contour** ; seul le plafond d'affichage (25 %) regarde la boîte, parce que le calque dessine des rectangles.
38. **`matchTemplate` sur un gabarit uniforme rend `NaN`** : `TM_CCOEFF_NORMED` divise par l'écart-type du gabarit. Comme `NaN < seuil` vaut faux, le score passe tous les tests et n'importe quelle position devient une correspondance parfaite. Toujours donner du contexte au gabarit, vérifier l'écart-type, et tester `Number.isFinite(maxVal)`.
39. **`updated_at` non auto-géré** : aucune table n'a de trigger PostgreSQL pour rafraîchir `updated_at` automatiquement — il faut le fixer explicitement dans chaque `.update(...)` qui en dépend (cf. `ecarts`, `visites`).
40. **`tailwind.config.ts` n'est pas chargé** : Tailwind v4 exige une directive `@config` dans le CSS, absente de `globals.css`. Toutes les extensions du fichier sont donc inertes — dont `min-h-touch` / `min-w-touch`, utilisées 191 fois : **aucune cible tactile n'est réellement contrainte à 44 px**. Écrire les tailles en dur (`min-h-[44px]`) tant que la configuration n'est pas rebranchée.
41. **`.material-symbols-outlined` est déclarée hors couche** dans `globals.css` : son `display: inline-block` bat les utilitaires Tailwind, qui sont dans une couche. Une classe de visibilité responsive (`xl:hidden`, `md:inline`…) posée directement sur une icône **n'a aucun effet** — la poser sur un `<span>` enveloppe.
42. **Le retour de la barre de navigation est hiérarchique**, jamais `history.back()` : en PWA installée il n'y a pas de bouton retour du navigateur et l'historique peut mener hors de l'application. Le parent ne se déduit pas du chemin — plusieurs niveaux intermédiaires n'ont pas de page (`/chantiers/<id>/visites`) — d'où la table explicite de `src/lib/utils/navigation-retour.ts`, à compléter à chaque nouvelle route.
43. **Une écriture refusée par la RLS ne lève aucune erreur** : l'`UPDATE` ne touche simplement aucune ligne, et PostgREST renvoie un succès. Tout `.update()` dont l'échec compte doit chaîner `.select()` et traiter le tableau vide comme un refus — vérifier `error` seul ne suffit pas.
44. **Une politique permissive `USING (true)` n'en est pas une** : les politiques permissives s'additionnent en OU, donc une seule ouverte annule toutes les autres sur la même commande. Relire `pg_policies` après chaque migration touchant la RLS (`select * from pg_policies where qual = 'true'`).
45. **Ne jamais écrire dans `audit_logs` en direct** : passer par `journaliser()` (`src/lib/audit.ts`). Le rôle `authenticated` n'a plus le droit d'écrire dans cette table, elle est en ajout seul, et le helper est le seul endroit qui vérifie le résultat de l'insertion.
46. **Un trigger `for each statement` ignore sa valeur de retour** : seul un `raise` interrompt la commande. `return null` y laisse passer l'opération, contrairement à un trigger `for each row`.
47. **`INSERT ... RETURNING` évalue la politique `SELECT`** de la ligne insérée, avant tout trigger `AFTER`. Un `.insert(...).select(...)` de Supabase échoue donc si la politique de lecture dépend d'une ligne qu'un trigger `AFTER` doit encore créer — et PostgreSQL annonce « new row violates row-level security policy », ce qui désigne à tort le `WITH CHECK` de l'insertion.
48. **L'accès aux chantiers a deux règles distinctes** : la lecture accepte la liaison `chantier_inspecteurs` **ou** `created_by`, l'écriture n'accepte que la liaison. Un créateur retiré par un administrateur voit encore son chantier mais ne peut plus rien y faire.
49. **Une URL signée ne s'écrit jamais en base** : elle expire. Les valeurs qui font un aller-retour par le navigateur (`reponses.photos`, `entreprises.logo_url`) doivent repasser par `canoniserUrlStockage()` avant l'enregistrement, sinon la base se remplit d'URL mortes — visibles seulement le lendemain.
50. **Un bucket privé mal cloisonné ne protège que des inconnus** : une politique de lecture `bucket_id = '…'` laisse tout compte connecté signer n'importe quel objet. Et attention aux **doublons de politiques** — il y en avait deux par bucket, permissives, donc en OU : en laisser une annule le cloisonnement.

---

## ESLint

20 erreurs et 15 warnings connus (relevé du 2026-08-27, après suppression d'un worktree orphelin `.claude/worktrees/practical-buck` qui faisait scanner le code en double et gonflait le total à 34/27). Ne pas bloquer le développement sur ces erreurs existantes — les corriger progressivement.

```bash
npm run lint
```

Config : `eslint.config.mjs` (flat config ESLint 9, sans `FlatCompat`).
