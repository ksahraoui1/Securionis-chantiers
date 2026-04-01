import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, TableOfContents, StyleLevel } from "docx";
import { NextResponse } from "next/server";

function title(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200 },
    children: [new TextRun({ text, bold: true, size: 32, color: "1e40af" })],
  });
}

function subtitle(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 150 },
    children: [new TextRun({ text, bold: true, size: 26, color: "374151" })],
  });
}

function sub3(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text, bold: true, size: 22, color: "4b5563" })],
  });
}

function para(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, size: 21 })],
  });
}

function bold(label: string, value: string): Paragraph {
  return new Paragraph({
    spacing: { after: 80 },
    children: [
      new TextRun({ text: label, bold: true, size: 21 }),
      new TextRun({ text: value, size: 21 }),
    ],
  });
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 60 },
    children: [new TextRun({ text, size: 21 })],
  });
}

function bullet2(text: string): Paragraph {
  return new Paragraph({
    bullet: { level: 1 },
    spacing: { after: 40 },
    children: [new TextRun({ text, size: 20 })],
  });
}

function separator(): Paragraph {
  return new Paragraph({
    spacing: { before: 200, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "d1d5db" } },
    children: [],
  });
}

function empty(): Paragraph {
  return new Paragraph({ spacing: { after: 80 }, children: [] });
}

