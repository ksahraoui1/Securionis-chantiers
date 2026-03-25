# Écrans & Architecture — Securionis Chantiers

> Dernière mise à jour : 2026-03-25

---

## Écrans de l'application

| # | Route | Titre | Description |
|---|-------|-------|-------------|
| 1 | `/login` | Connexion | Email/mot de passe + liens inscription et reset |
| 2 | `/register` | Inscription | Création de compte (nom, email, mot de passe) |
| 3 | `/forgot-password` | Mot de passe oublié | Envoi lien de réinitialisation par email |
| 4 | `/reset-password` | Nouveau mot de passe | Formulaire reset via lien email |
| 5 | `/dashboard` | Tableau de bord | KPIs cliquables, graphique NC 6 mois, chantiers urgents, export Excel, accès archives |
| 6 | `/chantiers` | Liste chantiers | Recherche, badges NC, stats, lien archives |
| 6b | `/chantiers/archives` | Chantiers archivés | Liste des chantiers archivés, consultation visites/rapports |
| 7 | `/chantiers/nouveau` | Nouveau chantier | Formulaire création avec icônes par champ |
| 8 | `/chantiers/[id]` | Détail chantier | Badge actif/archivé, archiver/restaurer, infos, documents, destinataires, visites, comparaison N/N-1, NC |
| 9 | `/chantiers/[id]/modifier` | Modifier chantier | Édition des informations |
| 10 | `/chantiers/[id]/visites/nouvelle` | Nouvelle visite | Sélection catégories → thèmes (multi-select + recherche) |
| 11 | `/chantiers/[id]/visites/[id]` | Visite en cours | Checklist + ajout catégories/thèmes en cours + photos + annotation + analyse IA + assistant juridique |
| 12 | `/chantiers/[id]/visites/[id]/rapport` | Rapport | PDF avec photos, délai/statut sous constatations, envoi email |
| 13 | `/admin/points-controle` | Points de contrôle | Filtres catégorie/thème/statut, activer/désactiver, modifier, créer thèmes, upload PDF |
| 14 | `/admin/utilisateurs` | Utilisateurs | Liste, changement de rôle, création |
| 15 | `/admin/entreprise` | Entreprise | Logo, coordonnées, configuration |

---

## Fonctionnalités par écran

### Visite en cours (écran 11)
- Checklist par point de contrôle (conforme / non-conforme / pas nécessaire)
- **Ajout catégories/thèmes en cours de visite** (bouton "+ Catégories / Thèmes")
- Champ remarque auto-extensible
- Explications et documents PDF réglementaires par point
- Capture photo (appareil / galerie)
- **Annotation photo** : éditeur Canvas plein écran (flèche, cercle, texte, dessin libre)
- **Analyse IA** : détection dangers via Claude Vision, suggestion remarque + conformité (français accentué)
- **Assistant juridique** : chat IA expert droit suisse, résumé auto lors de la copie en remarque

### Détail chantier (écran 8)
- **Badge actif/archivé** + bouton archiver/restaurer
- Informations du chantier (grille responsive 1→2 colonnes)
- **Gestion documentaire** : upload, versionnement, 6 catégories, filtres
- Destinataires (email rapport)
- Timeline des visites (masquée si archivé : pas de nouvelle visite)
- **Comparaison visite N vs N-1** : corrigées, persistantes, nouvelles NC
- Liste des écarts NC avec filtres et actions
- **Export Excel** par chantier

### Dashboard (écran 5)
- KPIs cliquables avec icônes : chantiers actifs, NC ouvertes, visites ce mois, taux conformité
- Graphique NC 6 mois (barres empilées)
- Chantiers avec NC urgentes
- **Export Excel** global + **accès archives**
- Exclut les chantiers archivés des calculs

---

## Design System

| Token | Valeur | Usage |
|-------|--------|-------|
| Primary | `#131B2E` | Nav top bar, CTA |
| Secondary | `#006E2D` | Conforme, succès |
| Tertiary | `#F63A35` | NC, alertes, erreurs |
| Surface | `#F9F9FF` | Fond général |
| Cards | `#FFFFFF` | Cartes actives |
| Sections | `#F0F3FF` | Fond sections |
| Font | Inter | Tous les niveaux |
| Icons | Material Symbols Outlined | Navigation, actions, statuts |
| Radius | `xl` (1.5rem) | Cartes principales |
| Shadow | `0px 12px 32px rgba(21,28,39,0.06)` | Cartes tappables |
| Touch | min 44x44px | Tous les éléments interactifs |

---

## Flux de navigation

```
Login ──→ Dashboard
  │         │
  │         ├──→ Mes Chantiers ──→ Détail Chantier ──→ Nouvelle Visite ──→ Checklist
  │         │       │               │   (actif/archivé)   (catégories→thèmes)   │
  │         │       │               ├── Documents                               ├── + Catégories/Thèmes
  │         │       │               ├── Comparaison N/N-1                       ├── Photos + Annotation
  │         │       │               ├── Export Excel                            ├── Analyse IA
  │         │       │               ├── Archiver/Restaurer                      ├── Assistant Juridique
  │         │       │               └── Écarts NC                               └── Résumé → Rapport PDF
  │         │       │
  │         │       └──→ Archives (chantiers archivés — consultation seule)
  │         │
  │         └──→ Administration (admin)
  │               ├── Points de contrôle (catégories/thèmes, PDFs)
  │               ├── Utilisateurs
  │               └── Entreprise
  │
  ├──→ Register (inscription)
  └──→ Forgot Password → Reset Password
```

---

## Stack technique

| Composant | Technologie |
|-----------|-------------|
| Frontend | Next.js 16 (App Router), React, TypeScript |
| Styling | Tailwind CSS 4.x |
| Base de données | Supabase (PostgreSQL + Auth + Storage) |
| IA | @anthropic-ai/sdk (Claude Sonnet — Vision + Chat) |
| PDF | @react-pdf/renderer |
| Excel | xlsx (SheetJS) |
| Email | Resend |
| Déploiement | Docker + Nginx + Let's Encrypt |
| Hébergement | VPS Hostinger |
| URL | https://chantiers.securionis.com |
