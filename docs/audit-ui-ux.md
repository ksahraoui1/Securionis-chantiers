# Audit UI/UX · Securionis Chantiers

> Dernière mise à jour : 2026-03-23

---

## 1. Résumé exécutif

| Dimension                | Note      | Commentaire                                               |
| ------------------------ | --------- | --------------------------------------------------------- |
| Design system            | ✅ 9/10   | Palette codifiée, tokens nommés, Material Symbols         |
| Cohérence visuelle      | ✅ 8/10   | Formulaires harmonisés, inputs avec icônes               |
| Qualité mobile          | ✅ 9/10   | Navigation hamburger, touch targets 44px, responsive      |
| Responsive desktop       | ✅ 8/10   | Grilles adaptatives, breakpoints sm/md/lg                |
| Accessibilité           | ⚠️ 7/10 | Labels associés, aria-labels sur boutons icônes           |
| Fiabilité fonctionnelle | ✅ 9/10   | Auth solide, inscription, reset password, offline-banner  |
| Fonctionnalités IA      | ✅ 9/10   | Analyse photos, assistant juridique, suggestions auto     |
| Maturité production     | ✅ 8/10   | Déployé HTTPS, Docker, SSL auto-renew                    |

---

## 2. Problèmes résolus (depuis l'audit initial)

| # | Problème | Statut | Commit |
|---|----------|--------|--------|
| P1 | Input password sans placeholder | ✅ Résolu | Login refondu |
| P2 | Header login invisible desktop | ✅ Résolu | Layout auth responsive |
| P3 | Contrastes WCAG header nav | ✅ Résolu | Navigation refaite |
| P4 | Boutons Photo/Remarque identiques | ✅ Résolu | Séparés dans checklist-item |
| P5 | Labels non associés aux inputs | ✅ Résolu | htmlFor ajoutés |
| P6 | FAB mauvais lien | ✅ Résolu | Navigation refaite |
| P7 | Absence d'empty state dashboard | ✅ Résolu | empty-state.tsx créé |
| P8 | Labels checklist masqués mobile | ✅ Résolu | Labels toujours visibles |
| P10 | Pas de title dynamique | ✅ Résolu | metadata export par page |
| P13 | Pas de loading.tsx | ✅ Résolu | loading.tsx créés |

---

## 3. Problèmes restants

### 🟡 Mineurs

#### P9 — Gradient bouton primaire subtil
**Fichier :** `src/app/globals.css`
Le gradient `btn-gradient` est très subtil. Pas bloquant mais pourrait être plus visible.

#### P11 — Focus ring peu visible
Certains inputs utilisent `focus:ring-1` avec opacité faible. Pourrait être renforcé pour l'accessibilité clavier.

#### P12 — Images sans next/image
Les logos entreprise et photos utilisent `<img>` au lieu de `next/image` pour l'optimisation.

---

## 4. Points forts

- ✅ **Navigation responsive** : menu hamburger mobile avec icônes, desktop horizontal
- ✅ **Inscription self-service** : /register avec création auto du profil
- ✅ **Reset password** : flux complet forgot → email → reset → dashboard
- ✅ **Annotation photos** : éditeur Canvas plein écran (flèches, cercles, texte)
- ✅ **Analyse IA** : détection de dangers via Claude Vision
- ✅ **Assistant juridique** : chat IA expert droit suisse intégré par point de contrôle
- ✅ **Export Excel** : global et par chantier avec statistiques
- ✅ **Comparaison visites** : N vs N-1 avec classifications
- ✅ **Gestion documentaire** : upload, versionnement, catégories
- ✅ **Champ remarque extensible** : auto-resize du textarea
- ✅ **Grilles adaptatives** : 1→2→4 colonnes selon la taille d'écran
- ✅ **Touch targets** : min 44x44px sur tous les éléments interactifs
- ✅ **Offline-first** : service worker, IndexedDB, sync auto
- ✅ **Déploiement production** : Docker + Nginx + SSL Let's Encrypt

---

## 5. Architecture des pages

```
/login              — Connexion (+ liens register, forgot-password)
/register           — Inscription self-service
/forgot-password    — Demande reset mot de passe
/reset-password     — Formulaire nouveau mot de passe

/dashboard          — KPIs, graphique NC, chantiers urgents, export Excel
/chantiers          — Liste chantiers avec recherche
/chantiers/nouveau  — Création chantier
/chantiers/[id]     — Détail : infos, documents, destinataires, visites, comparaison, NC
/chantiers/[id]/modifier — Édition chantier
/chantiers/[id]/visites/nouvelle — Nouvelle visite
/chantiers/[id]/visites/[id]     — Visite en cours (checklist + photos + IA)
/chantiers/[id]/visites/[id]/rapport — Rapport PDF

/admin/points-controle — CRUD points de contrôle
/admin/utilisateurs    — Gestion utilisateurs + rôles
/admin/entreprise      — Configuration entreprise + logo
```

---

## 6. APIs

| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/export/xlsx` | GET | Export Excel global ou par chantier |
| `/api/photos/analyze` | POST | Analyse IA photo (Claude Vision) |
| `/api/assistant/legal` | POST | Assistant juridique IA |
| `/api/visites/compare` | GET | Comparaison 2 visites |
| `/api/visites/[id]/pdf` | GET | Génération rapport PDF |
| `/api/visites/[id]/email` | POST | Envoi rapport par email |
| `/api/ecarts/[id]/statut` | PATCH | Mise à jour statut NC |
| `/api/admin/create-user` | POST | Création utilisateur (admin) |

---

## 7. Recommandations pour la suite

| Aspect | Action recommandée |
| ------ | ------------------ |
| **Performance** | Migrer `<img>` vers `next/image` pour les logos/photos |
| **SEO** | Ajouter `robots.txt`, `sitemap.xml` si app publique |
| **Tests** | Tests E2E sur login, création chantier, visite complète |
| **Monitoring** | Sentry pour les erreurs production |
| **Notifications** | Push notifications pour NC urgentes / délais dépassés |
| **Multi-langue** | i18n si expansion hors Suisse romande |
