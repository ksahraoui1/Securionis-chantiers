# Écrans & Architecture — Securionis Chantiers

> Dernière mise à jour : 2026-03-23

---

## Écrans de l'application

| # | Route | Titre | Description |
|---|-------|-------|-------------|
| 1 | `/login` | Connexion | Email/mot de passe + liens inscription et reset |
| 2 | `/register` | Inscription | Création de compte (nom, email, mot de passe) |
| 3 | `/forgot-password` | Mot de passe oublié | Envoi lien de réinitialisation par email |
| 4 | `/reset-password` | Nouveau mot de passe | Formulaire reset via lien email |
| 5 | `/dashboard` | Tableau de bord | KPIs, graphique NC 6 mois, chantiers urgents, export Excel |
| 6 | `/chantiers` | Liste chantiers | Recherche, badges NC, stats par chantier |
| 7 | `/chantiers/nouveau` | Nouveau chantier | Formulaire création avec icônes par champ |
| 8 | `/chantiers/[id]` | Détail chantier | Infos, documents, destinataires, visites, comparaison N/N-1, NC |
| 9 | `/chantiers/[id]/modifier` | Modifier chantier | Édition des informations |
| 10 | `/chantiers/[id]/visites/nouvelle` | Nouvelle visite | Configuration : date, catégories, phases |
| 11 | `/chantiers/[id]/visites/[id]` | Visite en cours | Checklist + photos + annotation + analyse IA + assistant juridique |
| 12 | `/chantiers/[id]/visites/[id]/rapport` | Rapport | Visualisation + envoi PDF par email |
| 13 | `/admin/points-controle` | Points de contrôle | CRUD, filtres par phase, badges personnalisé/désactivé |
| 14 | `/admin/utilisateurs` | Utilisateurs | Liste, changement de rôle, création |
| 15 | `/admin/entreprise` | Entreprise | Logo, coordonnées, configuration |

---

## Fonctionnalités par écran

### Visite en cours (écran 11)
- Checklist par point de contrôle (conforme / non-conforme / pas nécessaire)
- Champ remarque auto-extensible
- Capture photo (appareil / galerie)
- **Annotation photo** : éditeur Canvas plein écran (flèche, cercle, texte, dessin libre)
- **Analyse IA** : détection dangers via Claude Vision, suggestion remarque + conformité
- **Assistant juridique** : chat IA expert droit suisse (OTConst, SUVA, SIA)

### Détail chantier (écran 8)
- Informations du chantier (grille responsive 1→2 colonnes)
- **Gestion documentaire** : upload, versionnement, 6 catégories, filtres
- Destinataires (email rapport)
- Timeline des visites
- **Comparaison visite N vs N-1** : corrigées, persistantes, nouvelles NC
- Liste des écarts NC avec filtres et actions
- **Export Excel** par chantier

### Dashboard (écran 5)
- KPIs : chantiers actifs, NC ouvertes, visites ce mois, taux conformité
- Graphique NC 6 mois (barres empilées)
- Chantiers avec NC urgentes
- **Export Excel** global

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
  │         │                       │                                        │
  │         │                       ├── Documents                            ├── Photos + Annotation
  │         │                       ├── Comparaison N/N-1                    ├── Analyse IA
  │         │                       ├── Export Excel                         ├── Assistant Juridique
  │         │                       └── Écarts NC                            └── Résumé → Rapport PDF
  │         │
  │         └──→ Administration (admin)
  │               ├── Points de contrôle
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
