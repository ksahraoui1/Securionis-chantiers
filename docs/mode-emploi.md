# Mode d'emploi — Securionis Chantiers

**Application d'inspection Santé et Sécurité au Travail (SST)**

Version 1.0 — Mars 2026

---

## 1. Présentation

Securionis Chantiers est une application web destinée aux inspecteurs SST pour réaliser des contrôles de conformité sur les chantiers de construction en Suisse. Elle permet de :

- Gérer les chantiers et leurs informations
- Réaliser des visites d'inspection avec checklist réglementaire
- Documenter les non-conformités avec photos annotées
- Générer et envoyer des rapports PDF par email
- Suivre l'évolution des écarts (non-conformités)
- Travailler hors-ligne sur le terrain

**URL d'accès** : https://chantiers.securionis.com

---

## 2. Connexion et compte

### 2.1 Se connecter

1. Ouvrez https://chantiers.securionis.com
2. Saisissez votre **email** et **mot de passe**
3. Cliquez sur **Se connecter**

### 2.2 Créer un compte

1. Sur la page de connexion, cliquez sur **Créer un compte**
2. Remplissez : nom complet, email, mot de passe (min. 6 caractères), confirmation
3. Cliquez sur **Créer mon compte**
4. Si la confirmation par email est activée, vérifiez votre boîte mail

### 2.3 Mot de passe oublié

1. Sur la page de connexion, cliquez sur **Mot de passe oublié ?**
2. Saisissez votre email
3. Un lien de réinitialisation vous sera envoyé
4. Cliquez sur le lien reçu par email et choisissez un nouveau mot de passe

---

## 3. Dashboard (Tableau de bord)

Le dashboard est la page d'accueil après connexion. Il affiche :

- **Chantiers actifs** : nombre de chantiers en cours
- **NC ouvertes** : non-conformités non résolues
- **Visites ce mois** : nombre de visites réalisées dans le mois
- **Taux de conformité** : pourcentage moyen sur les 3 derniers mois
- **Graphique** : évolution des NC sur 6 mois (barres ouvertes/corrigées)
- **Chantiers urgents** : chantiers avec NC dont le délai est dépassé

### Export Excel

Cliquez sur le bouton **Export Excel** pour télécharger un fichier contenant tous les chantiers, visites, écarts et statistiques.

---

## 4. Gestion des chantiers

### 4.1 Voir la liste des chantiers

Depuis la navigation, cliquez sur **Chantiers**. La liste affiche tous vos chantiers avec :

- Nom et adresse
- Nombre de NC ouvertes (badge rouge)
- Dernière visite

Utilisez la **barre de recherche** pour filtrer par nom, adresse ou nature des travaux.

### 4.2 Créer un nouveau chantier

1. Cliquez sur **Nouveau chantier**
2. Remplissez les informations :
   - **Nom du chantier** (optionnel)
   - **Adresse** (obligatoire)
   - **Nature des travaux** (obligatoire)
   - **Références** : N° CAMAC, N° parcelle, N° ECA, Réf. communale
   - **Contact** : nom de la personne sur site
3. Cliquez sur **Créer le chantier**

### 4.3 Page détail d'un chantier

En cliquant sur un chantier, vous accédez à sa fiche complète :

- **Informations** : données du chantier, bouton Modifier
- **Documents** : permis, plans, rapports (voir section 5)
- **Destinataires** : personnes qui recevront les rapports par email
- **Timeline des visites** : historique des visites réalisées
- **Comparaison N/N-1** : évolution des NC entre deux visites
- **Écarts (NC)** : liste de toutes les non-conformités avec leur statut

### 4.4 Modifier un chantier

1. Sur la page détail, cliquez sur **Modifier**
2. Modifiez les champs souhaités
3. Cliquez sur **Enregistrer**

---

## 5. Documents par chantier

Chaque chantier peut contenir des documents classés par catégorie.

### 5.1 Catégories disponibles

- Permis de construire
- Plans
- Rapport ECA
- Autorisation travaux dangereux
- Certificat entreprise
- Autre

### 5.2 Ajouter un document

1. Sur la page détail du chantier, dans la section **Documents**, cliquez sur **Ajouter**
2. Saisissez le **nom du document**
3. Choisissez la **catégorie**
4. Ajoutez une **description** (optionnel)
5. Sélectionnez le **fichier** (PDF, Word, Excel, Image, DWG)
6. Cliquez sur **Enregistrer**

### 5.3 Nouvelle version

