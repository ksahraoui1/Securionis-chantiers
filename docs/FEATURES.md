# Fonctionnalités — Securionis Chantiers

> Dernière mise à jour : 2026-03-23

## 1. Annotation des photos

**Fichiers** : `src/components/visite/photo-annotator.tsx`, `photo-capture.tsx`

Éditeur plein écran Canvas HTML5 intégré au flux de capture photo.

- **4 outils** : Flèche, Cercle, Texte, Dessin libre
- **5 couleurs** : Rouge, Vert, Navy, Jaune, Blanc
- **3 épaisseurs** de trait
- Undo (annulation dernière annotation)
- Touch events pour tablette sur chantier
- Export en pleine résolution (annotations rendues à l'échelle originale)
- S'ouvre automatiquement après chaque prise de photo
- Ré-annotation possible sur photos déjà uploadées (hover → icône crayon)

## 2. Export Excel (.xlsx)

**Fichiers** : `src/app/api/export/xlsx/route.ts`

API `GET /api/export/xlsx` avec 2 modes :

### Export global (`?scope=all`)
- Feuille **Chantiers** : tous les chantiers avec infos complètes
- Feuille **Visites** : toutes les visites avec inspecteur, statut, date
- Feuille **Écarts NC** : toutes les NC avec chantier, description, statut, délai
- Feuille **Statistiques** : KPIs (chantiers actifs, total visites, NC ouvertes/corrigées, taux de conformité)

### Export par chantier (`?scope=chantier&chantierId=xxx`)
- Feuille **Chantier** : fiche info
- Feuille **Visites** : visites du chantier avec nb NC par visite
- Feuille **Écarts NC** : NC du chantier
- Feuille **Réponses détaillées** : chaque point de contrôle avec valeur, remarque, base légale

Boutons d'export sur le dashboard et la page détail chantier.

## 3. Comparaison visite N vs N-1

**Fichiers** : `src/app/api/visites/compare/route.ts`, `src/components/visite/visite-compare.tsx`

Compare les réponses de 2 visites par point de contrôle.

- **Classifications** : Corrigée, Persistante, Nouvelle NC, Améliorée, Identique
- Auto-sélection des 2 visites les plus récentes
- 5 cartes résumé colorées
- Filtres par onglet (Tous, Nouvelles, Persistantes, Corrigées)
- Vue tableau responsive (grille desktop / stack mobile)
- Intégré dans la page détail chantier entre timeline et NC

## 4. Analyse IA des photos (Claude Vision)

**Fichiers** : `src/app/api/photos/analyze/route.ts`, `src/components/visite/photo-ai-analysis.tsx`

Détection automatique de dangers via Claude Sonnet (vision).

### Détections
- **Équipements manquants** : casques, harnais, garde-corps, filets, balisage
- **Zones à risque** : travail en hauteur, échafaudage instable, câbles exposés
- **Non-conformités visuelles** : normes suisses (SUVA, OTConst, SIA)

### Interface
- Bouton "Analyse IA" visible dès qu'une photo est uploadée
- Dangers affichés avec sévérité (critique/majeur/mineur) et icônes
- **Remarque suggérée** : clic pour l'appliquer au champ remarque
- **Suggestion conformité** : clic pour marquer conforme/non-conforme
- Indicateur de confiance en %

### Sécurité
- Clé API dans `.env.local` (gitignored), accès serveur uniquement via `requireServer()`
- Authentification vérifiée avant chaque appel

## 5. Assistant IA juridique

**Fichiers** : `src/app/api/assistant/legal/route.ts`, `src/components/visite/legal-assistant.tsx`

Copilote de terrain pour les questions juridiques pendant l'inspection.

### Expertise
- Ordonnance sur les travaux de construction (OTConst, RS 832.311.141)
- Ordonnance sur la prévention des accidents (OPA, RS 832.30)
- Loi sur le travail (LTr, RS 822.11)
- Directives SUVA (feuillets, listes de contrôle)
- Normes SIA (SIA 118, SIA 260, etc.)
- RPAC et réglementations cantonales
- Code des obligations (CO)
- Ordonnance sur les installations électriques à basse tension (OIBT)

### Interface
- Bouton "Assistant juridique" sur chaque point de contrôle
- **4 questions rapides** pré-définies (réglementation, critères, formulation NC, délais)
- Interface chat avec historique de conversation
- Rendu markdown (références légales en gras)
- Bouton **"Copier dans la remarque"** sur chaque réponse
- Contexte automatique : point de contrôle, critère et base légale envoyés à l'IA

## 6. Gestion documentaire par chantier

**Fichiers** : `supabase/migrations/016_create_documents.sql`, `src/components/chantier/document-manager.tsx`

Centralisation de tous les documents liés à un chantier.

### Catégories
- Permis de construire
- Plans
- Rapport ECA
- Autorisation travaux dangereux
- Certificat entreprise
- Autre

### Fonctionnalités
- **Upload** : formulaire avec nom, catégorie, description, sélection fichier (PDF, Word, Excel, Image, DWG)
- **Versionnement** : bouton "Nouvelle version" → remplace le fichier, incrémente le numéro (badge v2, v3...)
- **Filtres** par catégorie avec compteur
- **Téléchargement** direct
- **Suppression** avec confirmation
- Affichage : icône par catégorie, taille fichier, date, badge version

### Base de données
- Table `documents` : id, chantier_id (FK CASCADE), nom, categorie, description, fichier_url, fichier_nom, fichier_taille, version, uploaded_by
- Index sur chantier_id et categorie
- RLS activé

### Intégration
- Section "Documents" sur la page détail chantier, entre les informations et les destinataires

## 7. Inscription et gestion des mots de passe

**Fichiers** : `src/app/(auth)/register/page.tsx`, `forgot-password/page.tsx`, `reset-password/page.tsx`

### Inscription (`/register`)
- Champs : Nom complet, Email, Mot de passe, Confirmation mot de passe
- Validation : min 6 caractères, mots de passe identiques, email unique
- Crée l'utilisateur dans Supabase Auth + profil avec rôle `inspecteur`
- Si confirmation email requise → écran "Vérifiez votre email"
- Sinon → redirection directe vers le dashboard

### Mot de passe oublié (`/forgot-password`)
- Saisie de l'email
- Envoi d'un lien de réinitialisation via Supabase Auth
- Écran de confirmation avec instructions (vérifier spam)

### Réinitialisation (`/reset-password`)
- S'ouvre automatiquement via le lien reçu par email
- Détection de la session `PASSWORD_RECOVERY` de Supabase
- Formulaire : nouveau mot de passe + confirmation
- Redirection vers le dashboard après changement
- Gestion lien expiré avec proposition de renvoyer

### Liens sur la page login
- "Mot de passe oublié ?" à côté du label mot de passe
- "Créer un compte" en bas du formulaire

### Middleware auth
- Routes publiques autorisées : `/login`, `/register`, `/forgot-password`, `/reset-password`, `/auth`
- Navigation via `window.location.href` (navigation complète, pas de SPA routing)

## 8. Design responsive

**Fichiers** : navigation, dashboard, chantiers, pages auth, comparaison visites

### Navigation (`nav.tsx`)
- **Mobile** : menu hamburger avec icônes Material Symbols, liens empilés, section utilisateur séparée
- **Desktop** : navigation horizontale classique
- Breakpoint : `md:` (768px)

### Dashboard
- KPI : grille 1 colonne (mobile) → 2 colonnes (sm) → 4 colonnes (lg)
- Boutons : full-width sur mobile, auto-width sur desktop
- Headers : empilés verticalement sur mobile

### Pages chantiers
- Header : flex-col mobile, flex-row desktop
- Grille infos : 1 colonne mobile → 2 colonnes desktop
- Boutons "Nouveau" / "Nouvelle visite" : full-width mobile

### Pages authentification
- Padding adaptatif : `p-5` mobile, `p-8` desktop
- Formulaires full-width avec max-w-md centré

### Comparaison visites
- Grille résumé : 2 → 3 → 5 colonnes selon la taille
- Tableau : stack vertical mobile, grille desktop

## 9. Refonte points de contrôle — Catégories / Thèmes (2026-03-24)

**Fichiers** : migrations 017-018, `src/app/(dashboard)/admin/points-controle/page.tsx`, `src/components/admin/point-controle-form.tsx`, `nouvelle-visite-form.tsx`, `checklist-form.tsx`, `checklist-item.tsx`, `theme-adder.tsx`

### Nouvelle hiérarchie
- **128 catégories** (Accès & Sols, Échafaudages, Électricité, Fouilles, Toitures, etc.)
- **530 thèmes** par catégorie
- **568 points de contrôle** importés depuis Excel SUVA

### Flux nouvelle visite
1. Sélection de **catégories** (cases à cocher multiples + recherche)
2. Sélection de **thèmes** (filtrés par catégories + tout cocher/décocher)
3. Démarrage de la visite avec les thèmes sélectionnés

### Ajout en cours de visite
- Bouton **"+ Catégories / Thèmes"** dans la barre sticky de la checklist
- Panneau intégré pour ajouter des catégories/thèmes supplémentaires
- Les nouveaux points sont chargés sans perdre les réponses déjà saisies

### Administration
- Navigation par catégorie → thème → statut + recherche texte
- Activer/désactiver tout point de contrôle
- Modifier les points existants (intitulé, explications, base légale, critère)
- Créer un **nouveau thème** directement dans le formulaire
- Upload jusqu'à **5 documents PDF** réglementaires par point (disponible dès la création)

### Base de données
- Table `themes` (id, categorie_id, libelle, actif)
- Table `point_controle_documents` (id, point_controle_id, nom, fichier_url, fichier_nom, fichier_taille, ordre)
- Colonnes ajoutées sur `points_controle` : theme_id, explications

### Pendant la visite
- Points filtrés par thèmes sélectionnés
- Affichage des explications sur chaque point
- Liens vers les documents PDF réglementaires attachés
- Flux de vérification inchangé (conforme / non-conforme / pas nécessaire)

## 10. Archivage des chantiers (2026-03-25)

**Fichiers** : migration 019, `src/components/chantier/archive-toggle-button.tsx`, `src/app/(dashboard)/chantiers/archives/page.tsx`

### Fonctionnement
- Badge **"Actif"** (vert) ou **"Archivé"** (ambre) sur la fiche chantier
- Bouton **Archiver** / **Restaurer** sur la fiche chantier (avec confirmation)
- Chantiers archivés exclus de la liste active et du dashboard
- Bouton "Nouvelle visite" masqué sur les chantiers archivés

### Page archives (`/chantiers/archives`)
- Liste des chantiers archivés avec date d'archivage
- Consultation des visites et rapports toujours possible
- Accessible depuis le dashboard et la page chantiers

### Base de données
- Colonnes ajoutées : `archived boolean DEFAULT false`, `archived_at timestamptz`

## 11. Améliorations PDF et IA (2026-03-25)

### Rapport PDF
- Photos affichées en images (120x90px) au lieu de texte
- Remarques formatées : retours à la ligne, puces, texte brut (pas de markdown)
- Logo agrandi (60px hauteur, 210px max largeur)
- Délai et statut affichés directement sous chaque constatation
- Suppression du tableau "Historique des non-conformités" et section "Délai(s)"

### IA — Texte en français accentué
- Prompts de l'analyse photo et de l'assistant juridique imposent le français avec accents
- Fonction `stripMarkdown()` nettoie tout formatage markdown des réponses IA
- Le bouton "Copier dans la remarque" de l'assistant juridique résume le texte en 2-3 phrases via l'IA

## 12. Améliorations UX

- Champ remarque auto-extensible (s'agrandit avec le contenu)
- Fonts Google (Inter + Material Symbols) restaurées dans le layout
- Touch targets min 44x44px sur tous les boutons et liens
- KPI du dashboard cliquables avec icônes et effet hover
- Accentuation complète de tous les textes français de l'interface

## Déploiement

### Production
- **URL** : https://chantiers.securionis.com
- **Infrastructure** : Docker sur VPS Hostinger (72.61.187.90)
- **SSL** : Let's Encrypt avec renouvellement automatique
- **Reverse proxy** : Nginx (HTTP→HTTPS redirect)
- **Process** : Docker Compose (securionis + nginx)

### Mise à jour
```bash
cd /app/securionis && git pull origin main && docker compose down && docker compose up -d --build
```

### Variables d'environnement (`.env.local`)
- `NEXT_PUBLIC_SUPABASE_URL` — URL du projet Supabase
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Clé publique Supabase
- `SUPABASE_SERVICE_ROLE_KEY` — Clé service (serveur uniquement)
- `RESEND_API_KEY` — Envoi d'emails
- `ANTHROPIC_API_KEY` — Analyse IA photos + Assistant juridique
