# Fonctionnalités — Securionis Chantiers

> Dernière mise à jour : 2026-09-13 (troisième lot de corrections de sécurité)

## Sécurité des sessions et des rapports

Le lot du 13 septembre 2026 couvre le MFA (S01), les références de rapports (S02), les images PDF (S03), la suppression d’une visite (S04), la conservation de la file hors ligne (partie de S07) et la compatibilité de l’export ZIP (A02).

- **Session complète** : toute API appelle `requireApiUser` avant les droits métier ou les services privilégiés. Un compte avec facteur vérifié doit présenter `aal2`. Un compte sans facteur conserve le parcours existant d’enrôlement. Les erreurs Auth donnent 401, le second facteur manquant 403 avec `MFA_REQUIRED`, et une vérification indisponible 503. Les pages serveur utilisent la même décision.
- **Base et stockage** : `session_mfa_valide()` relit les facteurs vérifiés du compte courant. La migration 055 ajoute une politique restrictive à chaque table RLS du schéma public et à `storage.objects`. Une nouvelle table doit recevoir cette même politique. Les règles métier restent nécessaires ; le contrôle MFA n’accorde pas de nouveau droit.
- **Références de rapports** : la migration 056 interdit aux clients de définir ou de modifier `visites.rapport_url`, ainsi que de déplacer une visite vers un autre chantier. Le serveur génère les nouveaux fichiers sous `<chantier>/visites/<UUID complet>/rapport.pdf`. Les anciens chemins sont lus seulement s’ils correspondent au chantier, à la date et à l’identifiant attendu. Une référence incohérente demande une nouvelle génération.
- **Lecture et envoi** : la page de rapport, l’envoi email et l’export utilisent les droits Storage de l’utilisateur. Le stockage privé n’est plus signé ou téléchargé avec `service_role` depuis une référence libre. Le ZIP accepte anciens et nouveaux chemins et contient un manifeste des éléments inclus et refusés.
- **Images PDF** : photos et logos proviennent uniquement des buckets du projet configuré en HTTPS. Le SDK télécharge avec les droits de l’utilisateur et sans redirection ; le moteur PDF reçoit des données PNG/JPEG en mémoire. Les limites sont 10 Mo par image, 40 Mo au total et 200 images, avec délai de 15 secondes par téléchargement. Une image interdite ou inaccessible interrompt la génération, sans produire silencieusement un rapport incomplet.
- **Suppression** : `supprimer_visite_brouillon` vérifie MFA, rôle ou rattachement actuel, puis verrouille et supprime les lignes dans une transaction. Être l’auteur historique ne suffit pas après retrait du chantier. Une visite terminée est refusée. Le serveur nettoie ensuite les photos et le seul chemin de rapport dérivé de l’UUID complet ; un ancien fichier ambigu est conservé et journalisé pour revue séparée.
- **Hors ligne** : une lecture en erreur, une visite invisible ou un conflit plus récent côté serveur conserve les éléments en attente. Aucune absence de résultat RLS ne prouve une suppression. Le service worker passe à v8 pour renouveler les assets. Une interface de résolution des conflits et l’isolation du cache par compte restent à réaliser.

### Vérifications du lot

`npm run test:security` teste les gardes des 18 routes, les références de fichiers, les refus réseau, les limites de flux, le SDK Storage réel avec transport simulé, le rendu PDF sans requête réseau et la conservation des données hors ligne. `tests/security-db.sql` s’exécute uniquement dans une base PostgreSQL vide et jetable : fixture de rôles et tables, application réelle et réapplication des migrations 055/056, droits MFA, références protégées et suppression transactionnelle. Il ne simule pas le protocole GoTrue ni le service HTTP Storage.

Validation du 13 septembre : 9 tests Node réussis, contrôle TypeScript et build local Webpack réussis ; scénario SQL PostgreSQL 17 réussi. Sur Supabase, les 94 références historiques correspondent au format attendu. Les migrations 055 et 056 sont appliquées et enregistrées sous `20260913160055` et `20260913160056` : 24 politiques MFA restrictives et le trigger de protection sont actifs. La simulation transactionnelle sur les données réelles confirme zéro chantier, visite ou objet visible pour le compte MFA en `aal1`, et les accès conservés en `aal2`. Aucun enregistrement métier n’a été supprimé pendant ces vérifications.

À la fin du lot 1, les rapports restaient régénérables sous le même chemin : ce lot n’instaure pas l’immutabilité documentaire de S06. Il ne clôture pas l’isolation multi-entreprise, la protection du cache entre comptes, les réglages GitHub ou l’ensemble des autres constats du rapport d’audit.

## Bibliothèque privée et versions des rapports — lot 2

