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

### Vérification

```
npx tsc --noEmit  →  0 erreur
```
