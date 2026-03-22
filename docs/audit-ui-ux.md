# Audit UI/UX · Securionis Chantiers

---

## 1. Résumé exécutif

| Dimension                | Note      | Commentaire                                               |
| ------------------------ | --------- | --------------------------------------------------------- |
| Design system            | ✅ 9/10   | Palette codifiée, tokens nommés, glassmorphisme correct |
| Cohérence visuelle      | ⚠️ 7/10 | Quelques incohérences dans les formulaires               |
| Qualité mobile          | ✅ 8/10   | Navigation bottom-nav, touch targets 44px, safe-area      |
| Responsive desktop       | ⚠️ 6/10 | Pages pensées mobile, pas adaptées desktop              |
| Accessibilité           | ⚠️ 5/10 | Labels manquants, contrastes insuffisants sur le header   |
| Fiabilité fonctionnelle | ✅ 8/10   | Auth solide, offline-banner, service worker               |
| Maturité production     | ⚠️ 6/10 | Plusieurs points bloquants listés ci-dessous             |

---

## 2. Problèmes identifiés

### 🔴 Critiques (bloquants production)

#### P1 — Input mot de passe sans placeholder

**Fichier :** `src/app/(auth)/login/page.tsx` ligne 88–95
Le champ `type="password"` n'a pas d'attribut `placeholder`. Le lock icon apparaît flottant dans un champ vide, sans indication à l'utilisateur.
**Fix :** Ajouter `placeholder="••••••••"` à l'input password.

#### P2 — Header login quasi-invisible en desktop

**Fichier :** `src/app/(auth)/login/page.tsx` ligne 38
Le header navy (`bg-primary-container` = `#131B2E`) est bien construit pour mobile, mais en viewport desktop (>768px) le shield blanc sur fond blanc (`bg-on-tertiary-container/20` très pâle) est invisible. En mobile, le card blanc chevauche bien le header (effet `-mt-8`), mais en desktop cet overlap ne fonctionne pas correctement.
**Fix :** Ajouter un `max-w-sm` sur le layout login ou contraindre le viewport à mobile.

#### P3 — Contrastes WCAG insuffisants sur le header nav