- La migration 057 applique une restriction de lecture sur le préfixe `base-documentaire` du bucket `rapports`, y compris en présence d’anciennes règles permissives. Les invités ne voient plus les fichiers de la bibliothèque ; inspecteurs et administrateurs les conservent. Les pièces de checklist sous `points-controle` restent accessibles selon le parcours de démonstration existant.
- Les clients Supabase, y compris un administrateur connecté, ne peuvent plus insérer, remplacer, déplacer ou supprimer un PDF de visite. Les dossiers de documents, logos, bibliothèque et comparaisons conservent leurs politiques métier. Le compte serveur reste un privilège d’exploitation à protéger.
- Chaque génération de PDF de visite utilise un UUID neuf sous `<chantier>/visites/<visite>/versions/<version>.pdf`, avec `upsert: false`. Une nouvelle génération exige un motif de 5 à 1 000 caractères. Le fichier porte sa référence de version. La signature graphique commune est retirée des nouveaux PDF et du répertoire public ; les copies déjà distribuées et l’historique Git ne peuvent pas être rappelés par ce changement.
- La migration 058 crée `rapport_versions`. Une procédure réservée au serveur recontrôle l’affectation actuelle et le rôle, verrouille la visite, compare la référence attendue, puis inscrit l’archive et la nouvelle référence dans une transaction. Chaque nouvelle archive contient les données utilisées par le générateur, le SHA-256 exact du PDF, l’auteur, la date serveur et le motif. Une publication concurrente renvoie 409 ; une réponse incertaine conserve le fichier pour éviter d’effacer une publication réussie.
- L’historique est en ajout seul : UPDATE/DELETE des lignes sont interdits et les clients n’ont pas INSERT. Sa lecture suit celle de la visite et le MFA. Les 50 dernières versions sont consultables depuis la page du rapport, avec leur empreinte. Les références historiques valides sont reprises sans inventer leur auteur, leur date de génération ou une empreinte non calculée.
- L’email contient la version sélectionnée à l’écran. Si la référence courante a changé avant la demande, l’envoi est refusé avec 409. Le journal conserve la référence envoyée. Publier une nouvelle version remet son état « email envoyé » à faux ; un envoi d’une ancienne version déjà engagé ne peut pas marquer la nouvelle comme envoyée.
- Le PDF prend l’entreprise de l’inspecteur de la visite, au lieu de la première entreprise retournée. Une lecture métier indisponible bloque la génération pour éviter un rapport silencieusement incomplet.

### Vérification et limites

Les tests Node couvrent les chemins, l’absence d’écrasement, le calcul de l’empreinte, le conflit de publication, le motif, l’affectation actuelle, les lectures en erreur et le refus d’envoyer une autre version. `tests/security-db-versions.sql` reprend le lot précédent puis applique les vraies politiques Storage et les migrations 057/058 sur PostgreSQL jetable : invité/inspecteur/admin, déplacements, historique, réapplication et publication. GitHub Actions exécute désormais cette suite SQL avec PostgreSQL 17. Aucun email réel n’est envoyé par ces tests.

Ce lot traite l’accès Storage de S05 et une partie de S06. Il ne clôture pas S06 : les constats d’une visite terminée ne sont pas encore figés par une clôture atomique, les images sources peuvent évoluer et le parcours d’avenant validé reste à construire. L’empreinte d’un PDF permet de vérifier ses octets ; elle ne constitue pas une signature électronique du validateur. À la fin du lot 2, le modèle multi-entreprise S09 et l’isolation locale S08 restaient à traiter (voir le lot 3 pour S08). Les contrôles SQL ne remplacent pas une recette HTTP Storage avec des comptes de test distincts.

Validation du lot 2 le 13 septembre : 12 tests Node et la suite SQL PostgreSQL 17 réussis, TypeScript et lint sans erreur. La simulation sur Supabase confirme 0 fichier de bibliothèque pour l’invité, 5 pièces de checklist conservées, 76 fichiers pour l’inspecteur et 94 rapports historiques repris. Les migrations sont enregistrées sous `20260913170057` et `20260913170058`.

### Déploiement du lot 2

Appliquer 057 et 058 avant la bascule du code, enregistrer les migrations, puis construire l’image, exécuter les tests et déployer le commit publié. Recharger les anciens onglets pour les nouvelles demandes de motif et de version email (service worker v9). Conserver l’image précédente, mais après publication d’un chemin `/versions/`, un retour à un code qui ne reconnaît pas ce format exige un correctif compatible : ne pas supprimer les archives ni rouvrir les politiques pour revenir en arrière. Les fichiers téléversés sans publication confirmée doivent être rapprochés de `rapport_versions` avant tout nettoyage.

## Isolation locale et synchronisation — lot 3

Ce lot traite la séparation locale S08 et renforce la conservation des saisies S07. Il ne modifie aucune politique Supabase et ne nécessite aucune migration SQL.

