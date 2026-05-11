# Corrections appliquées — Securionis-chantiers

## Sélection des destinataires avant envoi du rapport — 2026-05-11

### Contexte

L'envoi du rapport PDF de visite par email envoyait systématiquement à **tous** les destinataires du chantier, sans possibilité de choisir. L'inspecteur ne pouvait pas exclure ponctuellement un destinataire (CC absent, copie de courtoisie ciblée, etc.) sans modifier la liste du chantier.

### Implémentation

**UI** — `src/app/(dashboard)/chantiers/[id]/visites/[visiteId]/rapport/rapport-actions.tsx`
- Le bouton « Envoyer par email » devient « Envoyer par email… » (suffixe ellipse pour signaler l'ouverture d'une modal).
- Modal « Choisir les destinataires » avec une checkbox par destinataire (nom, organisation, email).
- Tous cochés par défaut (préserve le comportement historique).
- Compteur dynamique « N / Total sélectionnés ».
- Bouton « Tout cocher » / « Tout décocher ».
- Bouton « Envoyer (N) » désactivé si 0 sélectionné.
- Re-cochage automatique à chaque réouverture de la modal (pas de mémorisation entre 2 envois).

**API** — `src/app/api/visites/[id]/email/route.ts`
- Accepte désormais `{ destinataireIds: string[] }` dans le body (optionnel).
- **Sécurité** : filtrage côté serveur — on n'envoie qu'aux destinataires effectivement liés au chantier (`allDestinataires.filter((d) => selectedIds.includes(d.id))`). Impossible d'injecter un destinataire arbitraire.
- Si body absent ou non parsable → fallback « envoi à tous » (rétro-compatibilité).
- Retour 400 « Aucun destinataire sélectionné » si la liste filtrée est vide.

**Page** — `rapport/page.tsx`
- Passe désormais le tableau complet `destinataires` à `<RapportActions>` au lieu du booléen `hasDestinataires`.

### Édition serveur

L'audit log existant (`audit_logs` action `send_rapport_email`) conserve la liste des emails effectivement envoyés (`sent_to`) — utile pour vérifier *après coup* qui a reçu quoi.

---

## Refactoring complet 3 hotspots — 2026-05-10

Audit de complexité cyclomatique sur 3 composants critiques (`photo-annotator.tsx` Cyclo=55, `point-controle-form.tsx` Cyclo=35, `admin/documents/page.tsx` Cyclo=26) et plan de refactoring exécuté en 3 salves (P0/P1/P2).

### Salve P0 — Extractions pures (faible risque)

**P0-1 : `src/lib/utils/canvas-annotations.ts`** (nouveau, 134 l)
Mutualisation de la boucle de rendu d'annotations entre `drawAll` (display) et `handleSave` (export haute résolution). La logique de tracé par type (arrow/circle/text/freehand) était dupliquée à 90 % dans `photo-annotator.tsx` (l. 67-113 et l. 273-328 avant refacto). Désormais une seule fonction `renderAnnotations(ctx, annotations, { scale })` qui gère les deux cas.

**P0-2 : `src/lib/utils/storage-path.ts`** (nouveau, 22 l)
- `buildStoragePath(prefix, ext)` : remplace les concat ad-hoc `${prefix}/${crypto.randomUUID()}.${ext}` dispersées dans 3 sites
- `extractStoragePath(url, bucket)` : extrait avec garde anti path-traversal (anciennement `extractSafeStoragePath` dans `use-photo-upload.ts`, désormais partagée pour tous les buckets). Élimine le `split("/rapports/")[1]` fragile.
- `validatePdfOrImageFile()` ajoutée dans `file-validation.ts` (whitelist PDF/JPG/PNG, 50 Mo).

**P0-3 : Constantes métier extraites**
- `src/lib/utils/document-sources.ts` (`DOCUMENT_SOURCES`, `DOCUMENT_SOURCE_LABELS`)
- `src/lib/utils/format.ts` (`formatFileSize`)

### Salve P1 — Découpage de composants (risque moyen)

