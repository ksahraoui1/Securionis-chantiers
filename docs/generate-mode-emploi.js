const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, ExternalHyperlink,
  LevelFormat, TableOfContents, PageBreak
} = require("docx");
const fs = require("fs");

// ─── Couleurs ───────────────────────────────────────────────
const BLUE       = "1E3A5F";
const BLUE_LIGHT = "2E75B6";
const BLUE_BG    = "D6E4F0";
const GREEN      = "1F6B3A";
const GREEN_BG   = "D6EFD8";
const RED        = "B91C1C";
const RED_BG     = "FEE2E2";
const ORANGE     = "B45309";
const ORANGE_BG  = "FEF3C7";
const GREY_BG    = "F3F4F6";
const BORDER_CLR = "CBD5E1";
const WHITE      = "FFFFFF";

// ─── Helpers ────────────────────────────────────────────────
const border = (color = BORDER_CLR) => ({
  top:    { style: BorderStyle.SINGLE, size: 4, color },
  bottom: { style: BorderStyle.SINGLE, size: 4, color },
  left:   { style: BorderStyle.SINGLE, size: 4, color },
  right:  { style: BorderStyle.SINGLE, size: 4, color },
});

function hRule() {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BLUE_LIGHT, space: 1 } },
    spacing: { before: 200, after: 200 },
    children: [],
  });
}

function cell(text, opts = {}) {
  const {
    bold = false, fill = WHITE, color = "000000", width = 4500,
    fontSize = 20, italic = false, align = AlignmentType.LEFT,
  } = opts;
  return new TableCell({
    borders: border(),
    width: { size: width, type: WidthType.DXA },
    shading: { fill, type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: align,
      children: [new TextRun({ text, bold, color, size: fontSize, italics: italic, font: "Arial" })],
    })],
  });
}

function headerCell(text, width = 4500) {
  return cell(text, { bold: true, fill: BLUE, color: WHITE, width, fontSize: 20 });
}

function infoRow(label, value, w1 = 3000, w2 = 6360) {
  return new TableRow({ children: [
    cell(label, { bold: true, fill: GREY_BG, width: w1, fontSize: 19 }),
    cell(value, { width: w2, fontSize: 19 }),
  ]});
}

function badgeRow(color, bgColor, label, desc) {
  return new TableRow({ children: [
    cell(label, { bold: true, fill: bgColor, color, width: 1800, align: AlignmentType.CENTER }),
    cell(desc,  { width: 7560, fontSize: 19 }),
  ]});
}

function tip(text) {
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [600, 8760],
    rows: [new TableRow({ children: [
      new TableCell({
        borders: border(BLUE_LIGHT),
        width: { size: 600, type: WidthType.DXA },
        shading: { fill: BLUE_BG, type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
          new TextRun({ text: "💡", size: 22, font: "Arial" }),
        ]})],
      }),
      new TableCell({
        borders: border(BLUE_LIGHT),
        width: { size: 8760, type: WidthType.DXA },
        shading: { fill: BLUE_BG, type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 160, right: 120 },
        children: [new Paragraph({ children: [
          new TextRun({ text, size: 19, font: "Arial", color: "1E3A5F" }),
        ]})],
      }),
    ]})],
  });
}

function warning(text) {
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [600, 8760],
    rows: [new TableRow({ children: [
      new TableCell({
        borders: border(ORANGE),
        width: { size: 600, type: WidthType.DXA },
        shading: { fill: ORANGE_BG, type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
          new TextRun({ text: "⚠", size: 22, font: "Arial" }),
        ]})],
      }),
      new TableCell({
        borders: border(ORANGE),
        width: { size: 8760, type: WidthType.DXA },
        shading: { fill: ORANGE_BG, type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 160, right: 120 },
        children: [new Paragraph({ children: [
          new TextRun({ text, size: 19, font: "Arial", color: ORANGE }),
        ]})],
      }),
    ]})],
  });
}

function para(text, opts = {}) {
  const { bold = false, size = 20, color = "333333", spacing = { before: 60, after: 60 }, indent } = opts;
  return new Paragraph({
    spacing,
    indent,
    children: [new TextRun({ text, bold, size, color, font: "Arial" })],
  });
}

function bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: "bullets", level },
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, size: 20, font: "Arial", color: "333333" })],
  });
}

function step(n, text) {
  return new Paragraph({
    numbering: { reference: "steps", level: 0 },
    spacing: { before: 60, after: 60 },
    children: [new TextRun({ text, size: 20, font: "Arial", color: "333333" })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 120 },
    children: [new TextRun({ text, bold: true, size: 28, font: "Arial", color: BLUE })],
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text, bold: true, size: 24, font: "Arial", color: BLUE_LIGHT })],
  });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

function space(n = 1) {
  return new Paragraph({ spacing: { before: n * 80, after: 0 }, children: [] });
}