- **Périmètre obligatoire** : les réponses, les blobs photo et le cache de lecture utilisent une base IndexedDB par UUID de compte et UUID d’entreprise (ou absence d’entreprise explicite). Les sélections de thèmes et de points en localStorage portent le même périmètre. Une opération n’accepte jamais implicitement le « compte courant ». Une session terminée ne peut plus lancer de lecture, d’écriture ou de synchronisation. Une écriture locale déjà acceptée peut finir dans sa base d’origine.
- **Écran et réseau** : le contenu privé ne s’affiche qu’après concordance entre la session du navigateur et l’identité du layout serveur. Changement de compte, déconnexion et départ de page masquent ce contenu et interrompent le périmètre. Un verrou local prévient les autres onglets ; un retour depuis le cache de navigation force le rechargement. Les envois utilisent un JWT capturé, vérifié par Auth, puis contrôlent le MFA et l’entreprise actuelle. Les requêtes n’empruntent pas le jeton d’un compte connecté pendant l’attente et sont annulées à l’arrêt du périmètre.
- **Saisie et accusés** : chaque changement de réponse est écrit immédiatement dans IndexedDB ; seul le réseau est temporisé. Une révision locale unique empêche l’accusé d’un ancien envoi d’effacer une frappe plus récente. L’état « sauvegardé hors ligne » n’est affiché qu’après réussite de l’écriture locale. La reprise de la checklist recharge les réponses en attente du même périmètre avant de monter les champs.
- **Photos** : captures et annotations sont d’abord conservées comme blobs locaux, même en ligne. Le synchroniseur envoie le fichier avant la réponse et n’efface sa copie qu’après l’accusé de cette réponse, ou après vérification qu’une réponse serveur le référence déjà. Un fichier déjà présent est comparé octet par octet avant acceptation. Conflit, visite invisible/terminée, erreur réseau ou nouvelle révision conservent les données. Les aperçus locaux sont reconstitués à la reprise ; les URL blob sont libérées au démontage. Une suppression demandée dans l’interface retire la référence et, le cas échéant, la copie locale. Les originaux distants sont conservés pour les versions antérieures des rapports ; leur nettoyage nécessite une procédure distincte.
- **Validation** : avant lecture des réponses puis clôture, la visite attend les écritures locales et leur synchronisation. Une réponse ou photo restante pour cette visite bloque la validation avec un message explicite. Cela ne constitue pas encore une clôture atomique côté base.
- **Déconnexion** : un avertissement signale les éléments en attente. Les réponses et photos enregistrées restent sur l’appareil pour le même compte et la même entreprise ; le cache de lecture est purgé. La révocation distante est tentée pendant au plus cinq secondes ; les cookies Auth de ce projet sont effacés localement même en cas d’échec, puis une navigation complète ferme le contexte mémoire. L’écran de connexion indique si la révocation distante n’a pas été confirmée. Le verrou n’est levé qu’après une authentification réussie.
- **Service worker v10** : seul le code statique Next.js et une courte liste de ressources publiques de l’origine sont mis en cache. Aucun HTML de page authentifiée, flux RSC, appel API, média privé ou objet Supabase n’est conservé par ce cache. L’activation retire les anciens caches Securionis. Hors ligne, une nouvelle navigation montre une page neutre 503 ; une visite déjà chargée peut continuer à être renseignée. L’ouverture à froid d’une visite hors ligne n’est pas proposée.
- **Ancien stockage** : la base historique `securionis-offline` ne contient pas de propriétaire vérifiable. Elle est conservée à part, sans lecture de son contenu, attribution automatique, synchronisation ni purge. Un bandeau signale son existence ; une récupération éventuelle demande une procédure d’identification du propriétaire. Les anciennes préférences non rattachées ne sont plus lues.

### Vérification et limites du lot 3

Les 24 tests Node incluent douze scénarios supplémentaires : séparation utilisateur/entreprise, changement de session pendant une écriture, accusé de révision, conservation et expiration, ancienne base, JWT capturé avec le vrai SDK et transport fictif, contrôles MFA/profil, photos en échec/doublon, caches du service worker et déconnexion réseau en erreur. IndexedDB est testé avec `fake-indexeddb` ; ces tests ne sollicitent aucun compte réel et n’envoient aucun email. TypeScript, lint (18 avertissements préexistants, aucune erreur) et build local Webpack passent.

Recette navigateur locale le 13 septembre : composant `OfflineProvider` réel sous React StrictMode, moteur IndexedDB du navigateur et événements Auth fictifs. A enregistre une réponse et une photo ; un changement de session vers B masque immédiatement l’écran A ; B lit une file vide ; le retour à A restitue les deux éléments. Le verrouillage dans un onglet verrouille également le second. Cette recette ne remplace pas une campagne avec comptes Supabase distincts, reconnexions mobiles et coupures réseau physiques.