**P1-1 : `<CategorieThemeSelector>`** (`src/components/admin/categorie-theme-selector.tsx`, 206 l)
Remplace 6 `useState` couplés dans `point-controle-form.tsx` par un état discriminé typé :
```ts
type CategorieSelection = { mode: "existing"; categorieId } | { mode: "new"; libelle };
type ThemeSelection = { mode: "none" } | { mode: "existing"; themeId } | { mode: "new"; libelle };
```
La validation passe d'une expression composée à 5 conditions (`(!categorieId && !showNewCategorie) || ...`) à un simple `validateCategorieThemeState()`.

**P1-2 : `<PointControleDocumentsUploader>`** (`src/components/admin/point-controle-documents-uploader.tsx`, 242 l)
Sous-composant qui encapsule docs + pendingFiles + uploading + load/delete. Expose un `useImperativeHandle` avec `flushPending(pointId)` que le parent appelle après création du nouveau point.

**P1-3 : Découpage `admin/documents/page.tsx`** (720 → 119 lignes)
- `hooks/use-documents.ts` (60 l) — chargement + linkedCount + remove
- `components/document-list.tsx` (175 l)
- `components/document-upload-form.tsx` (174 l)
- `components/edit-document-modal.tsx` (124 l)
- `components/email-document-modal.tsx` (119 l)
- `components/link-points-modal.tsx` (169 l, **+ fix race condition** au chargement, **+ fix tri non-mutant** sur `[...filtered].sort()`)

**P1-4 : Fusion `useEffect` redondants** (`photo-annotator.tsx`)
Les deux effets `drawAll()` et `drawAll(currentAnnotation)` fusionnés en un seul appel `drawAll(currentAnnotation)`.

### Salve P2 — Architectural

**P2-2 : `src/lib/utils/storage-upload.ts`** (49 l, nouveau)
Helper `uploadFileToStorage(file, { bucket, pathPrefix, validate })` qui combine validation + upload + getPublicUrl. Utilisé dans `point-controle-documents-uploader.tsx` et `document-upload-form.tsx`.

**P2-3 : `useReducer` pour la machine d'état du canvas** (`photo-annotator.tsx`)
Machine d'état explicite à 3 phases (`idle` / `drawing` / `placing-text`) avec 6 actions typées. Remplace 3 `useState` (`drawing`, `currentAnnotation`, `textPosition`) par un seul `useReducer`. Comportement utilisateur strictement identique.

**P2-1 : skip** (Server Components + Server Actions pour `admin/documents`) — repoussé à plus tard, mérite une PR dédiée vu la nature architecturale du changement.

### Bilan chiffré

| Hotspot | Avant | Après | Δ |
|---|---:|---:|---:|
| `photo-annotator.tsx` | 506 | 411 | −95 |
| `point-controle-form.tsx` | 506 | 221 | −285 |
| `admin/documents/page.tsx` | 720 | 119 | −601 |
| **Total 3 hotspots** | **1 732** | **751** | **−981 (−57 %)** |

12 nouveaux modules, build production OK (29/29 pages), `npx tsc --noEmit` clean.

---

## Bugs corrigés pendant la phase de test — 2026-05-10

### Bug RLS sur `categories` — création de catégorie custom impossible

**Symptôme** : Modal "Nouveau point de contrôle" + "+ Nouvelle catégorie" → "Erreur lors de l'enregistrement" sans détail.

**Cause** : RLS sur `categories` n'avait qu'une policy `categories_select`. Aucune policy INSERT/UPDATE/DELETE → toute écriture bloquée par défaut. Bug préexistant non lié à la refacto P1-1.

**Fix** : `supabase/migrations/033_categories_admin_writes.sql` — ajoute les policies admin INSERT/UPDATE/DELETE en `is_custom = true` (modèle identique à `pc_*_admin` sur `points_controle`). Bonus : amélioré le `catch` dans `point-controle-form.tsx` pour exposer le message d'erreur Supabase réel.

### Bug Resend — emails "envoyés" mais jamais reçus

**Symptôme** : Toast vert "Email envoyé avec succès" sur la base documentaire, mais aucun email reçu côté destinataire.

**Cause** : Le SDK Resend renvoie `Promise<{ data, error }>` — quand l'envoi est refusé (domaine non vérifié, clé invalide, etc.), il met l'erreur dans `result.error` **sans throw**. Le code faisait `await resend.emails.send(...)` et arrivait au `return success: true` même en cas d'échec.