// ─── Document ────────────────────────────────────────────────
const doc = new Document({
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: "•",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 640, hanging: 320 } } },
        }, {
          level: 1, format: LevelFormat.BULLET, text: "–",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 1000, hanging: 320 } } },
        }],
      },
      {
        reference: "steps",
        levels: [{
          level: 0, format: LevelFormat.DECIMAL, text: "%1.",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 640, hanging: 320 } } },
        }],
      },
    ],
  },
  styles: {
    default: { document: { run: { font: "Arial", size: 20 } } },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Arial", color: WHITE },
        paragraph: { spacing: { before: 400, after: 200 }, outlineLevel: 0 },
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: BLUE },
        paragraph: { spacing: { before: 300, after: 120 }, outlineLevel: 1 },
      },
      {
        id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial", color: BLUE_LIGHT },
        paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 },
      },
    ],
  },
  sections: [
    // ══════════════════════════════════════════
    // PAGE DE COUVERTURE
    // ══════════════════════════════════════════
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children: [
        space(8),
        new Table({
          width: { size: 9026, type: WidthType.DXA },
          columnWidths: [9026],
          rows: [new TableRow({ children: [new TableCell({
            borders: border(BLUE),
            shading: { fill: BLUE, type: ShadingType.CLEAR },
            margins: { top: 400, bottom: 400, left: 500, right: 500 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 100, after: 100 },
                children: [new TextRun({ text: "SECURIONIS CHANTIERS", size: 52, bold: true, font: "Arial", color: WHITE })],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 80, after: 80 },
                children: [new TextRun({ text: "Application d'inspection SST", size: 28, font: "Arial", color: "BDD7EE" })],
              }),
            ],
          })})]},
        ),
        space(4),
        new Table({
          width: { size: 9026, type: WidthType.DXA },
          columnWidths: [9026],
          rows: [new TableRow({ children: [new TableCell({
            borders: border(BLUE_LIGHT),
            shading: { fill: BLUE_BG, type: ShadingType.CLEAR },
            margins: { top: 300, bottom: 300, left: 400, right: 400 },
            children: [
              new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 60 }, children: [
                new TextRun({ text: "MODE D'EMPLOI", size: 40, bold: true, font: "Arial", color: BLUE }),
              ]}),
              new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40, after: 40 }, children: [
                new TextRun({ text: "Guide complet d'utilisation", size: 24, font: "Arial", color: BLUE_LIGHT }),
              ]}),
            ],
          })})]},
        ),
        space(6),
        new Table({
          width: { size: 9026, type: WidthType.DXA },
          columnWidths: [4513, 4513],
          rows: [
            new TableRow({ children: [
              cell("Version", { bold: true, fill: GREY_BG, width: 4513 }),
              cell("1.1 — Avril 2026", { width: 4513 }),
            ]}),
            new TableRow({ children: [
              cell("URL", { bold: true, fill: GREY_BG, width: 4513 }),
              cell("https://chantiers.securionis.com", { width: 4513, color: BLUE_LIGHT }),
            ]}),
            new TableRow({ children: [
              cell("Destinataires", { bold: true, fill: GREY_BG, width: 4513 }),
              cell("Inspecteurs SST et Administrateurs", { width: 4513 }),
            ]}),
          ],
        }),
      ],
    },

    // ══════════════════════════════════════════
    // TABLE DES MATIÈRES
    // ══════════════════════════════════════════
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      headers: {
        default: new Header({ children: [new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BLUE_LIGHT, space: 1 } },
          children: [
            new TextRun({ text: "Securionis Chantiers — Mode d'emploi", size: 18, color: BLUE_LIGHT, font: "Arial" }),
            new TextRun({ text: "      |      https://chantiers.securionis.com", size: 18, color: "999999", font: "Arial" }),
          ],
        })] }),
      },
      footers: {
        default: new Footer({ children: [new Paragraph({
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: BORDER_CLR, space: 1 } },
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "Page ", size: 18, color: "999999", font: "Arial" }),
            new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "999999", font: "Arial" }),
            new TextRun({ text: " / ", size: 18, color: "999999", font: "Arial" }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: "999999", font: "Arial" }),
          ],
        })] }),
      },
      children: [
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 200, after: 300 },
          children: [new TextRun({ text: "Table des matières", size: 36, bold: true, font: "Arial", color: BLUE })],
        }),
        new TableOfContents("Table des matières", {
          hyperlink: true,
          headingStyleRange: "1-3",
        }),
      ],
    },

    // ══════════════════════════════════════════
    // CONTENU PRINCIPAL
    // ══════════════════════════════════════════
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      headers: {
        default: new Header({ children: [new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BLUE_LIGHT, space: 1 } },
          children: [
            new TextRun({ text: "Securionis Chantiers — Mode d'emploi", size: 18, color: BLUE_LIGHT, font: "Arial" }),
            new TextRun({ text: "      |      https://chantiers.securionis.com", size: 18, color: "999999", font: "Arial" }),
          ],
        })] }),
      },
      footers: {
        default: new Footer({ children: [new Paragraph({
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: BORDER_CLR, space: 1 } },
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "Page ", size: 18, color: "999999", font: "Arial" }),
            new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "999999", font: "Arial" }),
            new TextRun({ text: " / ", size: 18, color: "999999", font: "Arial" }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: "999999", font: "Arial" }),
          ],
        })] }),
      },
      children: [

        // ── 1. PRÉSENTATION ──────────────────────────────────
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: "1. Présentation", size: 36, bold: true, font: "Arial", color: BLUE })],
        }),
        para("Securionis Chantiers est une application web dédiée aux inspecteurs SST (Santé et Sécurité au Travail) pour réaliser des contrôles de conformité sur les chantiers de construction en Suisse. Elle couvre l'ensemble du cycle d'inspection : préparation, visite sur le terrain, documentation, rapport PDF et suivi des non-conformités."),
        space(1),
        h2("Fonctionnalités principales"),
        bullet("Gestion des chantiers (création, modification, archivage)"),
        bullet("Visites d'inspection avec checklist réglementaire (447 points SUVA)"),
        bullet("Évaluation par point : Conforme, Non-conforme, Remarques, Pas nécessaire"),
        bullet("Prise de photos annotées sur le terrain"),
        bullet("Analyse IA des photos et assistant juridique"),
        bullet("Génération de rapports PDF et envoi par email"),
        bullet("Suivi des écarts (non-conformités) et de leur correction"),
        bullet("Export Excel (chantier ou global)"),
        bullet("Mode hors-ligne (PWA) avec synchronisation automatique"),
        bullet("Administration : utilisateurs, entreprise, points de contrôle"),
        space(1),
        h2("Accès"),
        new Table({
          width: { size: 9026, type: WidthType.DXA },
          columnWidths: [2500, 6526],
          rows: [
            infoRow("URL", "https://chantiers.securionis.com", 2500, 6526),
            infoRow("Navigateurs", "Chrome, Firefox, Safari, Edge (versions récentes)", 2500, 6526),
            infoRow("Appareils", "PC, Mac, tablette, smartphone (Android & iOS)", 2500, 6526),
          ],
        }),
        space(2),
        tip("Pour une utilisation optimale sur le terrain, installez l'application sur votre tablette (voir section 11 — Mode hors-ligne)."),

        pageBreak(),

        // ── 2. CONNEXION ──────────────────────────────────────
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: "2. Connexion et compte", size: 36, bold: true, font: "Arial", color: BLUE })],
        }),

        h3("2.1 Se connecter"),
        step(1, "Ouvrez https://chantiers.securionis.com dans votre navigateur"),
        step(2, "Saisissez votre adresse email et votre mot de passe"),
        step(3, "Cliquez sur Se connecter"),
        space(1),
        tip("La session dure 7 jours. Vous restez connecté même si vous fermez le navigateur."),

        space(2),
        h3("2.2 Mot de passe oublié"),
        step(1, "Sur la page de connexion, cliquez sur Mot de passe oublié ?"),
        step(2, "Saisissez votre adresse email et cliquez sur Envoyer le lien"),
        step(3, "Ouvrez l'email reçu et cliquez sur le lien de réinitialisation"),
        step(4, "Choisissez un nouveau mot de passe (min. 8 caractères, majuscule, minuscule, chiffre)"),
        step(5, "Cliquez sur Réinitialiser le mot de passe"),

        space(2),
        h3("2.3 Rôles utilisateurs"),
        para("Deux rôles existent dans l'application :"),
        space(1),
        new Table({
          width: { size: 9026, type: WidthType.DXA },
          columnWidths: [2000, 7026],
          rows: [
            new TableRow({ children: [headerCell("Rôle", 2000), headerCell("Droits", 7026)] }),
            new TableRow({ children: [
              cell("Inspecteur", { fill: GREY_BG, width: 2000 }),
              cell("Créer et gérer ses propres chantiers, réaliser des visites, consulter ses rapports", { width: 7026, fontSize: 19 }),
            ]}),
            new TableRow({ children: [
              cell("Administrateur", { fill: GREY_BG, width: 2000 }),
              cell("Accès complet : gestion des utilisateurs, entreprise, points de contrôle, tous les chantiers", { width: 7026, fontSize: 19 }),
            ]}),
          ],
        }),

        pageBreak(),

        // ── 3. DASHBOARD ─────────────────────────────────────
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: "3. Tableau de bord (Dashboard)", size: 36, bold: true, font: "Arial", color: BLUE })],
        }),
        para("Le dashboard est la première page affichée après connexion. Il donne une vue synthétique de l'activité de l'inspecteur connecté."),
        space(1),
        h3("3.1 Indicateurs clés (KPIs)"),
        new Table({
          width: { size: 9026, type: WidthType.DXA },
          columnWidths: [3000, 6026],
          rows: [
            new TableRow({ children: [headerCell("Indicateur", 3000), headerCell("Description", 6026)] }),
            infoRow("Chantiers actifs", "Nombre de chantiers non archivés", 3000, 6026),
            infoRow("NC ouvertes", "Non-conformités non encore corrigées", 3000, 6026),
            infoRow("Visites ce mois", "Nombre de visites terminées dans le mois en cours", 3000, 6026),
            infoRow("Taux de conformité", "Moyenne des points conformes sur les 3 derniers mois", 3000, 6026),
          ],
        }),
        space(2),
        h3("3.2 Graphique des non-conformités"),
        para("Le graphique en barres affiche l'évolution des NC sur les 6 derniers mois :"),
        bullet("Barres bleues : NC ouvertes"),
        bullet("Barres vertes : NC corrigées"),
        space(1),
        h3("3.3 Chantiers urgents"),
        para("La section Chantiers urgents liste les chantiers ayant des NC dont le délai de correction est dépassé. Cliquez sur un chantier pour accéder directement à sa page."),
        space(1),
        h3("3.4 Visites du mois"),
        para("La liste des visites réalisées dans le mois en cours est affichée avec le chantier et la date. Chaque ligne est cliquable pour accéder au rapport correspondant."),
        space(1),
        h3("3.5 Export Excel global"),
        para("Le bouton Export Excel en haut du dashboard génère un fichier contenant 4 feuilles : Chantiers, Visites, Écarts NC, Statistiques."),

        pageBreak(),

        // ── 4. CHANTIERS ──────────────────────────────────────
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: "4. Gestion des chantiers", size: 36, bold: true, font: "Arial", color: BLUE })],
        }),

        h3("4.1 Liste des chantiers"),
        para("Depuis la barre de navigation, cliquez sur Chantiers pour afficher la liste de vos chantiers actifs."),
        bullet("Chaque carte affiche : nom, adresse, nature des travaux, nombre de NC ouvertes, date de la dernière visite"),
        bullet("La barre de recherche filtre par nom, adresse ou nature des travaux"),
        bullet("L'onglet Archives permet de consulter les chantiers archivés"),
        space(1),
        h3("4.2 Créer un nouveau chantier"),
        step(1, "Cliquez sur le bouton Nouveau chantier"),
        step(2, "Remplissez les informations obligatoires : Adresse et Nature des travaux"),
        step(3, "Complétez les champs optionnels :"),
        bullet("Nom du chantier (apparaîtra dans les rapports)", 1),
        bullet("N° CAMAC, N° parcelle, N° ECA, Référence communale", 1),
        bullet("Nom du contact sur site", 1),
        step(4, "Cliquez sur Créer le chantier"),
        space(1),
        h3("4.3 Page détail d'un chantier"),
        para("Cliquez sur un chantier pour ouvrir sa fiche complète, qui contient :"),
        new Table({
          width: { size: 9026, type: WidthType.DXA },
          columnWidths: [2800, 6226],
          rows: [
            new TableRow({ children: [headerCell("Section", 2800), headerCell("Contenu", 6226)] }),
            infoRow("Informations", "Données du chantier avec bouton Modifier", 2800, 6226),
            infoRow("Documents", "Permis, plans, rapports classés par catégorie", 2800, 6226),
            infoRow("Destinataires", "Personnes recevant les rapports par email", 2800, 6226),
            infoRow("Visites", "Timeline des visites avec statut et NC", 2800, 6226),
            infoRow("Comparaison N/N-1", "Évolution des NC entre deux visites", 2800, 6226),
            infoRow("Non-conformités", "Liste complète des écarts avec statut", 2800, 6226),
          ],
        }),
        space(2),
        h3("4.4 Archiver / Désarchiver un chantier"),
        para("Le bouton Archive (icône boîte) en haut de la page chantier permet d'archiver un chantier terminé. Il n'apparaîtra plus dans la liste principale mais reste accessible via l'onglet Archives. Cliquez à nouveau pour le désarchiver."),
        space(1),
        warning("Un chantier archivé ne peut plus recevoir de nouvelles visites."),
        space(1),
        h3("4.5 Gérer les destinataires"),
        para("Les destinataires sont les personnes qui recevront les rapports PDF par email."),
        step(1, "Dans la section Destinataires, cliquez sur + Ajouter"),
        step(2, "Saisissez : Nom, Organisation (optionnel), Email"),
        step(3, "Cliquez sur Enregistrer"),
        space(1),
        tip("Vous pouvez ajouter plusieurs destinataires. Tous recevront le rapport en un seul envoi."),

        pageBreak(),

        // ── 5. DOCUMENTS ──────────────────────────────────────
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: "5. Documents par chantier", size: 36, bold: true, font: "Arial", color: BLUE })],
        }),
        para("Chaque chantier dispose d'un espace documentaire pour centraliser les pièces administratives et techniques."),
        space(1),
        h3("5.1 Catégories de documents"),
        bullet("Permis de construire"),
        bullet("Plans"),
        bullet("Rapport ECA"),
        bullet("Autorisation travaux dangereux"),
        bullet("Certificat entreprise"),
        bullet("Autre"),
        space(1),
        h3("5.2 Ajouter un document"),
        step(1, "Dans la section Documents, cliquez sur Ajouter un document"),
        step(2, "Saisissez le nom du document"),
        step(3, "Choisissez la catégorie"),
        step(4, "Ajoutez une description (optionnel)"),
        step(5, "Sélectionnez le fichier (PDF, Word, Excel, Image — max. 50 Mo)"),
        step(6, "Cliquez sur Enregistrer"),
        space(1),
        h3("5.3 Mettre à jour un document"),
        para("Pour remplacer un fichier sans perdre l'historique, cliquez sur Nouvelle version. Le numéro de version s'incrémente automatiquement (v2, v3...)."),

        pageBreak(),

        // ── 6. VISITES ────────────────────────────────────────
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: "6. Réaliser une visite d'inspection", size: 36, bold: true, font: "Arial", color: BLUE })],
        }),

        h3("6.1 Préparer une visite"),
        para("La préparation permet de configurer les catégories et thèmes à inspecter avant de se rendre sur le chantier."),
        step(1, "Sur la page chantier, cliquez sur Préparer la visite"),
        step(2, "Cochez les catégories à contrôler (ex. Accès & Sols, Échafaudages, Électricité...)"),
        step(3, "Utilisez la barre de recherche pour trouver rapidement une catégorie ou un thème"),
        step(4, "Affinez en sélectionnant les thèmes spécifiques (Tout cocher / Tout décocher disponible)"),
        step(5, "La préparation est sauvegardée pour être utilisée lors de la visite"),
        space(1),
        h3("6.2 Démarrer une nouvelle visite"),
        step(1, "Sur la page chantier, cliquez sur Nouvelle visite"),
        step(2, "Sélectionnez les catégories et thèmes à inspecter"),
        step(3, "Cliquez sur Démarrer la visite"),
        space(1),
        h3("6.3 Champs d'en-tête de la visite"),
        para("En haut de la checklist, deux champs sont disponibles avant les points de contrôle :"),
        new Table({
          width: { size: 9026, type: WidthType.DXA },
          columnWidths: [3000, 6026],
          rows: [
            new TableRow({ children: [headerCell("Champ", 3000), headerCell("Description", 6026)] }),
            infoRow("Renseignements donnés par", "Nom de la personne présente sur le chantier lors de la visite", 3000, 6026),
            infoRow("Remarques générales", "Observations globales sur la visite, apparaissent dans une section dédiée du rapport PDF", 3000, 6026),
          ],
        }),
        space(2),
        h3("6.4 Évaluer les points de contrôle"),
        para("Pour chaque point de contrôle, cliquez sur l'un des 4 boutons de réponse :"),
        space(1),
        new Table({
          width: { size: 9026, type: WidthType.DXA },
          columnWidths: [2000, 7026],
          rows: [
            new TableRow({ children: [headerCell("Bouton", 2000), headerCell("Signification et effet", 7026)] }),
            badgeRow(GREEN, GREEN_BG, "Conforme", "Le point respecte la réglementation. Apparaît dans les statistiques."),
            badgeRow(RED, RED_BG, "Non-conforme", "Un écart est constaté. Déclenche la création d'un écart avec délai de correction. Apparaît dans la section Constatations du rapport."),
            badgeRow(ORANGE, ORANGE_BG, "Remarques", "Observation à signaler sans caractère d'infraction. Apparaît dans la section Remarques du rapport (fond ambre)."),
            badgeRow("555555", GREY_BG, "Pas nécessaire", "Le point ne s'applique pas à ce chantier. Exclu des statistiques."),
          ],
        }),
        space(2),
        h3("6.5 Ajouter une remarque textuelle"),
        para("Sous les boutons de réponse, un champ texte Remarque permet de détailler la constatation. Ce texte apparaît dans le rapport PDF sous le point concerné."),
        space(1),
        h3("6.6 Prendre des photos"),
        step(1, "Cliquez sur Appareil photo pour prendre une photo directement ou Galerie pour importer"),
        step(2, "L'éditeur d'annotation s'ouvre automatiquement après la capture"),
        step(3, "Annotez avec les outils disponibles (flèche, cercle, texte, dessin libre)"),
        step(4, "Choisissez la couleur (rouge, vert, navy, jaune, blanc) et l'épaisseur"),
        step(5, "Cliquez sur Valider pour sauvegarder. La photo apparaît sous le point de contrôle."),
        space(1),
        bullet("Maximum 10 photos par point de contrôle"),
        bullet("Pour modifier une annotation existante : survolez la photo et cliquez sur l'icône crayon"),
        space(1),
        h3("6.7 Analyse IA des photos"),
        para("Lorsqu'au moins une photo est uploadée, le bouton Analyse IA apparaît sous le point de contrôle."),
        step(1, "Cliquez sur Analyse IA"),
        step(2, "L'IA analyse la dernière photo uploadée et détecte les dangers potentiels"),
        step(3, "Des suggestions apparaissent avec niveau de sévérité (critique / majeur / mineur)"),
        step(4, "Cliquez sur Appliquer la remarque ou Appliquer la conformité pour utiliser les suggestions"),
        space(1),
        tip("L'analyse IA est particulièrement utile pour détecter automatiquement des risques visibles sur photo (équipements manquants, zones non sécurisées, etc.)."),
        space(1),
        h3("6.8 Assistant juridique"),
        para("Pour chaque point, un assistant IA peut répondre aux questions réglementaires."),
        step(1, "Cliquez sur Assistant juridique pour déployer le panneau"),
        step(2, "Choisissez une question rapide prédéfinie ou tapez votre propre question"),
        step(3, "L'IA répond avec les références légales suisses (OTConst, SUVA, SIA, etc.)"),
        step(4, "Cliquez sur Copier dans la remarque pour insérer la réponse dans le champ Remarque"),
        space(1),
        h3("6.9 Ajouter des catégories en cours de visite"),
        para("Il est possible d'ajouter de nouvelles catégories/thèmes sans perdre les réponses déjà saisies."),
        step(1, "Faites défiler jusqu'en bas de la checklist"),
        step(2, "Cliquez sur le bouton + Catégories / Thèmes"),
        step(3, "Sélectionnez les nouvelles catégories ou thèmes"),
        step(4, "Les nouveaux points s'ajoutent en fin de checklist"),
        space(1),
        h3("6.10 Ajouter un point personnalisé"),
        para("Le bouton + Ajouter un point de contrôle personnalisé permet de créer un point ad hoc spécifique à ce chantier, sans l'ajouter à la base globale."),
        space(1),
        h3("6.11 Sauvegarde automatique"),
        para("Chaque modification de la checklist est sauvegardée automatiquement toutes les 2 secondes. Un indicateur en haut de page confirme la sauvegarde. En mode hors-ligne, les données sont stockées localement (IndexedDB)."),
        space(1),
        h3("6.12 Valider la visite"),
        step(1, "Cliquez sur Valider la visite en bas de la checklist"),
        step(2, "Pour chaque point Non-conforme détecté, une fenêtre s'ouvre :"),
        bullet("Vérifiez la description de l'écart (modifiable)", 1),
        bullet("Saisissez un délai de correction (ex. \"Immédiatement\", \"7 jours\", \"30.06.2026\")", 1),
        bullet("Cliquez sur Suivant ou Valider et terminer", 1),
        step(3, "La visite passe au statut Terminée"),
        step(4, "Vous êtes redirigé vers la page du rapport"),
        space(1),
        h3("6.13 Supprimer une visite en cours"),
        para("Une visite dont le statut est En cours ou Brouillon peut être supprimée."),
        step(1, "Sur la page chantier, dans la timeline des visites, cliquez sur l'icône corbeille"),
        step(2, "Confirmez en cliquant sur Oui dans la fenêtre de confirmation"),
        space(1),
        warning("La suppression est définitive et irréversible. Toutes les réponses et photos associées sont effacées. Une visite Terminée ne peut pas être supprimée."),

        pageBreak(),

        // ── 7. RAPPORT ────────────────────────────────────────
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: "7. Rapport de visite", size: 36, bold: true, font: "Arial", color: BLUE })],
        }),

        h3("7.1 Page rapport"),
        para("Après validation d'une visite, la page rapport affiche :"),
        bullet("Un récapitulatif chiffré : total des points, conformes, non-conformes"),
        bullet("Un bandeau vert si toutes les NC ont été corrigées"),
        bullet("La liste des non-conformités avec statut et délai"),
        bullet("L'état du PDF (généré ou non) et de l'email (envoyé ou non)"),
        space(1),
        h3("7.2 Contenu du rapport PDF"),
        para("Le rapport PDF généré contient les sections suivantes :"),
        new Table({
          width: { size: 9026, type: WidthType.DXA },
          columnWidths: [3000, 6026],
          rows: [
            new TableRow({ children: [headerCell("Section PDF", 3000), headerCell("Contenu", 6026)] }),
            infoRow("En-tête", "Logo de l'entreprise, titre Rapport de visite", 3000, 6026),
            infoRow("Informations", "Inspecteur, date, chantier, adresse, nature des travaux, références", 3000, 6026),
            infoRow("Remarques générales", "Observations globales saisies en début de visite (si renseignées)", 3000, 6026),
            infoRow("Constatations", "Points Non-conformes : intitulé, remarque, photos, délai, statut", 3000, 6026),
            infoRow("Remarques", "Points Remarques : intitulé, remarque, photos (fond ambre)", 3000, 6026),
            infoRow("Signature", "Signature de l'inspecteur (si configurée)", 3000, 6026),
            infoRow("Copie(s)", "Liste des destinataires en copie", 3000, 6026),
            infoRow("Pied de page", "Coordonnées de l'entreprise, numéro de page", 3000, 6026),
          ],
        }),
        space(2),
        h3("7.3 Générer le PDF"),
        step(1, "Sur la page rapport, cliquez sur Télécharger PDF"),
        step(2, "Le PDF est généré et sauvegardé dans le cloud"),
        step(3, "Une fois généré, cliquez sur Voir le rapport pour l'ouvrir dans l'aperçu"),
        space(1),
        h3("7.4 Envoyer par email"),
        step(1, "Assurez-vous qu'au moins un destinataire est configuré pour le chantier"),
        step(2, "Cliquez sur Envoyer par email"),
        step(3, "Le rapport PDF est envoyé à tous les destinataires en un seul email"),
        step(4, "L'email contient la signature dynamique de votre entreprise"),
        space(1),
        tip("Après correction de toutes les NC, un bandeau vert vous invite à régénérer le rapport mis à jour et à le renvoyer."),

        pageBreak(),

        // ── 8. ÉCARTS ─────────────────────────────────────────
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: "8. Suivi des non-conformités (Écarts)", size: 36, bold: true, font: "Arial", color: BLUE })],
        }),

        h3("8.1 Statuts des écarts"),
        new Table({
          width: { size: 9026, type: WidthType.DXA },
          columnWidths: [2500, 6526],
          rows: [
            new TableRow({ children: [headerCell("Statut", 2500), headerCell("Signification", 6526)] }),
            badgeRow(RED, RED_BG, "Ouvert", "L'écart a été constaté, aucune action de correction n'a été engagée"),
            badgeRow(ORANGE, ORANGE_BG, "En cours de correction", "Des mesures correctives ont été mises en place"),
            badgeRow(GREEN, GREEN_BG, "Corrigé", "L'écart a été entièrement résolu"),
          ],
        }),
        space(2),
        h3("8.2 Mettre à jour un statut"),
        step(1, "Sur la page chantier, section Non-conformités, cliquez sur le badge de statut d'un écart"),
        step(2, "Sélectionnez le nouveau statut dans la liste déroulante"),
        step(3, "La mise à jour est immédiate"),
        space(1),
        para("Les transitions autorisées sont :"),
        bullet("Ouvert → En cours de correction"),
        bullet("Ouvert → Corrigé"),
        bullet("En cours de correction → Corrigé"),
        space(1),
        h3("8.3 Comparaison entre visites"),
        para("La section Comparaison N/N-1 compare automatiquement les deux dernières visites terminées :"),
        bullet("Corrigée (vert) : point Non-conforme en N-1, Conforme en N"),
        bullet("Persistante (orange) : point Non-conforme lors des deux visites"),
        bullet("Nouvelle (rouge) : point Non-conforme en N, Conforme en N-1"),
        space(1),
        tip("Cette comparaison est disponible à partir de la 2e visite sur un chantier."),

        pageBreak(),

        // ── 9. EXPORT EXCEL ───────────────────────────────────
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: "9. Export Excel", size: 36, bold: true, font: "Arial", color: BLUE })],
        }),

        h3("9.1 Export global (depuis le Dashboard)"),
        para("Le fichier Excel global contient 4 feuilles :"),
        bullet("Chantiers : liste complète avec adresses et statuts"),
        bullet("Visites : toutes les visites avec dates, statuts et nombre de NC"),
        bullet("Écarts NC : toutes les non-conformités avec délais et statuts"),
        bullet("Statistiques : KPIs globaux par période"),
        space(1),
        h3("9.2 Export par chantier (depuis la page chantier)"),
        para("Le fichier Excel par chantier contient 4 feuilles :"),
        bullet("Chantier : fiche d'information complète"),
        bullet("Visites : visites du chantier"),
        bullet("Écarts NC : non-conformités du chantier"),
        bullet("Réponses détaillées : chaque point de contrôle avec valeur, remarque et base légale"),
        space(1),
        para("Pour télécharger, cliquez sur l'icône Excel (vert) sur la page correspondante. Le fichier se télécharge automatiquement."),

        pageBreak(),

        // ── 10. ADMINISTRATION ─────────────────────────────────
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: "10. Administration", size: 36, bold: true, font: "Arial", color: BLUE })],
        }),
        para("La section Administration est accessible uniquement aux utilisateurs avec le rôle Administrateur, via la navigation (icône engrenage)."),
        space(1),
        h3("10.1 Points de contrôle"),
        para("Navigation : Admin > Points de contrôle"),
        space(1),
        para("Gérez la base des 447 points de contrôle (26 catégories, 442 thèmes) :"),
        bullet("Filtrer par catégorie, thème, statut ou recherche texte libre"),
        bullet("Activer / Désactiver un point (les points inactifs n'apparaissent pas dans les nouvelles visites)"),
        bullet("Modifier un point existant : cliquez dessus pour ouvrir le formulaire"),
        bullet("Créer un nouveau point : cliquez sur + Nouveau point"),
        space(1),
        para("Lors de la création ou modification d'un point :"),
        bullet("Intitulé (obligatoire)"),
        bullet("Catégorie et thème (existants ou nouveau thème à créer)"),
        bullet("Critère d'acceptation, base légale, explications"),
        bullet("Documents PDF réglementaires associés (max. 5)"),
        space(1),
        h3("10.2 Utilisateurs"),
        para("Navigation : Admin > Utilisateurs"),
        space(1),
        bullet("Voir la liste des utilisateurs de l'entreprise avec leur rôle"),
        bullet("Créer un utilisateur : cliquez sur + Nouvel utilisateur, saisissez nom, email et rôle"),
        bullet("Modifier le rôle d'un utilisateur existant"),
        bullet("Supprimer un utilisateur"),
        space(1),
        warning("Le rôle d'un utilisateur ne peut pas être modifié directement par l'utilisateur lui-même (protection de sécurité)."),
        space(1),
        h3("10.3 Entreprise"),
        para("Navigation : Admin > Entreprise"),
        space(1),
        para("Configurez les informations de votre entreprise qui apparaissent dans les rapports PDF et les emails :"),
        bullet("Nom de l'entreprise"),
        bullet("Adresse, NPA, Ville"),
        bullet("Téléphone et Email"),
        bullet("Logo (format PNG ou JPEG recommandé, apparaît en haut des rapports PDF)"),
        space(1),
        h3("10.4 Documents réglementaires"),
        para("Navigation : Admin > Documents"),
        space(1),
        para("Gérez la base documentaire réglementaire (normes SUVA, OTConst, SIA...) accessible depuis les points de contrôle. Ces documents sont en lecture seule pour les inspecteurs."),

        pageBreak(),

        // ── 11. PWA HORS-LIGNE ─────────────────────────────────
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: "11. Mode hors-ligne (PWA)", size: 36, bold: true, font: "Arial", color: BLUE })],
        }),
        para("L'application est une Progressive Web App (PWA) qui fonctionne sans connexion internet, idéale pour les visites en sous-sol ou dans des zones sans réseau."),
        space(1),
        h3("11.1 Installer l'application"),
        para("Sur tablette ou smartphone :"),
        step(1, "Ouvrez https://chantiers.securionis.com dans Chrome (Android) ou Safari (iOS)"),
        step(2, "Appuyez sur le menu du navigateur (3 points ou icône partage)"),
        step(3, "Sélectionnez Ajouter à l'écran d'accueil ou Installer l'application"),
        step(4, "L'application s'ouvre désormais comme une app native, en plein écran"),
        space(1),
        h3("11.2 Fonctionnement hors-ligne"),
        bullet("Un bandeau rouge Hors-ligne s'affiche en haut quand la connexion est perdue"),
        bullet("Toutes les saisies de la checklist sont sauvegardées localement (IndexedDB)"),
        bullet("Les photos capturées sont stockées en attente de synchronisation"),
        bullet("La checklist reste entièrement utilisable sans réseau"),
        space(1),
        h3("11.3 Synchronisation au retour du réseau"),
        step(1, "Un bandeau orange X modifications en attente s'affiche"),
        step(2, "La synchronisation démarre automatiquement"),
        step(3, "Ou cliquez sur Synchroniser pour forcer la synchronisation immédiate"),
        step(4, "Toutes les données et photos sont envoyées au serveur"),
        space(1),
        tip("Pour les visites longues, activez le mode avion après avoir chargé la checklist. Toutes les modifications seront sauvegardées localement."),

        pageBreak(),

        // ── 12. RACCOURCIS ─────────────────────────────────────
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: "12. Raccourcis et astuces", size: 36, bold: true, font: "Arial", color: BLUE })],
        }),
        new Table({
          width: { size: 9026, type: WidthType.DXA },
          columnWidths: [4000, 5026],
          rows: [
            new TableRow({ children: [headerCell("Action", 4000), headerCell("Comment faire", 5026)] }),
            infoRow("Rechercher un chantier", "Barre de recherche sur la page Chantiers", 4000, 5026),
            infoRow("Rechercher une catégorie/thème", "Barre de recherche lors de la création ou en cours de visite", 4000, 5026),
            infoRow("Annoter une photo existante", "Survolez la photo → cliquez sur l'icône crayon", 4000, 5026),
            infoRow("Copier une suggestion IA", "Bouton Copier dans la remarque sous la suggestion", 4000, 5026),
            infoRow("Ajouter un thème en cours", "Bouton + Catégories / Thèmes en bas de checklist", 4000, 5026),
            infoRow("Supprimer une visite", "Icône corbeille dans la timeline (visites non terminées)", 4000, 5026),
            infoRow("Voir le rapport d'une visite", "Cliquez sur la visite Terminée dans la timeline", 4000, 5026),
            infoRow("Régénérer un rapport", "Page rapport → Télécharger PDF (écrase l'ancien)", 4000, 5026),
            infoRow("Archiver un chantier", "Bouton Archive (boîte) sur la page du chantier", 4000, 5026),
            infoRow("Export Excel chantier", "Icône Excel (vert) sur la page du chantier", 4000, 5026),
            infoRow("Export Excel global", "Bouton Export Excel sur le Dashboard", 4000, 5026),
          ],
        }),

        pageBreak(),

        // ── 13. SÉCURITÉ ───────────────────────────────────────
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: "13. Sécurité et confidentialité", size: 36, bold: true, font: "Arial", color: BLUE })],
        }),
        para("Securionis Chantiers applique des mesures de sécurité strictes pour protéger vos données :"),
        space(1),
        bullet("Authentification sécurisée avec session de 7 jours"),
        bullet("Toutes les communications sont chiffrées (HTTPS/TLS)"),
        bullet("Les données sont isolées par entreprise (accès impossible aux données d'une autre entreprise)"),
        bullet("Photos et rapports stockés dans un espace sécurisé avec accès contrôlé"),
        bullet("Journal d'audit des actions sensibles (envoi d'email, changement de statut, etc.)"),
        bullet("Chaque utilisateur n'accède qu'aux chantiers qui lui sont assignés"),
        space(1),
        warning("Ne partagez jamais vos identifiants de connexion. En cas de suspicion de compromission, changez immédiatement votre mot de passe via la fonction Mot de passe oublié."),

        pageBreak(),

        // ── 14. SUPPORT ────────────────────────────────────────
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: "14. Support", size: 36, bold: true, font: "Arial", color: BLUE })],
        }),
        new Table({
          width: { size: 9026, type: WidthType.DXA },
          columnWidths: [2500, 6526],
          rows: [
            new TableRow({ children: [headerCell("Contact", 2500), headerCell("Détail", 6526)] }),
            infoRow("Support technique", "Contactez votre administrateur ou l'adresse email configurée dans Admin > Entreprise", 2500, 6526),
            infoRow("URL application", "https://chantiers.securionis.com", 2500, 6526),
            infoRow("Version", "1.1 — Avril 2026", 2500, 6526),
          ],
        }),
        space(3),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 100 },
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: BORDER_CLR, space: 1 } },
          children: [new TextRun({ text: "Securionis Chantiers — Santé et Sécurité au Travail", size: 18, color: "999999", font: "Arial", italics: true })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "https://chantiers.securionis.com", size: 18, color: BLUE_LIGHT, font: "Arial" })],
        }),
      ],
    },
  ],
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("docs/Mode_Emploi_Securionis_Chantiers.docx", buffer);
  console.log("Document genere avec succes !");
});