Le chiffrement au repos de l’appareil n’est pas ajouté : un utilisateur ayant accès au profil du navigateur ou aux outils de développement peut inspecter son stockage. L’ancienne file reste à récupérer manuellement si elle contient des saisies utiles. La résolution guidée des conflits, la comparaison atomique des versions de réponses côté serveur, la clôture transactionnelle S06 et l’isolation multi-entreprise serveur S09 restent ouvertes. Une réponse peut encore évoluer côté serveur entre la lecture de conflit et l’écriture ; ce lot ne prétend pas résoudre cette concurrence. Les saisies qui n’ont pas obtenu de confirmation locale (stockage refusé, photo encore en préparation) ne sont pas garanties après fermeture.

### Déploiement du lot 3

Publier le commit testé, vérifier GitHub Actions, conserver l’image `044cea2` pour retour arrière, puis construire et basculer le conteneur sans `docker compose down`. Vérifier la santé, la page de connexion et le service worker v10, puis recharger l’application. Tous les anciens onglets doivent être rechargés pour remplacer le code déjà chargé en mémoire. Ne supprimer aucune base locale lors du déploiement ou d’un retour arrière ; l’ancien code ne sait pas relire les files v2. Un retour arrière exige donc une nouvelle mise à niveau avant de reprendre ces files.

## 1. Annotation des photos

**Fichiers** : `src/components/visite/photo-annotator.tsx`, `photo-capture.tsx`, `src/lib/utils/canvas-annotations.ts`

Éditeur plein écran Canvas HTML5 intégré au flux de capture photo.