**Fix** :
- `src/app/api/documents/email/route.ts` et `src/lib/email/send-rapport.ts` : vérifier `result.error` après l'envoi, retourner 502 + message Resend précis si erreur.
- `RESEND_FROM_EMAIL` était `rapports@chantiers.securionis.com` (sous-domaine), changé en `rapports@securionis.com` (domaine racine vérifié sur Resend). Les sous-domaines sont traités comme des domaines distincts par Resend.

---

## Audit du 2026-03-20

### Bug corrigé : stale closure dans `handlePhotoRemove`

**Fichier :** `src/components/visite/checklist-item.tsx`

**Problème :** `handlePhotoRemove` appelait `removePhoto(url)` avant de lire
`photoUpload.photos` pour construire le tableau filtré. Après `removePhoto()`,
le state interne du hook déclenche un re-render, mais la lecture de
`photoUpload.photos` dans la même closure reflect l'état **avant** mise à jour.
La photo supprimée pouvait donc être incluse à tort dans l'appel `onChange`.

**Correction :**
```tsx
// ❌ Avant
function handlePhotoRemove(url: string) {
  photoUpload.removePhoto(url);           // déclenche setState
  const newPhotos = photoUpload.photos    // lit l'état stale
    .filter((p) => p !== url);
  emitChange(valeur, remarque, newPhotos);
}

// ✅ Après
function handlePhotoRemove(url: string) {
  const newPhotos = photoUpload.photos    // lit l'état courant
    .filter((p) => p !== url);
  photoUpload.removePhoto(url);           // déclenche setState
  emitChange(valeur, remarque, newPhotos);
}
```

### Bugs déjà corrigés (non reproductibles au moment de l'audit)

| Bug | Fichier | Statut |
|-----|---------|--------|
| `useState` utilisé à la place de `useEffect` | `checklist-item.tsx` | Déjà corrigé |
| Prop `chantierId` inutilisée dans `RapportActions` | `rapport-actions.tsx` / `rapport/page.tsx` | Déjà corrigé |
| `<li>` sans attribut `key` | `rapport/page.tsx` | Inexistant (faux positif) |

---

## Sécurisation des clés API — 2026-03-22

### Problème

Les variables d'environnement (`SUPABASE_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `RESEND_API_KEY`) étaient accédées via des assertions non-null (`process.env.X!`) sans validation. Aucune protection contre l'exposition accidentelle de clés secrètes côté client.

### Corrections

**Nouveau fichier : `src/lib/env.ts`**
- Module centralisé de validation des variables d'environnement
- Fonctions getter paresseuses (compatibles inlining Next.js des `NEXT_PUBLIC_*`)
- Garde `requireServer()` : empêche l'accès à `SERVICE_ROLE_KEY` et `RESEND_API_KEY` côté client (`typeof window !== "undefined"`)
- Messages d'erreur explicites si une variable manque

**Fichiers mis à jour :**
- `src/lib/supabase/server.ts` — utilise `getSupabaseUrl()`, `getSupabaseAnonKey()`, `getServiceRoleKey()`
- `src/lib/supabase/client.ts` — utilise `getSupabaseUrl()`, `getSupabaseAnonKey()`
- `src/lib/supabase/middleware.ts` — utilise `getSupabaseUrl()`, `getSupabaseAnonKey()`
- `src/lib/email/send-rapport.ts` — utilise `getResendApiKey()`, `getResendFromEmail()`

**Fix complémentaire : `src/types/database.ts`**
- Ajout des champs `categorie_ids` et `renseignements_par` dans le type `visites` (manquants depuis les migrations 012 et 014)

### Vérification

```
npm run build  →  ✓ Compiled successfully
```

---

## Fix routes auth publiques + Service Worker + migration documents — 2026-03-23

### Problème 1 : Routes d'inscription inaccessibles

Le middleware (`src/lib/supabase/middleware.ts`) redirigeait vers `/login` toute URL non authentifiée sauf `/login` et `/auth`. Les routes `/register`, `/forgot-password` et `/reset-password` étaient donc bloquées — la page d'inscription ne s'affichait jamais.