**Fichier :** `src/app/(dashboard)/nav.tsx` ligne 44
`bg-primary-container` (#131B2E) avec `text-on-primary-container` (#7c839b) ne passe pas le ratio WCAG AA (4.5:1). Le texte secondaire du header (rôle, email…) est trop pâle.
**Fix :** Utiliser `text-white/90` ou `text-on-primary` (#ffffff) pour tout texte sur fond navy.

---

### 🟡 Importants (UX dégradée)

#### P4 — Boutons Photo & Remarque dans ChecklistItem déclenchent la même action

**Fichier :** `src/components/visite/checklist-item.tsx` lignes 152–169
Les deux boutons "Photo" et "Remarque" appellent tous deux `setShowDetails(!showDetails)`. Cliquer sur "Photo" et sur "Remarque" fait la même chose : afficher/masquer le bloc détails. L'utilisateur ne comprend pas qu'ils déclenchent la même vue.
**Fix :** Séparer en deux états distincts (`showPhoto`, `showRemarque`) ou fusionner en un seul bouton "Détails ▾".

#### P5 — Labels `<label>` non associés aux `<input>` (accessibilité)

**Fichier :** `src/app/(auth)/login/page.tsx` lignes 61–76
Les `<label>` n'ont pas d'attribut `for` (ou `htmlFor` en JSX) lié aux inputs. Les lecteurs d'écran ne peuvent pas associer correctement le label à son champ.
**Fix :** Ajouter `htmlFor="email"` sur le label email, `id="email"` sur l'input, idem pour password.

#### P6 — FAB "Nouvelle visite" sur la page `/chantiers`

**Fichier :** `src/app/(dashboard)/nav.tsx` ligne 76
Le FAB redirige vers `/chantiers` (et non vers `/chantiers/nouveau` ou une vraie page de nouvelle visite). L'action est donc inutile — cliquer dessus reste sur la même page.
**Fix :** Changer `href="/chantiers"` en `href="/chantiers/nouveau"` ou implémenter un sélecteur de chantier avant de rediriger.

#### P7 — Absence d'état vide (empty state) dans le dashboard

**Fichier :** `src/app/(dashboard)/dashboard/page.tsx`
Si l'utilisateur n'a aucun chantier, aucune visite et aucun écart, le dashboard ne rend rien du tout (les sections conditionnelles ne s'affichent pas) et le graphique dit seulement "Aucune donnée disponible". Absence totale de call-to-action ni de guidage pour créer son premier chantier.
**Fix :** Ajouter un composant `<EmptyState>` avec illustration + CTA "Créer un chantier".

#### P8 — Les labels de valeurs checklist masqués sur mobile

**Fichier :** `src/components/visite/checklist-item.tsx` ligne 212
`<span className="hidden sm:inline">{opt.label}</span>` masque le texte des options (Conforme, Non-conf., Pas néc.) sur mobile. Sur les petits écrans, seules les icônes sont visibles — ce qui est insuffisant pour l'accessibilité et pour les nouveaux utilisateurs.
**Fix :** Afficher systématiquement les labels, ou utiliser des abréviations toujours visibles. Retirer `hidden sm:inline`.

---

### 🔵 Mineurs (polish & améliorations)

#### P9 — Gradient btn-gradient imperceptible

**Fichier :** `src/app/globals.css` ligne 29
`linear-gradient(180deg, #131b2e 0%, #3f465c 100%)` — la différence de couleur entre les deux stops est trop subtile. Le bouton paraît d'une couleur plate.
**Fix :** Accentuer légèrement le gradient, ex : `#1a2645` → `#4a5580` ou ajouter un clair en haut.

#### P10 — Pas de `<title>` dynamique par page

**Fichier :** `src/app/layout.tsx`
Le titre de la page ne change pas selon la route (toujours "Securionis" ou similaire). Sur mobile, l'onglet ne renseigne pas l'utilisateur sur où il se trouve.
**Fix :** Utiliser le `metadata` export Next.js dans chaque page pour définir un titre contextuel.

#### P11 — Inputs sans `focus-visible` explicite (anneau de focus)

Toutes les pages utilisent `focus:ring-2 focus:ring-primary-container/20`. La valeur `/20` (20% opacité) rend l'anneau de focus quasiment invisible. Problème d'accessibilité clavier.
**Fix :** Passer à `focus:ring-primary-container/60` ou `focus:ring-2 focus:ring-offset-2`.

#### P12 — Pas de `aria-label` sur les boutons icône

Les boutons icône (logout, edit, arrow_back…) n'ont pas de `aria-label`. Les lecteurs d'écran annoncent "button" sans contexte.
**Fix :** Ajouter `aria-label="Déconnexion"`, `aria-label="Retour"`, etc.

#### P13 — Pas de `loading.tsx` pour les routes lentes

En navigation sur les pages chantiers/visites (requêtes Supabase multiples), il n'y a pas de fichier `loading.tsx` Next.js → pas de skeleton/loader pendant le chargement serveur.
**Fix :** Créer `loading.tsx` dans les routes clés.

---

## 3. Plan d'action priorisé

### Sprint 1 — Bloquants (1–2 heures)

1. **[P1]** Ajouter `placeholder="••••••••"` sur l'input password du login
2. **[P5]** Lier `<label htmlFor>` aux `<input id>` sur la page login
3. **[P6]** Corriger l'URL du FAB (`/chantiers` → `/chantiers/nouveau`)
4. **[P3]** Corriger le contraste texte header nav (utiliser `text-white`)

### Sprint 2 — UX (2–4 heures)

5. **[P4]** Séparer Photo et Remarque en actions distinctes dans ChecklistItem
6. **[P7]** Créer un `<EmptyState>` pour le dashboard sans données
7. **[P8]** Rendre les labels checklist toujours visibles (supprimer `hidden sm:inline`)
8. **[P11]** Augmenter l'opacité du focus ring

### Sprint 3 — Polish (1–2 heures)

9. **[P9]** Accentuer le gradient du bouton primaire
10. **[P10]** Ajouter les `metadata` export par page Next.js
11. **[P12]** Ajouter `aria-label` sur tous les boutons icône
12. **[P13]** Créer des fichiers `loading.tsx` pour les routes clés

---

## 4. Points forts à conserver

- ✅ **Design system solide** : tokens Tailwind nommés de façon sémantique (`surface-container-low`, `on-tertiary-container`…), très cohérent
- ✅ **Navigation mobile exemplaire** : bottom nav glassmorphisme, safe-area iOS, touch targets 44px sur tous les éléments interactifs
- ✅ **Architecture auth robuste** : middleware de redirection, vérification côté serveur sur chaque route
- ✅ **Offline-first** : OfflineBanner, service worker enregistré
- ✅ **Animations soignées** : `active:scale-[0.98]`, `transition-all`, `hover:scale-[1.02]` sur les liens
- ✅ **Typographie précise** : labels `text-[10px] uppercase tracking-widest` donnent un caractère professionnel et aéré
- ✅ **Scrollbar personnalisée** : 4px, transparente, très discrète
- ✅ **PhotoCapture** : flux de capture photo dans la checklist, avec upload et gestion d'erreur

---

## 5. Recommandations complémentaires pour la production

| Aspect                | Action recommandée                                                                     |
| --------------------- | --------------------------------------------------------------------------------------- |
| **SEO / PWA**   | Vérifier `manifest.json`, icônes 192/512, `theme-color` meta                      |
| **Performance** | Ajouter `next/image` pour les logos entreprise (actuellement `<img>`)               |
| **Sécurité**  | Vérifier les RLS Supabase sur toutes les tables (chantiers, visites, ecarts, reponses) |
| **Tests**       | Ajouter au moins des tests de smoke sur login + création chantier                      |
| **Monitoring**  | Brancher Sentry ou Vercel Analytics pour les erreurs en production                      |