export async function GET() {
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 21 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1200, bottom: 1200, left: 1200, right: 1200 },
          },
        },
        children: [
          // ===== PAGE DE COUVERTURE =====
          empty(), empty(), empty(), empty(),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [new TextRun({ text: "SECURIONIS CHANTIERS", bold: true, size: 48, color: "1e40af" })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            children: [new TextRun({ text: "Santé et Sécurité au Travail", size: 28, color: "6b7280", italics: true })],
          }),
          empty(),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
            children: [new TextRun({ text: "MODE D'EMPLOI DÉTAILLÉ", bold: true, size: 36, color: "374151" })],
          }),
          empty(), empty(),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "Version 1.0 — Mars 2026", size: 22, color: "9ca3af" })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [new TextRun({ text: "© 2026 Securionis. Tous droits réservés.", size: 20, color: "9ca3af" })],
          }),

          // ===== TABLE DES MATIÈRES =====
          new Paragraph({ children: [], pageBreakBefore: true }),
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: "Table des matières", bold: true, size: 32, color: "1e40af" })],
          }),
          new TableOfContents("Sommaire", {
            hyperlink: true,
            headingStyleRange: "1-3",
            stylesWithLevels: [
              new StyleLevel("Heading1", 1),
              new StyleLevel("Heading2", 2),
              new StyleLevel("Heading3", 3),
            ],
          }),

          // ===== 1. INTRODUCTION =====
          new Paragraph({ children: [], pageBreakBefore: true }),
          title("1. Introduction"),
          para("Securionis Chantiers est une application web professionnelle dédiée à la gestion des inspections de Santé et Sécurité au Travail (SST) sur les chantiers de construction. Elle permet aux inspecteurs de terrain de réaliser des visites de contrôle, documenter les non-conformités et générer des rapports PDF professionnels."),
          empty(),
          sub3("1.1 Fonctionnalités principales"),
          bullet("Gestion complète des chantiers (création, modification, archivage)"),
          bullet("Visites d'inspection avec checklist personnalisable"),
          bullet("Prise de photos avec annotation directe"),
          bullet("Analyse IA des photos de chantier"),
          bullet("Assistant juridique IA pour chaque point de contrôle"),
          bullet("Génération de rapports PDF avec signature"),
          bullet("Envoi automatique des rapports par email"),
          bullet("Suivi des non-conformités et des corrections"),
          bullet("Tableau de bord avec indicateurs clés (KPI)"),
          bullet("Export des données au format Excel"),
          bullet("Comparaison entre visites"),
          bullet("Mode hors-ligne (PWA)"),
          empty(),
          sub3("1.2 Rôles utilisateurs"),
          bold("Invité (Gratuit) : ", "accès limité à 2 chantiers, 1 visite par chantier, 1 photo par visite, sans PDF ni email."),
          bold("Inspecteur (Payant) : ", "accès illimité aux chantiers et visites, 10 photos par visite, génération PDF et envoi email."),
          bold("Administrateur : ", "accès complet + gestion des utilisateurs, des points de contrôle et de l'entreprise."),
          empty(),
          sub3("1.3 Configuration requise"),
          bullet("Navigateur web moderne (Chrome, Safari, Firefox, Edge)"),
          bullet("Connexion internet (mode hors-ligne disponible pour les visites)"),
          bullet("Tablette ou ordinateur recommandé (optimisé tactile, min. 44px pour les boutons)"),

          // ===== 2. PREMIERS PAS =====
          new Paragraph({ children: [], pageBreakBefore: true }),
          title("2. Premiers pas"),
          subtitle("2.1 Création de compte"),
          para("Pour créer un compte, rendez-vous sur la page d'inscription :"),
          bullet("Cliquez sur « Créer un compte » depuis la page de connexion"),
          bullet("Remplissez votre nom complet, votre email professionnel et un mot de passe"),
          bullet("Le mot de passe doit contenir au minimum 8 caractères, une majuscule, une minuscule et un chiffre"),
          bullet("Validez et vérifiez votre boîte email pour confirmer votre compte"),
          para("Après confirmation, vous êtes connecté avec le rôle « Invité » (gratuit). Vous pouvez passer à l'offre payante à tout moment."),
          empty(),
          subtitle("2.2 Connexion"),
          para("Depuis la page de connexion :"),
          bullet("Entrez votre adresse email et votre mot de passe"),
          bullet("Cliquez sur « Se connecter »"),
          bullet("En cas d'oubli, cliquez sur « Mot de passe oublié ? » pour recevoir un lien de réinitialisation par email"),
          empty(),
          subtitle("2.3 Tableau de bord"),
          para("Après connexion, vous arrivez sur le tableau de bord qui présente :"),
          bullet("Chantiers actifs — le nombre total de chantiers en cours"),
          bullet("NC ouvertes — le nombre de non-conformités non corrigées (rouge si > 0)"),
          bullet("Visites ce mois — le nombre de visites réalisées ce mois (cliquable pour voir la liste)"),
          bullet("Taux de conformité — pourcentage de conformité sur les 3 derniers mois"),
          para("En dessous, vous trouverez :"),
          bullet("La liste des visites du mois en cours (cliquable, mène à la visite ou au rapport)"),
          bullet("Un graphique des non-conformités par thème (top 10)"),
          bullet("La liste des chantiers avec des NC en attente, triés par urgence"),

          // ===== 3. GESTION DES CHANTIERS =====
          new Paragraph({ children: [], pageBreakBefore: true }),
          title("3. Gestion des chantiers"),
          subtitle("3.1 Créer un chantier"),
          para("Depuis la page « Chantiers », cliquez sur le bouton « Nouveau chantier » :"),
          bullet("Nom du chantier (optionnel) — un nom parlant pour identifier le chantier"),
          bullet("Adresse (obligatoire) — l'adresse complète du chantier"),
          bullet("Nature des travaux — type de travaux réalisés"),
          bullet("Référence communale, N° CAMAC, N° Parcelle, N° ECA — références administratives optionnelles"),
          bullet("Contact — nom du contact sur le chantier"),
          para("Cliquez sur « Créer » pour enregistrer. Le chantier apparaît dans votre liste."),
          para("Note : les utilisateurs gratuits sont limités à 2 chantiers."),
          empty(),
          subtitle("3.2 Consulter un chantier"),
          para("Cliquez sur un chantier dans la liste pour accéder à sa fiche détaillée. La fiche contient :"),
          bullet("Les informations du chantier (adresse, références, contact)"),
          bullet("Les documents attachés (permis, plans, rapports ECA, etc.)"),
          bullet("Les destinataires des rapports (emails)"),
          bullet("L'historique des visites avec dates, inspecteurs et statuts"),
          bullet("La liste des non-conformités avec leur état (ouvert, en cours, corrigé)"),
          empty(),
          subtitle("3.3 Modifier un chantier"),
          para("Sur la fiche du chantier, cliquez sur le bouton « Modifier » pour éditer les informations. Les administrateurs peuvent également attribuer des inspecteurs au chantier."),
          empty(),
          subtitle("3.4 Archiver / Restaurer un chantier"),
          para("Sur la fiche du chantier, utilisez le bouton « Archiver » pour retirer le chantier de la liste active. Le chantier reste consultable dans la section « Archives » accessible depuis le tableau de bord ou la page Chantiers."),
          para("Pour restaurer un chantier archivé, accédez aux archives et cliquez sur « Restaurer »."),
          empty(),
          subtitle("3.5 Gérer les documents"),
          para("Dans la section « Documents » de la fiche chantier, vous pouvez :"),
          bullet("Ajouter un document (PDF, images, Word, Excel) — max 50 Mo par fichier"),
          bullet("Choisir la catégorie : Permis de construire, Plans, Rapport ECA, Autorisation travaux, Certificat entreprise, Autre"),
          bullet("Remplacer ou supprimer un document existant"),
          bullet("Télécharger les documents en cliquant dessus"),
          empty(),
          subtitle("3.6 Gérer les destinataires"),
          para("Les destinataires sont les personnes qui recevront les rapports de visite par email. Pour chaque destinataire, indiquez :"),
          bullet("Nom"),
          bullet("Organisation (optionnel)"),
          bullet("Adresse email"),
          para("Conseil : ajoutez les destinataires avant de réaliser la première visite pour pouvoir envoyer le rapport immédiatement après validation."),

          // ===== 4. RÉALISER UNE VISITE =====
          new Paragraph({ children: [], pageBreakBefore: true }),
          title("4. Réaliser une visite d'inspection"),
          subtitle("4.1 Créer une nouvelle visite"),
          para("Depuis la fiche d'un chantier, cliquez sur « Nouvelle visite ». Le processus se déroule en 3 étapes :"),
          empty(),
          sub3("Étape 1 : Sélection des catégories"),
          para("Choisissez une ou plusieurs catégories de contrôle parmi les 26 disponibles (Accès & Sols, Coffrages, Échafaudages, Grues & Levage, etc.). Vous pouvez rechercher par nom."),
          empty(),
          sub3("Étape 2 : Sélection des thèmes"),
          para("Les thèmes liés aux catégories choisies s'affichent. Sélectionnez les thèmes pertinents pour cette visite. Vous pouvez tout cocher ou tout décocher."),
          empty(),
          sub3("Étape 3 : Sélection des points de contrôle"),
          para("La liste des points de contrôle correspondant aux thèmes choisis s'affiche. Chaque point est coché par défaut. Décochez les points que vous ne souhaitez pas vérifier lors de cette visite."),
          bullet("Utilisez la barre de recherche pour trouver un point spécifique"),
          bullet("« Tout cocher » / « Tout décocher » pour une sélection rapide"),
          para("Cliquez sur « Commencer le contrôle » pour démarrer la visite."),
          empty(),
          subtitle("4.2 Remplir la checklist"),
          para("Pour chaque point de contrôle, vous devez indiquer :"),
          empty(),
          sub3("Réponse"),
          bullet("Conforme — le point est satisfaisant"),
          bullet("Non-conforme — une non-conformité est constatée"),
          bullet("Pas nécessaire — le point ne s'applique pas à ce chantier"),
          empty(),
          sub3("Remarque"),
          para("Ajoutez un commentaire optionnel pour préciser votre observation. Ce texte apparaîtra dans le rapport PDF."),
          empty(),
          sub3("Photos"),
          para("Vous pouvez ajouter jusqu'à 10 photos par visite (1 pour les comptes gratuits) :"),
          bullet("Appareil photo — prendre une photo directement avec la caméra de votre appareil"),
          bullet("Galerie — sélectionner une image existante"),
          para("Chaque photo peut être annotée (dessin, marquage) pour mettre en évidence un problème."),
          empty(),
          sub3("Analyse IA des photos"),
          para("Pour chaque photo, vous pouvez demander une analyse automatique par intelligence artificielle. L'IA détecte :"),
          bullet("Les équipements de sécurité manquants"),
          bullet("Les conditions dangereuses"),
          bullet("Les non-conformités visuelles"),
          para("L'analyse est limitée à 20 requêtes par heure."),
          empty(),
          sub3("Assistant juridique"),
          para("Pour chaque point de contrôle, un assistant juridique IA est disponible. Il peut répondre à :"),
          bullet("Quelle est la réglementation applicable ?"),
          bullet("Quels sont les critères d'acceptation ?"),
          bullet("Comment formuler la NC dans le rapport ?"),
          bullet("Quels délais de correction recommander ?"),
          para("Vous pouvez insérer la réponse directement dans le champ remarque."),
          empty(),
          sub3("Sauvegarde automatique"),
          para("Vos réponses sont sauvegardées automatiquement toutes les 2 secondes. En cas de perte de connexion, les données sont stockées localement et synchronisées au retour en ligne."),
          empty(),
          sub3("Ajouter des thèmes en cours de visite"),
          para("Vous pouvez ajouter de nouvelles catégories et thèmes pendant la visite en cliquant sur « + Catégories / Thèmes ». Les points existants sont conservés et les nouveaux s'ajoutent à la suite."),
          empty(),
          subtitle("4.3 Valider la visite"),
          para("Lorsque tous les points ont été vérifiés, cliquez sur « Valider la visite »."),
          para("Si des non-conformités ont été relevées, une fenêtre s'ouvre pour chaque NC :"),
          bullet("Description — pré-remplie avec la remarque ou le nom du point, modifiable"),
          bullet("Délai de correction — date limite pour corriger le problème"),
          bullet("Renseigné par — nom de la personne qui a constaté la NC"),
          para("Après validation, la visite passe en statut « Terminée » et vous êtes redirigé vers la page de rapport."),

          // ===== 5. RAPPORTS =====
          new Paragraph({ children: [], pageBreakBefore: true }),
          title("5. Rapports et envoi"),
          subtitle("5.1 Générer un rapport PDF"),
          para("Depuis la page rapport d'une visite terminée, cliquez sur « Générer le rapport ». Le PDF contient :"),
          bullet("En-tête avec logo de l'entreprise et titre « Rapport de visite »"),
          bullet("Informations du chantier (nom, adresse, références)"),
          bullet("Date de la visite et nom de l'inspecteur"),
          bullet("Tableau des réponses par thème (conforme, non-conforme, pas nécessaire)"),
          bullet("Liste détaillée des non-conformités avec descriptions et délais"),
          bullet("Signature de l'inspecteur (tampon)"),
          bullet("Liste des destinataires en copie"),
          para("Le rapport est stocké automatiquement et accessible à tout moment."),
          empty(),
          subtitle("5.2 Envoyer par email"),
          para("Cliquez sur « Envoyer par email » pour envoyer le rapport PDF à tous les destinataires configurés sur le chantier."),
          bullet("Le rapport PDF est joint en pièce attachée"),
          bullet("L'email contient les informations de l'entreprise et de l'inspecteur"),
          bullet("Tous les destinataires reçoivent le même email"),
          bullet("Le bouton devient « Renvoyer par email » après un premier envoi"),
          para("Note : l'envoi par email est réservé aux comptes payants (inspecteur ou administrateur)."),
          empty(),
          subtitle("5.3 Aperçu PDF"),
          para("Vous pouvez prévisualiser le rapport directement dans l'application via le bouton « Voir l'aperçu ». Le PDF s'affiche dans un cadre intégré. Vous pouvez aussi l'ouvrir dans un nouvel onglet."),
          empty(),
          subtitle("5.4 Rapport mis à jour"),
          para("Lorsque toutes les non-conformités d'une visite sont corrigées, un bandeau vert s'affiche sur la fiche du chantier vous invitant à regénérer et renvoyer le rapport mis à jour."),

          // ===== 6. SUIVI DES NC =====
          new Paragraph({ children: [], pageBreakBefore: true }),
          title("6. Suivi des non-conformités"),
          subtitle("6.1 États d'une non-conformité"),
          para("Chaque non-conformité (NC) suit un cycle de vie :"),
          bullet("Ouvert — NC constatée lors de la visite"),
          bullet("En cours de correction — correction initiée"),
          bullet("Corrigé — NC résolue"),
          para("Une NC corrigée ne peut pas revenir à un état antérieur."),
          empty(),
          subtitle("6.2 Marquer une NC comme corrigée"),
          para("Depuis la section « Non-conformités » de la fiche chantier :"),
          bullet("Cliquez sur « Marquer conforme » sur la NC à mettre à jour"),
          bullet("La NC passe en statut « Corrigé » et apparaît dans l'historique"),
          bullet("Lorsque toutes les NC sont corrigées, le taux de conformité du chantier s'améliore"),
          empty(),
          subtitle("6.3 Historique"),
          para("Les NC corrigées sont masquées par défaut. Cliquez sur « Voir l'historique » ou « Voir les corrigées » pour les afficher (texte barré)."),

          // ===== 7. COMPARAISON =====
          new Paragraph({ children: [], pageBreakBefore: true }),
          title("7. Comparaison entre visites"),
          para("Lorsqu'un chantier a au moins 2 visites, une section « Comparaison » apparaît sur la fiche chantier."),
          subtitle("7.1 Effectuer une comparaison"),
          bullet("Sélectionnez deux visites à comparer (date A et date B)"),
          bullet("Cliquez sur « Comparer »"),
          para("Le système analyse point par point les différences et classe chaque point :"),
          bullet("Nouvelle — NC apparue pour la première fois"),
          bullet("Persistante — NC présente aux deux visites"),
          bullet("Corrigée — NC corrigée entre les deux visites"),
          bullet("Régression — point conforme devenu non-conforme"),
          bullet("Identique — pas de changement"),
          empty(),

          // ===== 8. EXPORT =====
          title("8. Export des données"),
          subtitle("8.1 Export Excel d'un chantier"),
          para("Depuis la fiche d'un chantier, cliquez sur le bouton de téléchargement (icône flèche). Le fichier Excel contient :"),
          bullet("Feuille « Chantier » — informations du projet"),
          bullet("Feuille « Visites » — toutes les visites avec dates et statuts"),
          bullet("Feuille « Écarts » — toutes les NC avec descriptions et états"),
          bullet("Feuille « Réponses détaillées » — toutes les réponses avec points et remarques"),
          empty(),
          subtitle("8.2 Export Excel global"),
          para("Depuis le tableau de bord, cliquez sur « Export Excel » pour télécharger un fichier contenant l'ensemble des données de tous vos chantiers, avec une feuille de statistiques globales."),

          // ===== 9. ADMINISTRATION =====
          new Paragraph({ children: [], pageBreakBefore: true }),
          title("9. Administration (rôle Administrateur)"),
          para("Les pages d'administration sont accessibles uniquement aux utilisateurs ayant le rôle « Administrateur »."),
          empty(),
          subtitle("9.1 Points de contrôle"),
          para("La page « Points de contrôle » permet de gérer la bibliothèque de points :"),
          bullet("Filtrer par catégorie, thème, statut (actif/désactivé)"),
          bullet("Rechercher par intitulé, base légale ou thème"),
          bullet("Créer une nouvelle catégorie ou un nouveau thème"),
          bullet("Créer un nouveau point de contrôle personnalisé"),
          bullet("Activer ou désactiver un point existant"),
          bullet("Importer des points depuis un fichier Excel"),
          para("L'application contient 26 catégories, 442 thèmes et 447 points de contrôle prédéfinis."),
          empty(),
          subtitle("9.2 Documents de référence"),
          para("La page « Documents » permet de gérer la base documentaire de référence (feuillets réglementaires, guides, etc.). Les documents peuvent être liés aux points de contrôle."),
          empty(),
          subtitle("9.3 Utilisateurs"),
          para("La page « Utilisateurs » permet de :"),
          bullet("Voir la liste de tous les utilisateurs avec leur rôle"),
          bullet("Créer un nouvel utilisateur (invitation par email)"),
          bullet("Modifier le nom, l'email et le rôle d'un utilisateur"),
          bullet("Supprimer un utilisateur (avec confirmation)"),
          empty(),
          subtitle("9.4 Entreprise"),
          para("La page « Entreprise » permet de configurer les informations de votre société :"),
          bullet("Nom de l'entreprise"),
          bullet("Adresse, NPA, Ville"),
          bullet("Téléphone et email"),
          bullet("Logo (affiché dans les rapports PDF et l'application)"),
          para("Ces informations apparaissent dans tous les rapports PDF et les emails envoyés."),

          // ===== 10. ABONNEMENT =====
          new Paragraph({ children: [], pageBreakBefore: true }),
          title("10. Abonnement et facturation"),
          subtitle("10.1 Offre gratuite"),
          para("Le compte gratuit (rôle Invité) est limité à :"),
          bullet("2 chantiers maximum"),
          bullet("1 visite par chantier"),
          bullet("1 photo par visite"),
          bullet("Pas de génération de rapport PDF"),
          bullet("Pas d'envoi par email"),
          empty(),
          subtitle("10.2 Offre payante"),
          para("Deux formules sont disponibles :"),
          bold("Mensuel — 29 CHF/mois : ", "chantiers et visites illimités, 10 photos par visite, rapports PDF et envoi email."),
          bold("Annuel — 260 CHF/an (économie de 25%) : ", "mêmes fonctionnalités, environ 21,70 CHF/mois."),
          para("Chaque formule commence par un essai gratuit de 14 jours, sans engagement."),
          empty(),
          subtitle("10.3 Gestion de l'abonnement"),
          para("Depuis la page « Abonnement » accessible dans le menu :"),
          bullet("Voir votre plan actuel et sa date de renouvellement"),
          bullet("Passer à l'offre payante via Stripe (paiement sécurisé)"),
          bullet("Gérer votre abonnement (modifier la carte, annuler, etc.)"),

          // ===== 11. MODE HORS-LIGNE =====
          new Paragraph({ children: [], pageBreakBefore: true }),
          title("11. Mode hors-ligne (PWA)"),
          para("Securionis Chantiers fonctionne comme une application web progressive (PWA) et supporte le mode hors-ligne :"),
          empty(),
          subtitle("11.1 Installation"),
          para("Vous pouvez installer l'application sur votre appareil :"),
          bullet("Sur Chrome : cliquez sur l'icône d'installation dans la barre d'adresse"),
          bullet("Sur Safari (iPad/iPhone) : Partager → Sur l'écran d'accueil"),
          para("L'application s'ouvre ensuite comme une app native, sans barre de navigateur."),
          empty(),
          subtitle("11.2 Fonctionnement hors-ligne"),
          para("En cas de perte de connexion internet :"),
          bullet("Un bandeau rouge « Hors-ligne » s'affiche en haut de l'écran"),
          bullet("Les réponses de la checklist sont sauvegardées localement (IndexedDB)"),
          bullet("Les photos sont stockées localement"),
          para("Lorsque la connexion revient :"),
          bullet("Un bandeau orange indique le nombre de modifications en attente"),
          bullet("Cliquez sur « Synchroniser » ou attendez la synchronisation automatique"),
          bullet("Les données sont envoyées au serveur et le bandeau disparaît"),

          // ===== 12. ASTUCES =====
          new Paragraph({ children: [], pageBreakBefore: true }),
          title("12. Astuces et bonnes pratiques"),
          bullet("Configurez les destinataires et documents AVANT la première visite"),
          bullet("Utilisez l'assistant juridique pour formuler précisément vos NC"),
          bullet("Prenez des photos annotées pour appuyer vos constats"),
          bullet("Vérifiez régulièrement le tableau de bord pour suivre les NC urgentes"),
          bullet("Exportez les données en Excel pour vos rapports périodiques"),
          bullet("Archivez les chantiers terminés pour garder votre liste propre"),
          bullet("Regénérez le rapport quand toutes les NC sont corrigées pour envoyer un rapport à jour"),
          bullet("Installez l'application en PWA pour un accès rapide sur tablette"),
          empty(),
          separator(),
          empty(),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "© 2026 Securionis — Santé et Sécurité au Travail", size: 18, color: "9ca3af", italics: true })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "Support : rapports@chantiers.securionis.com", size: 18, color: "9ca3af" })],
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const uint8 = new Uint8Array(buffer);

  return new NextResponse(uint8, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": 'attachment; filename="Securionis_Chantiers_Mode_Emploi.docx"',
    },
  });
}