**Correction :**
```ts
// ❌ Avant
if (!user && !request.nextUrl.pathname.startsWith("/login") && !request.nextUrl.pathname.startsWith("/auth"))

// ✅ Après
const publicPaths = ["/login", "/register", "/forgot-password", "/reset-password", "/auth"];
const isPublic = publicPaths.some((p) => request.nextUrl.pathname.startsWith(p));
if (!user && !isPublic)
```

**Fix complémentaire (`src/app/(auth)/login/page.tsx`) :**
- Les liens `<Link>` vers `/register` et `/forgot-password` remplacés par des `<button>` avec `window.location.href` pour forcer une navigation complète (la navigation côté client Next.js échouait silencieusement)

### Problème 2 : Table `documents` inexistante en production

La migration `016_create_documents.sql` n'avait pas été appliquée sur la base Supabase distante. Erreur : `Could not find the table 'public.documents' in the schema cache`.

**Correction :**
- Migration appliquée via `npx supabase db query --linked`
- Les migrations 001-015 avaient été exécutées manuellement, hors du tracking CLI

### Problème 3 : Service Worker — erreur `cache.put` sur scheme non-http

Le SW tentait de mettre en cache des requêtes avec un scheme `chrome-extension://`, ce qui provoquait une `TypeError`.

**Correction (`public/sw.js`) :**
```js
// Ajout du filtre de protocole
if (!url.protocol.startsWith("http")) return;
```
- Cache incrémenté de v1 à v2 pour forcer le renouvellement

### Problème 4 : Config Supabase CLI obsolète

`supabase/config.toml` contenait une section `[project]` non supportée par Supabase CLI v2.83+, et `major_version` était à 15 au lieu de 17.

**Correction :**
- Section `[project]` supprimée
- `major_version` passé de 15 à 17

### Vérification

```
npm run build  →  ✓ Compiled successfully
docker compose build + deploy → ✓ chantiers.securionis.com opérationnel
```

---

## Refonte points de contrôle + améliorations PDF/IA — 2026-03-24/25

### Refonte points de contrôle

Remplacement de la hiérarchie phases → catégories (144 points) par catégories → thèmes (568 points SUVA) :
- Migration 017 : tables `themes`, `point_controle_documents`, alter `points_controle` et `categories`
- Migration 018 : import 128 catégories, 530 thèmes, 568 points depuis Excel SUVA
- Suppression des anciennes données (phases, catégories, points SUVA)
- Nouveau flux visite : catégories (checkboxes) → thèmes (filtrés) → démarrer
- Ajout catégories/thèmes en cours de visite (bouton "+ Catégories / Thèmes")
- Admin : filtres catégorie/thème/statut, créer un nouveau thème, upload PDF (max 5)

### Rapport PDF

- Photos en images (120x90px) au lieu de texte "X photo(s) jointe(s)"
- Remarques formatées en texte brut (plus de markdown brut affiché)
- Logo agrandi (40→60px hauteur)
- Suppression tableau "Historique des non-conformités" et section "Délai(s)"
- Délai + statut affichés directement sous chaque constatation

### IA — Français accentué

- Prompts analyse photo et assistant juridique imposent le français avec accents
- Fonction `stripMarkdown()` nettoie les réponses IA partout (assistant, analyse, checklist, PDF, modal NC)
- "Copier dans la remarque" résume le texte en 2-3 phrases via l'IA

### Archivage des chantiers

- Migration 019 : colonnes `archived` + `archived_at`, policy UPDATE inspecteur
- Badge "Actif"/"Archivé" + bouton archiver/restaurer sur la fiche chantier
- Chantiers archivés exclus du dashboard et de la liste active
- Page `/chantiers/archives` pour consultation
- Accès archives depuis le dashboard et la page chantiers

### Accentuation complète

Correction de tous les textes français sans accents dans l'interface :
"Créer", "généré", "immédiat", "contrôle", "délai", "non-conformité", "constatée", "trouvé"

### Vérification

```
npm run build  →  ✓ Compiled successfully
Migrations 017-019 appliquées sur Supabase distant
```

---

## Dashboard inspecteur — 2026-03-22

### Ajout

Nouvelle page `/dashboard` avec vue d'ensemble personnalisée par inspecteur (filtrée par RLS).

**Indicateurs KPI :**
- Chantiers actifs — nombre de chantiers de l'inspecteur
- NC ouvertes — non-conformités non résolues
- Visites ce mois — nombre de visites réalisées dans le mois en cours
- Taux de conformité — % moyen sur les 3 derniers mois