Pour remplacer un fichier sans supprimer l'historique, cliquez sur **Nouvelle version** sur le document concerné. Le numéro de version s'incrémente automatiquement (v2, v3...).

### 5.4 Filtrer et télécharger

- Utilisez les **filtres par catégorie** pour afficher un type de document
- Cliquez sur **Télécharger** pour récupérer un fichier

---

## 6. Réaliser une visite d'inspection

### 6.1 Créer une nouvelle visite

1. Sur la page détail d'un chantier, cliquez sur **Nouvelle visite**
2. **Étape 1 — Catégories** : cochez les domaines à contrôler (ex. Accès & Sols, Échafaudages, Électricité...). Utilisez la barre de recherche pour trouver rapidement une catégorie.
3. **Étape 2 — Thèmes** : affinez en sélectionnant les thèmes spécifiques au sein des catégories choisies. Vous pouvez utiliser **Tout cocher** / **Tout décocher**.
4. Cliquez sur **Démarrer la visite**

### 6.2 Remplir la checklist

Pour chaque point de contrôle, vous devez :

1. **Évaluer la conformité** en cliquant sur l'un des 3 boutons :
   - **Conforme** (vert) : le point est respecté
   - **Non-conforme** (rouge) : un écart est constaté
   - **Pas nécessaire** (gris) : le point ne s'applique pas
2. **Ajouter une remarque** (optionnel) : champ texte libre pour détailler
3. **Prendre des photos** : utilisez Appareil photo ou Galerie (max. 10 photos par point)

**Informations affichées sur chaque point** :

- Intitulé du point de contrôle
- Critère d'acceptation
- Base légale (référence OTConst, SUVA, etc.)
- Explications complémentaires
- Documents PDF réglementaires (cliquez pour ouvrir)

### 6.3 Annotation des photos

Après chaque prise de photo, un éditeur plein écran s'ouvre pour annoter :

- **Flèche** : pointer un élément
- **Cercle** : entourer une zone
- **Texte** : ajouter un commentaire
- **Dessin libre** : dessiner à main levée
- **5 couleurs** disponibles (rouge, vert, navy, jaune, blanc)
- **3 épaisseurs** de trait
- **Annuler** la dernière annotation

Cliquez sur **Valider** pour sauvegarder l'annotation.

### 6.4 Analyse IA des photos

Lorsqu'une photo est uploadée, le bouton **Analyse IA** apparaît :

1. Cliquez sur **Analyse IA**
2. L'IA analyse la photo et détecte les dangers potentiels
3. Des suggestions apparaissent avec un niveau de sévérité (critique/majeur/mineur)
4. Cliquez sur **Appliquer** pour insérer la remarque suggérée ou changer la conformité

### 6.5 Assistant juridique

Pour chaque point de contrôle, un **Assistant juridique** est disponible :

1. Cliquez sur **Assistant juridique**
2. Choisissez une question rapide ou posez votre propre question
3. L'IA répond avec les références légales suisses (OTConst, SUVA, SIA...)
4. Cliquez sur **Copier dans la remarque** pour insérer la réponse

### 6.6 Sauvegarde automatique

Chaque modification est **sauvegardée automatiquement** (indicateur en haut à droite). Si vous êtes hors-ligne, les données sont stockées localement et synchronisées au retour du réseau.

### 6.7 Valider la visite

1. En bas de la checklist, cliquez sur **Valider la visite**
2. Si des non-conformités ont été constatées, une fenêtre s'ouvre pour chaque NC :
   - Saisissez un **délai de correction** (ex. "Immédiatement", "7 jours", "Avant coulage")
3. La visite passe au statut **Terminée**
4. Vous êtes redirigé vers la page du **rapport**

---

## 7. Rapport de visite

### 7.1 Consulter le rapport

Après validation, le rapport affiche un récapitulatif complet :

- Informations du chantier et de la visite
- Liste des constatations (non-conformités) avec photos
- Historique des écarts
- Délais de correction
- Destinataires en copie

### 7.2 Télécharger le PDF

Cliquez sur **Télécharger PDF** pour générer et sauvegarder le rapport au format PDF. Le rapport contient :

- En-tête avec logo de l'entreprise
- Tableau d'informations (inspecteur, date, chantier, références)
- Constatations avec remarques formatées et photos
- Tableau des écarts avec statut et délai
- Pied de page avec coordonnées de l'entreprise

### 7.3 Envoyer par email

1. Cliquez sur **Envoyer par email**
2. Le rapport PDF est envoyé à tous les **destinataires** du chantier
3. L'email contient une signature dynamique avec les coordonnées de votre entreprise

