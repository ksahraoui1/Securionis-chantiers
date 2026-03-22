# Fonctionnalités ajoutées — 2026-03-22

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

## 5. Améliorations UX
- Champ remarque auto-extensible (s'agrandit avec le contenu)
- Fonts Google (Inter + Material Symbols) restaurées dans le layout