- **4 outils** : Flèche, Cercle, Texte, Dessin libre
- **5 couleurs** : Rouge, Vert, Navy, Jaune, Blanc
- **3 épaisseurs** de trait
- Undo (annulation dernière annotation)
- Touch events pour tablette sur chantier
- Export en pleine résolution (annotations rendues à l'échelle originale via `renderAnnotations(ctx, annotations, { scale })`)
- S'ouvre automatiquement après chaque prise de photo
- Ré-annotation possible sur photos déjà uploadées (hover → icône crayon)

**Architecture interne (refacto 2026-05-10)** :
- Fonction de rendu pure `renderAnnotations()` dans `src/lib/utils/canvas-annotations.ts`, mutualisée entre l'affichage écran et l'export haute résolution.
- Machine d'état `useReducer` à 3 phases (`idle` / `drawing` / `placing-text`) avec 6 actions typées (`pointer-down/move/up`, `submit-text`, `cancel-text`, `undo`).

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
- Navigation par famille → catégorie → thème → statut + recherche full-text (cf. section 15)
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

## 12. Notifications push PWA (2026-05-11) — **retirées le 2026-08-29**

> Sous-système retiré avec Stripe (aucun usage : 1 abonnement de test, aucun déclencheur métier). Les routes, le hook, `lib/push.ts`, les handlers du Service Worker et les clés VAPID n'existent plus ; la table `push_subscriptions` est conservée. Le texte ci-dessous décrit l'état d'avant le retrait, à titre d'historique.

**Fichiers** : `src/lib/push.ts`, `src/app/api/push/subscribe/route.ts`, `src/app/api/push/test/route.ts`, `src/hooks/use-push-notifications.ts`, `src/components/ui/push-notifications-card.tsx`, `public/sw.js`, `supabase/migrations/034_push_subscriptions.sql`

Infrastructure Web Push complète :
- Opt-in utilisateur depuis `/dashboard/notifications` (toggle « Activer les notifications »)
- Test d'envoi de notification à soi-même
- Stockage des subscriptions dans `push_subscriptions` (RLS user-scoped)
- Cleanup automatique des subscriptions expirées (404/410) au prochain envoi
- Helper `sendPushToUser(userId, {title, body, url, tag})` côté serveur
- Service Worker étendu avec handlers `push` et `notificationclick` (focus la fenêtre existante si possible, sinon ouvre une nouvelle)

**Configuration requise** : générer une paire de clés VAPID (`npx web-push generate-vapid-keys`) et renseigner `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` dans `.env`.

**À venir** : triggers métier (notifier inspecteur lors d'un envoi de rapport reçu par les destinataires, lors de la création d'une NC critique, etc.).

## 13. Sélection des destinataires avant envoi du rapport (2026-05-11)

**Fichiers** : `src/app/(dashboard)/chantiers/[id]/visites/[visiteId]/rapport/rapport-actions.tsx`, `src/app/(dashboard)/chantiers/[id]/visites/[visiteId]/rapport/email-history.tsx`, `src/app/api/visites/[id]/email/route.ts`

Avant d'envoyer le PDF du rapport par email, l'inspecteur ouvre une modal listant tous les destinataires du chantier et **coche/décoche** ceux qui doivent recevoir l'envoi courant. Les choix ne sont **pas mémorisés** entre 2 envois (tous re-cochés par défaut à chaque ouverture).

- Compteur dynamique « N sélectionnés »
- Boutons « Tout cocher » / « Tout décocher »
- Bouton « Envoyer (N) » désactivé si 0 sélectionné
- **Email ad-hoc** : champ « Ajouter un email ponctuel » qui ajoute un destinataire hors liste chantier (pill ambre, validation format + dedup)
- Filtrage **côté serveur** sur les destinataires liés au chantier (anti-injection : impossible d'envoyer à un destinataire arbitraire)
- Rétro-compatibilité : si l'API est appelée sans corps, le comportement historique (envoi à tous) est conservé
- Audit log (`send_rapport_email`) conserve la liste exacte des emails envoyés
- **Historique d'envoi** affiché sur la même page (lecture des `audit_logs` via service client, autorisation déjà vérifiée par accès à la page)

## 14. Améliorations UX

- Champ remarque auto-extensible (s'agrandit avec le contenu)
- Fonts Google (Inter + Material Symbols) restaurées dans le layout
- Touch targets min 44x44px sur tous les boutons et liens
- KPI du dashboard cliquables avec icônes et effet hover
- Accentuation complète de tous les textes français de l'interface

## 15. Familles et recherche full-text des points de contrôle (2026-08-27)

**Fichiers** : migrations 035-036, `src/app/(dashboard)/admin/points-controle/page.tsx`, `src/lib/utils/familles.ts`, `src/lib/utils/mots-cles.ts`, `src/components/admin/point-controle-form.tsx`, `import-excel-points.tsx`

Objectif : rendre la page d'administration exploitable malgré 487 points répartis sur 28 catégories.

### Les 12 familles
Regroupement métier des catégories, stocké dans `points_controle.famille` (contrainte CHECK) :

| Famille | Catégories regroupées | Points |
|---|---|---|
| Protections antichute | Échafaudages, Échafaudages roulants, Filets & Retenue, Protections Chutes, Échelles | 107 |
| Fouilles & Terrasse | Fouilles & Talus, Roches & Gravier, Souterrains, Coffrages | 66 |
| Engins & Levage | Engins Chantier, Grues & Levage | 51 |
| Accès & Circulation | Accès & Sols, Postes & Passages | 51 |
| Dispositions générales | Dispositions générales | 45 |
| Électricité & Énergies | Électricité, Installations & Énergie, Installations Thermiques, Laser | 42 |
| Structures & Toitures | Toitures, Éléments Préfabriqués, Arbres | 37 |
| Démolition & Désamiantage | Démolition & Désamiantage | 26 |
| EPI & Santé | Santé et EPI, Milieu de travail | 25 |
| Machines & Outils | Machines Electriques, Machines portatives | 22 |
| Produits & Incendie | Produits & Inflammables | 14 |
| Autres | Test, toute catégorie non répertoriée | 1 |

### Recherche full-text
- Colonne `mots_cles` (text[]) : mots-clés dérivés de l'intitulé, du thème et de la catégorie (mots ≥ 4 caractères, mots vides exclus). Permet de retrouver un point par le vocabulaire de son thème — « permis grutier » remonte le point « Cat A ou B », dont l'intitulé ne contient aucun des deux mots.
- Colonne générée `search_vector` (tsvector, index GIN) : intitulé et mots-clés en poids A, famille en B, critère/objet/base légale en C, explications en D.
- Configuration `french_unaccent` (unaccent + french_stem) : la recherche ignore les accents — « echa » et « écha » remontent les 57 mêmes points.
- Recherche par préfixe : « echa » trouve « échafaudage » dès la 4ᵉ lettre.

### Interface
- Barre de recherche en haut avec icône loupe, bouton d'effacement et indicateur de frappe ; débounce 250 ms, aucun rechargement de page.
- Filtres en cascade : **Famille** (12 options) → **Catégorie** (désactivée tant qu'aucune famille n'est choisie, limitée aux catégories de la famille) → **Thème** → **Statut**.
- Bouton « Réinitialiser les filtres ».
- Badge de famille coloré sur chaque point, masqué quand il ferait doublon avec le badge catégorie.

### Écriture
Il n'existe pas de trigger PostgreSQL : `famille` et `mots_cles` sont renseignés côté application par `familleDeCategorie()` et `genererMotsCles()`, appelés depuis le formulaire admin et l'import Excel. Tout nouveau chemin d'écriture vers `points_controle` doit faire de même.

## 16. Correction du débordement de la nav en tablette (2026-08-27)

**Fichiers** : `src/app/(dashboard)/nav.tsx`

Sur toutes les pages du dashboard, un **administrateur** faisait déborder la page de 188 px à 768 px : la bascule barre horizontale / menu déroulant était fixée à `md`, alors que ses 6 liens réclament ~1030 px avec le logo et la zone utilisateur. Les rôles `inspecteur` (2 liens) et `invité` (3 liens) n'étaient pas concernés.

Le seuil dépend désormais du nombre de liens du rôle : `xl` (1280 px) au-delà de 3 liens, `md` (768 px) sinon. Ajout de `whitespace-nowrap` sur les liens (« Points de contrôle » se cassait sur trois lignes) et d'un `gap-4` entre les zones.

> Les classes responsives sont produites par ternaire ; Tailwind scanne le source en texte brut, donc les littéraux `"xl:flex"` / `"md:flex"` doivent rester écrits en entier.

## 17. Sécurité et intégrité — lot 1 de l'audit (2026-09-03)

**Fichiers** : `supabase/migrations/051_stockage_ecriture_cloisonnee.sql`, `052_acces_visites_reponses.sql`, `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `src/app/api/visites/[id]/route.ts`, `src/app/api/visites/[id]/email/route.ts`, `src/components/chantier/document-manager.tsx`, `src/app/(dashboard)/admin/documents/hooks/use-documents.ts`, `src/components/admin/point-controle-documents-uploader.tsx`

Six corrections issues de l'audit technique du 3 septembre 2026, sans fonctionnalité nouvelle (PR #45, déployée).

### Règles d'accès (migrations 051 et 052, appliquées)
- **Stockage** : on écrit là où on est rattaché. Un inspecteur dépose et remplace sous `<son chantier>/…` (photos, rapports) et `chantiers/<son chantier>/docs/…` (documents) ; le référentiel `base-documentaire/`, `points-controle/`, `logos/` et la suppression dans `rapports` sont réservés à l'administrateur. Les trois politiques héritées en double — qui laissaient tout compte connecté remplacer un rapport ou supprimer toutes les photos — sont supprimées.
- **Visites, réponses, écarts** : un seul périmètre. Lecture pour l'inspecteur de la visite **ou** le rattaché au chantier, écriture pour le rattaché seulement. Avant, un second inspecteur rattaché voyait la visite d'un collègue sans aucune de ses réponses.

### Comportements
- **Suppression d'une visite en cours** : faite par le `service_role` après contrôle d'accès, résultat vérifié ; les écarts liés, les photos sous `<chantier>/<visite>/` et le rapport éventuel sont effacés. Auparavant la suppression ne touchait aucune ligne tout en renvoyant un succès.
- **Suppression d'un document** (chantier, base documentaire, point de contrôle) : la ligne d'abord, résultat vérifié, le fichier ensuite. Un refus s'affiche (« réservée à un administrateur »), un fichier non effacé aussi.
- **Envoi du rapport** : le marquage `email_envoye` est vérifié et journalisé s'il échoue.

### Image Docker
Trois étapes (`deps`, `builder`, `runner`), Node 22, `output: "standalone"`, utilisateur `node`, `HEALTHCHECK` sur `/login`. `.dockerignore` exclut les `.env` : les valeurs publiques (`NEXT_PUBLIC_*`) arrivent en `build args` depuis `docker-compose.yml`, les secrets seulement au conteneur en marche. Image de **342 Mo** contre 2,02 Go, bascule mesurée à 6 s.

> ⚠️ Les images construites avant le 3 septembre 2026 contenaient le `.env`. Elles sont détruites sur le VPS, mais les clés qu'elles portaient (Supabase `service_role`, Resend, Anthropic, Stripe) sont à faire tourner chez leurs fournisseurs.

## 18. Comparaison de plans PE / EXE sur tablette (2026-09-04)

**Fichiers** : `src/components/chantier/comparaison-plans.tsx`, `src/components/chantier/comparaison-annotations.tsx`

La comparaison de plans (page `/chantiers/[id]/comparaison` : superposition PE / EXE, opacités, recalage, échelle, rotation, recoloration, détection des différences, annotations, rapport) est documentée en détail dans `CLAUDE.md`. Cette section ne couvre que son comportement sur tablette, signalé en usage réel : la fenêtre de manipulation ne tenait pas dans l'écran et bougeait pendant le recalage.

- **Hauteur du visualiseur mesurée** : il prend tout ce qui reste de l'écran une fois les barres d'outils comptées, jamais moins de 380 px, et se remesure au redimensionnement, au changement d'orientation et quand les barres se replient. Auparavant `65vh` : trop petit en portrait, débordant en paysage. Le plein écran natif n'existe pas sur iPad Safari, ce mode est donc celui qui compte sur tablette.
- **La zone reste fixe sous le doigt** : `touch-action: none` et `overscroll-behavior: contain` sur toute la zone du visualiseur (OpenSeadragon ne le posait que sur son canevas, pas sur les couches SVG et étiquettes qui le recouvrent). Un recalage au doigt ne fait plus défiler la page.
- **Tracer une forme au doigt** fonctionne : la couche d'annotations porte `touch-action: none`, sans quoi le navigateur prenait le tracé pour un défilement et annulait les événements pointeur.
- Plein écran en `100dvh` plutôt que `100vh` (barre d'adresse mobile non comptée).

> Non éprouvé dans le navigateur d'automatisation, où le visualiseur ne se charge pas : `tsc` et ESLint verts, premier usage réel sur tablette à confirmer.

## 19. Accès aux comptes et envoi de documents (2026-09-04)

**Fichiers** : `src/app/api/documents/email/route.ts`, `src/app/api/admin/create-user/route.ts`, `src/app/(auth)/login/page.tsx`, `src/lib/supabase/middleware.ts`, `supabase/migrations/053_inscription_publique_fermee.sql`

Deux constats de l'audit de sécurité, corrigés le jour même. Le détail des
mécanismes est dans `CLAUDE.md` ; voici ce qui change pour l'utilisateur.

### L'inscription libre est fermée

Il n'y a plus de page d'inscription. **Les comptes sont créés par un
administrateur** depuis `/admin/utilisateurs`, qui choisit le rôle à la
création. La page de connexion le dit, et `/register` redirige vers `/login`.

Un compte créé ainsi est utilisable immédiatement, sans étape de confirmation
par email. Le mot de passe suit la règle unique du projet : 8 caractères
minimum, une majuscule, une minuscule et un chiffre.

> La fermeture tient à **deux niveaux** : le réglage « Allow new users to sign
> up » de Supabase répond `422 signup_disabled`, et un déclencheur de contrainte
> en base refuse tout compte qui ne porte pas le marqueur posé par la route
> d'administration. Le second tient même si le premier était réactivé.

⚠️ **Conséquence côté console Supabase** : « Add user » et « Invite » y
échouent, la console ne posant pas ce marqueur. La procédure de secours est
documentée en tête de la migration 053.

### Le second facteur d'authentification (2026-09-04)

**Fichiers** : `src/app/(dashboard)/compte/securite/page.tsx`, `src/components/compte/{gestion-mfa,formulaire-code-mfa}.tsx`, `src/app/(auth)/verification/`

Une page **Sécurité du compte**, accessible depuis l'icône de bouclier de la
barre de navigation, permet d'activer un second facteur : on scanne un QR code
avec une application d'authentification, puis on confirme par un premier code.
Tant que ce code n'est pas saisi, rien ne change à la connexion.

Une fois le facteur actif, la connexion demande le code juste après le mot de
passe. Une session ouverte avant l'enrôlement est renvoyée vers un écran de
vérification à sa prochaine visite.

Un bandeau invite l'administrateur qui n'a pas encore de second facteur à
l'activer — c'est une invitation, jamais un blocage.

> ⚠️ **En cas de perte du téléphone**, la reprise en main demande une
> intervention en base de données. Conserver le compte dans un gestionnaire de
> mots de passe synchronisé, ou noter la clé affichée à l'enrôlement.

### La bibliothèque documentaire suit le rôle

Le référentiel documentaire n'est plus lisible que par les rôles
**inspecteur** et **administrateur**. Un compte « invité » conserve la
checklist complète et les documents attachés aux points de contrôle, mais plus
la bibliothèque générale.

### L'envoi d'un document par email suit les limites de rôle

La route d'envoi d'un document de la base documentaire refuse désormais un
compte « invité », comme le faisaient déjà les cinq autres routes d'email et de
PDF. Elle limite en outre les envois **vers une même adresse** à cinq par
heure, tous comptes confondus.

## 20. Contrôle quotidien du serveur (2026-09-04)

**Fichiers** : `scripts/controle-durcissement.{sh,service,timer}`, `scripts/LISEZ-MOI.md`

Une minuterie systemd vérifie chaque matin seize invariants du serveur —
connexion SSH, pare-feu, `fail2ban`, droits des fichiers de secrets, santé du
conteneur, absence du fichier d'environnement dans l'image, configuration
nginx, certificat, réponse de la page de connexion — et relève les erreurs
applicatives des dernières 24 heures. Un email part uniquement en cas de dérive
ou d'erreur.

Ce contrôle existe parce qu'une régression est déjà passée inaperçue pendant
deux mois. L'installation et les pièges sont décrits dans
[scripts/LISEZ-MOI.md](../scripts/LISEZ-MOI.md).

> La supervision applicative (Sentry) reste à brancher : le code est prêt, seul
> le DSN manque. Le relevé quotidien en tient lieu en attendant.

## Déploiement

### Production
- **URL** : https://chantiers.securionis.com
- **Infrastructure** : Docker sur VPS Hostinger (31.97.36.92, hostname `srv842436`)
- **SSL** : Cloudflare Full (Strict) — certificat Let's Encrypt sur l'origine, renouvellement auto via `certbot.timer`
- **Reverse proxy** : Nginx (80 + 443 → `127.0.0.1:3000`, le port 80 restant ouvert pour les challenges ACME ; `client_max_body_size 25m`, buffers proxy 32k)
- **Réseau** : UFW en deny incoming ; 80/443 restreints aux plages IP Cloudflare, Docker bindé sur `127.0.0.1:3000`
- **Accès au serveur** : SSH par **clé uniquement**, `PermitRootLogin prohibit-password`, via `/etc/ssh/sshd_config.d/01-durcissement.conf`. ⚠️ Le numéro **01** est essentiel : `sshd` retient la *première* valeur obtenue, et `50-cloud-init.conf` remet `PasswordAuthentication yes` à chaque passage de cloud-init. Un fichier numéroté au-dessus de 50 est inerte. Vérifier avec `sshd -T`, jamais en relisant un fichier. `fail2ban` actif (jail sshd)
- **Process** : Docker Compose, image `standalone` en trois étapes sous l'utilisateur `node`, `env_file .env` pour les secrets, `build args` pour les `NEXT_PUBLIC_*`, `restart unless-stopped`, `HEALTHCHECK`

### Mise à jour
```bash
cd /app/securionis
git pull --ff-only
docker image tag securionis-app:latest securionis-app:rollback
docker compose build
docker compose up -d --wait
```
- **Ne pas faire `docker compose down` avant le build** : l'ancien conteneur continue de servir pendant la construction, `up -d` ne fait que la bascule (mesurée à 5–6 s, contre ~2 min avec un `down` préalable).
- Conserver l’image `securionis-app:rollback` et le SHA précédent jusqu’à validation. Ne pas purger automatiquement les images après la bascule. Nettoyer le cache de construction seulement en cas d’erreur de cache identifiée.
- Après chaque lot : mettre à jour `docs/FEATURES.md` et `CLAUDE.md`, exécuter les vérifications, commit et push GitHub, appliquer les migrations requises, déployer le VPS puis vérifier le service. Cette séquence est demandée explicitement par le propriétaire.
- Pour le lot du 13 septembre : tester puis appliquer 055 et 056 avant le nouveau conteneur, enregistrer leur version dans le suivi Supabase et vérifier les contextes `aal1`/`aal2`. Recharger les onglets après mise à jour pour bénéficier de la nouvelle synchronisation. Conserver les politiques de sécurité lors d’un éventuel retour de conteneur ; ne jamais les ouvrir pour rétablir l’interface.

> Les migrations Supabase ne sont **pas** appliquées par le `git pull` : la base est sur Supabase Cloud, il faut les passer séparément (SQL Editor ou MCP), puis les inscrire dans `supabase_migrations.schema_migrations`.

### Variables d'environnement (`.env` sur le VPS, `.env.local` en local)
Publiques, inlinées au build (à déclarer aussi dans `Dockerfile` et `docker-compose.yml` pour toute nouvelle variable) :
- `NEXT_PUBLIC_SUPABASE_URL` — URL du projet Supabase
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Clé publique Supabase
- `NEXT_PUBLIC_APP_URL` — URL publique de l'application
- `NEXT_PUBLIC_APP_ENV` — `production` en production
- `NEXT_PUBLIC_SENTRY_DSN` — DSN Sentry côté client (vide = Sentry inactif)

> **Clés Supabase** : le projet utilise les clés **modernes**
> (`sb_publishable_…` côté client, `sb_secret_…` côté serveur). Les clés JWT
> héritées `anon` et `service_role` sont **désactivées** depuis le 4 septembre
> 2026 et refusées en 401. Une clé secrète se renouvelle seule, sans toucher au
> secret JWT et donc sans déconnecter personne : créer la nouvelle, l'installer,
> vérifier, puis révoquer l'ancienne.

Secrets, fournis au conteneur en marche uniquement :
- `SUPABASE_SERVICE_ROLE_KEY` — Clé service (serveur uniquement)
- `RESEND_API_KEY` / `RESEND_FROM_EMAIL` — Envoi d'emails (expéditeur sur le domaine racine vérifié)
- `ANTHROPIC_API_KEY` — Analyse IA photos + Assistant juridique
- `SENTRY_DSN` — DSN Sentry côté serveur (vide = Sentry inactif)