---

## 8. Suivi des écarts (non-conformités)

### 8.1 Voir les écarts d'un chantier

Sur la page détail du chantier, la section **Écarts** liste toutes les NC avec :

- Description
- Délai de correction
- Statut : **Ouvert** (rouge), **En cours de correction** (orange), **Corrigé** (vert)

### 8.2 Mettre à jour un statut

Cliquez sur le bouton de statut d'un écart pour le faire évoluer :

- Ouvert → En cours de correction
- En cours de correction → Corrigé

### 8.3 Comparaison entre visites

La section **Comparaison N/N-1** compare automatiquement les deux dernières visites et classifie les écarts :

- **Corrigée** : NC présente en N-1, conforme en N
- **Persistante** : NC présente en N-1 et en N
- **Nouvelle** : NC absente en N-1, présente en N

---

## 9. Administration

Accessible via la navigation pour les utilisateurs avec le rôle **Administrateur**.

### 9.1 Points de contrôle

**Navigation** : Admin > Points de contrôle

Gérez la base de 568 points de contrôle SUVA :

- **Filtrer** par catégorie, thème, statut (actif/inactif) ou recherche texte
- **Désactiver** un point : il n'apparaîtra plus dans les nouvelles visites
- **Réactiver** un point désactivé
- **Modifier** un point : cliquez dessus pour ouvrir le formulaire d'édition
- **Créer** un nouveau point : cliquez sur **+ Nouveau point**
  - Sélectionnez une catégorie et un thème existant, ou créez un **nouveau thème**
  - Remplissez l'intitulé, les explications, la base légale et le critère
  - Ajoutez jusqu'à **5 documents PDF** réglementaires

### 9.2 Utilisateurs

**Navigation** : Admin > Utilisateurs

- Voir la liste des utilisateurs de votre entreprise
- **Créer un utilisateur** : nom, email, rôle (inspecteur ou administrateur)
- **Changer le rôle** d'un utilisateur existant

### 9.3 Entreprise

**Navigation** : Admin > Entreprise

Configurez les informations de votre entreprise :

- Nom
- Adresse, NPA, Ville
- Téléphone, Email
- Logo (utilisé dans les rapports PDF et les emails)

---

## 10. Fonctionnement hors-ligne (PWA)

L'application fonctionne en mode hors-ligne pour les visites sur le terrain :

### 10.1 Installation

Sur votre tablette ou smartphone, ouvrez l'application dans le navigateur. Une option **Ajouter à l'écran d'accueil** apparaîtra. L'application se comportera comme une app native.

### 10.2 Mode hors-ligne

- Un **bandeau rouge** "Hors-ligne" s'affiche quand la connexion est perdue
- Les données de la visite sont **sauvegardées localement** (IndexedDB)
- Les photos sont stockées en attente

### 10.3 Synchronisation

Au retour du réseau :

- Un **bandeau orange** indique "X modifications en attente"
- Cliquez sur **Synchroniser** ou attendez la synchronisation automatique
- Les données et photos sont envoyées au serveur

---

## 11. Export Excel

Deux types d'export sont disponibles :

### 11.1 Export global (depuis le Dashboard)

Contient 4 feuilles :

- **Chantiers** : liste complète
- **Visites** : toutes les visites
- **Écarts NC** : toutes les non-conformités
- **Statistiques** : KPIs globaux

### 11.2 Export par chantier (depuis la page détail)

Contient 4 feuilles :

- **Chantier** : fiche d'information
- **Visites** : visites du chantier
- **Écarts NC** : NC du chantier
- **Réponses détaillées** : chaque point avec valeur, remarque, base légale

---

## 12. Raccourcis et astuces

| Action | Astuce |
|--------|--------|
| Rechercher un chantier | Barre de recherche sur la page Chantiers |
| Rechercher une catégorie | Barre de recherche lors de la création de visite |
| Annoter une photo existante | Survolez la photo → icône crayon |
| Copier une réponse IA | Bouton "Copier dans la remarque" |
| Voir l'historique d'un écart | Comparaison N/N-1 sur la page chantier |
| Accéder aux documents légaux | Liens PDF sur chaque point de contrôle |

---

## 13. Support

Pour toute question ou problème technique, contactez votre administrateur ou envoyez un email à l'adresse configurée dans les paramètres de l'entreprise.

---

*Securionis Chantiers — Santé et Sécurité au Travail*
*https://chantiers.securionis.com*