**Graphique :** Évolution des NC sur 6 mois (barres empilées ouvertes/corrigées, CSS pur sans lib externe)

**Liste :** Chantiers avec NC urgentes en attente (délai dépassé trié en priorité)

**Fichiers créés :**
- `src/app/(dashboard)/dashboard/page.tsx` — Server Component, requêtes Supabase
- `src/app/(dashboard)/dashboard/nc-chart.tsx` — Client Component, graphique barres

**Fichiers modifiés :**
- `src/app/(dashboard)/nav.tsx` — lien Dashboard ajouté, logo pointe vers `/dashboard`
- `src/app/page.tsx` — redirection `/` → `/dashboard` au lieu de `/chantiers`

### Vérification

```
npm run build  →  ✓ Compiled successfully
```

---

## PWA offline — 2026-03-22

### Ajout

Support complet PWA : installation sur écran d'accueil, cache offline, formulaire de visite utilisable sans réseau avec synchronisation au retour.

**Service Worker (`public/sw.js`) :**
- Cache-first pour assets statiques (CSS, JS, images, fonts)
- Network-first pour les pages (dashboard, chantiers, visites)
- Page de fallback offline si aucune version en cache
- Pré-cache du manifest et de l'icône

**IndexedDB offline store (`src/lib/offline/`) :**
- `db.ts` — stockage des réponses en attente, photos en attente, et fiches visitées en cache
- `sync.ts` — synchronisation des données locales vers Supabase au retour du réseau

**Autosave offline (`src/hooks/use-autosave.ts`) :**
- Écriture IndexedDB en premier (local-first), puis tentative réseau
- Nouveau statut `saved-offline` affiché dans la checklist
- Si le réseau échoue, les données restent en local pour sync ultérieure

**Indicateur réseau :**
- `src/hooks/use-online-status.ts` — détecte online/offline, compteur de pending, auto-sync au retour
- `src/components/ui/offline-banner.tsx` — bandeau rouge "Hors-ligne" ou ambre "X modifications en attente" avec bouton sync manuel

**PWA manifest :**
- Icône SVG (bouclier + coche, bleu #1e40af)
- `start_url: /dashboard`, `display: standalone`
- Icônes déclarées pour installation (any + maskable)

**Fichiers modifiés :**
- `src/app/layout.tsx` — enregistrement du service worker via `<SwRegister />`
- `src/app/(dashboard)/layout.tsx` — bandeau `<OfflineBanner />`
- `src/components/visite/checklist-form.tsx` — affichage statut "Sauvegardé hors-ligne"
- `src/middleware.ts` — exclusion de `sw.js` du middleware auth

### Vérification

```
npm run build  →  ✓ Compiled successfully
```

---

## Relation inspecteur ↔ entreprise — 2026-03-22

### Problème

Le modèle "1 entreprise → N inspecteurs" existait en base (migration 015) mais n'était pas complet :
- `entreprise_id` absent des types TypeScript `profiles`
- Table `entreprises` absente des types TypeScript
- Création d'utilisateur : `entreprise_id` non assigné au nouveau profil
- Email de rapport : signature FWN/Karim Sahraoui hardcodée

### Corrections

**Types (`src/types/database.ts`) :**
- Ajout `entreprise_id: string | null` dans Row/Insert/Update de `profiles`
- Ajout table `entreprises` complète (nom, adresse, npa, ville, telephone, email, logo_url)

**API create-user (`src/app/api/admin/create-user/route.ts`) :**
- Récupère `entreprise_id` du profil admin créateur
- Assigne automatiquement cette `entreprise_id` au nouveau profil

**Email dynamique (`src/lib/email/send-rapport.ts`) :**
- Signature construite dynamiquement depuis les données entreprise + nom inspecteur
- Fonction `buildEmailHtml()` remplace le bloc HTML hardcodé
- Paramètres ajoutés : `inspecteurNom`, `entreprise` (nom, adresse, téléphone, email)

**API email (`src/app/api/visites/[id]/email/route.ts`) :**
- Charge le profil inspecteur et son entreprise associée
- Passe ces données à `sendRapport()` pour la signature

### Vérification

```
npm run build  →  ✓ Compiled successfully
```
