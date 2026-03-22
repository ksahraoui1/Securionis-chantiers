# Corrections appliquées — Securionis-chantiers

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
