import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import {
  LIBELLES_PRIORITE,
  ORDRE_PRIORITE,
} from "@/lib/utils/priorite-sst";
import type {
  AnnotationRapportAuto,
  ComparaisonHistorique,
  EcartRapport,
  RapportComparaisonAutoProps,
} from "@/components/pdf/rapport-comparaison-auto";

/**
 * Version DOCX du rapport de comparaison automatique.
 *
 * Elle reprend le contenu du PDF (`rapport-comparaison-auto.tsx`) et **ses
 * mêmes données d'entrée** : un seul chargement, côté route, alimente les deux
 * formats, pour qu'aucun ne dérive de l'autre.
 *
 * La mise en page diffère nécessairement — Word n'a ni gabarit fixe ni pages
 * paysage mêlées — mais l'ordre et la substance des sections sont identiques.
 */

const NAVY = "002855";
const ORANGE = "E67E22";
const GRIS = "6b7280";

function titre1(contenu: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 180 },
    children: [new TextRun({ text: contenu, bold: true, size: 30, color: NAVY })],
  });
}

function titre2(contenu: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 260, after: 120 },
    children: [new TextRun({ text: contenu, bold: true, size: 24, color: NAVY })],
  });
}

function paragraphe(
  contenu: string,
  options: { couleur?: string; taille?: number } = {}
): Paragraph {
  return new Paragraph({
    spacing: { after: 80 },
    children: [
      new TextRun({
        text: contenu,
        size: options.taille ?? 20,
        color: options.couleur,
      }),
    ],
  });
}

function ligneInfo(cle: string, valeur: string): Paragraph {
  return new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({ text: `${cle} : `, size: 20, color: GRIS }),
      new TextRun({ text: valeur, size: 20, bold: true }),
    ],
  });
}

function cellule(
  contenu: string,
  options: { entete?: boolean; largeur?: number } = {}
): TableCell {
  return new TableCell({
    width: options.largeur
      ? { size: options.largeur, type: WidthType.PERCENTAGE }
      : undefined,
    shading: options.entete ? { fill: "f3f4f6" } : undefined,
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: contenu,
            size: 16,
            bold: options.entete,
            color: options.entete ? "374151" : undefined,
          }),
        ],
      }),
    ],
  });
}

function tableau(
  entetes: { libelle: string; largeur: number }[],
  lignes: string[][]
): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: entetes.map((e) =>
          cellule(e.libelle, { entete: true, largeur: e.largeur })
        ),
      }),
      ...lignes.map(
        (ligne) =>
          new TableRow({
            children: ligne.map((valeur, index) =>
              cellule(valeur, { largeur: entetes[index]?.largeur })
            ),
          })
      ),
    ],
  });
}

function image(donnees: Buffer, largeur: number, hauteur: number): Paragraph {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    children: [
      new ImageRun({
        type: "png",
        data: donnees,
        transformation: { width: largeur, height: hauteur },
      }),
    ],
  });
}

function pourcent(valeur: number): string {
  return `${Math.round(valeur * 100)} %`;
}

function surface(aireRelative: number): string {
  const p = aireRelative * 100;
  if (p >= 1) return `${p.toFixed(1)} %`;
  if (p >= 0.01) return `${p.toFixed(2)} %`;
  return "< 0,01 %";
}

function version(plan: { version: number | null }): string {
  return plan.version ? `V${plan.version}` : "sans version";
}

function lignesEcarts(ecarts: EcartRapport[]): string[][] {
  return ecarts.map((ecart) => [
    String(ecart.numero),
    ecart.type,
    pourcent(ecart.confiance),
    surface(ecart.aireRelative),
    `${Math.round(ecart.x)} ; ${Math.round(ecart.y)}`,
    LIBELLES_PRIORITE[ecart.priorite],
    ecart.recommandation,
    ecart.nc ? `Oui — #${ecart.nc}` : "Non",
  ]);
}

function lignesAnnotations(annotations: AnnotationRapportAuto[]): string[][] {
  return annotations.map((a) => [
    String(a.numero),
    a.type,
    a.couleur,
    a.commentaire?.trim() || "—",
    a.numeroNC ? `NC #${a.numeroNC}` : "—",
  ]);
}

function lignesHistorique(historique: ComparaisonHistorique[]): string[][] {
  return historique.map((h) => [
    h.date,
    h.planPE,
    h.planEXE,
    String(h.annotations),
  ]);
}

export async function construireRapportDocx(
  props: RapportComparaisonAutoProps
): Promise<Buffer> {
  const comparaison =
    `PE ${version(props.planPE)} (${props.planPE.date}) ` +
    `vs EXE ${version(props.planEXE)} (${props.planEXE.date})`;

  const enfants: (Paragraph | Table)[] = [];

  // ----- Page de garde
  enfants.push(
    props.logo
      ? image(props.logo.data, 150, 40)
      : new Paragraph({
          children: [
            new TextRun({
              text: "Securionis Chantiers",
              bold: true,
              size: 26,
              color: NAVY,
            }),
          ],
        }),
    new Paragraph({
      spacing: { before: 240, after: 60 },
      children: [
        new TextRun({
          text: "SÉCURITÉ ET SANTÉ AU TRAVAIL",
          bold: true,
          size: 18,
          color: GRIS,
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "Rapport de comparaison automatique de plans",
          bold: true,
          size: 44,
          color: NAVY,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 320 },
      children: [
        new TextRun({
          text: "Détection assistée par ordinateur des écarts entre plans",
          size: 22,
          color: GRIS,
        }),
      ],
    }),
    ligneInfo("Date du rapport", props.dateJour),
    ligneInfo("Chantier", props.chantierNom)
  );

  if (props.chantierAdresse && props.chantierAdresse !== props.chantierNom) {
    enfants.push(ligneInfo("Adresse", props.chantierAdresse));
  }
  enfants.push(
    ligneInfo("Plans comparés", comparaison),
    ligneInfo("Chargé de sécurité", props.signePar)
  );
  if (props.entrepriseNom) {
    enfants.push(ligneInfo("Entreprise", props.entrepriseNom));
  }

  enfants.push(
    new Paragraph({
      spacing: { before: 320 },
      shading: { fill: "fff7ed" },
      children: [
        new TextRun({
          text:
            "Les écarts de ce rapport sont relevés par comparaison d'images. Le procédé mesure des " +
            "différences de tracé entre deux plans ; il n'interprète ni leur contenu ni leur portée. " +
            "Les priorités et les recommandations ci-après sont établies par une règle déterministe " +
            "fondée sur la confiance de détection, la surface concernée et le sens de l'écart. Elles " +
            "servent à ordonner les vérifications et ne se substituent pas à l'appréciation du chargé " +
            "de sécurité.",
          size: 17,
          color: "7c2d12",
        }),
      ],
    })
  );

  // ----- Résumé exécutif
  enfants.push(
    titre1("Résumé exécutif"),
    paragraphe(
      `${props.ecarts.length} différence${
        props.ecarts.length > 1 ? "s" : ""
      } détectée${props.ecarts.length > 1 ? "s" : ""} — ${comparaison}`,
      { taille: 22 }
    ),
    titre2("Répartition par type"),
    tableau(
      props.repartitionType.map((e) => ({ libelle: e.libelle, largeur: 25 })),
      [props.repartitionType.map((e) => String(e.nombre))]
    ),
    new Paragraph({ spacing: { after: 120 }, children: [] }),
    titre2("Répartition par priorité"),
    tableau(
      ORDRE_PRIORITE.map((p) => ({
        libelle: LIBELLES_PRIORITE[p],
        largeur: 25,
      })),
      [
        ORDRE_PRIORITE.map((p) =>
          String(props.ecarts.filter((e) => e.priorite === p).length)
        ),
      ]
    ),
    new Paragraph({ spacing: { after: 120 }, children: [] }),
    ligneInfo("Non-conformités créées", String(props.nbNonConformites)),
    ligneInfo("Taux de confiance moyen", pourcent(props.confianceMoyenne)),
    ligneInfo("Annotations manuelles", String(props.annotations.length))
  );

  // ----- Carte des écarts
  enfants.push(titre1("Carte des écarts"));
  enfants.push(
    props.carte
      ? image(props.carte.data, 620, 440)
      : paragraphe("La carte n'a pas pu être capturée.", { couleur: GRIS })
  );
  enfants.push(
    paragraphe(`Légende : ${props.legende.map((l) => l.libelle).join(" · ")}`, {
      couleur: GRIS,
      taille: 17,
    })
  );

  // ----- Liste détaillée
  enfants.push(titre1(`Liste détaillée des écarts (${props.ecarts.length})`));
  enfants.push(
    props.ecarts.length === 0
      ? paragraphe("Aucun écart détecté.", { couleur: GRIS })
      : tableau(
          [
            { libelle: "N°", largeur: 5 },
            { libelle: "Type", largeur: 10 },
            { libelle: "Confiance", largeur: 8 },
            { libelle: "Surface", largeur: 8 },
            { libelle: "Position", largeur: 10 },
            { libelle: "Priorité", largeur: 10 },
            { libelle: "Recommandation", largeur: 41 },
            { libelle: "NC", largeur: 8 },
          ],
          lignesEcarts(props.ecarts)
        )
  );

  // ----- Annexes
  enfants.push(
    titre1("Annexes"),
    titre2(
      `A. Plan d'enquête publique (PE) — ${props.planPE.nom} ${version(
        props.planPE
      )}, page ${props.planPE.page}`
    ),
    props.miniaturePE
      ? image(props.miniaturePE.data, 560, 400)
      : paragraphe("Miniature indisponible.", { couleur: GRIS }),
    titre2(
      `B. Plan d'exécution (EXE) — ${props.planEXE.nom} ${version(
        props.planEXE
      )}, page ${props.planEXE.page}`
    ),
    props.miniatureEXE
      ? image(props.miniatureEXE.data, 560, 400)
      : paragraphe("Miniature indisponible.", { couleur: GRIS }),
    titre2(`C. Annotations manuelles (${props.annotations.length})`)
  );

  enfants.push(
    props.annotations.length === 0
      ? paragraphe("Aucune annotation manuelle sur cette comparaison.", {
          couleur: GRIS,
        })
      : tableau(
          [
            { libelle: "N°", largeur: 8 },
            { libelle: "Type", largeur: 16 },
            { libelle: "Gravité", largeur: 18 },
            { libelle: "Commentaire", largeur: 42 },
            { libelle: "NC", largeur: 16 },
          ],
          lignesAnnotations(props.annotations)
        )
  );

  enfants.push(
    titre2(
      `D. Historique des comparaisons de ce chantier (${props.historique.length})`
    )
  );
  enfants.push(
    props.historique.length === 0
      ? paragraphe("Aucune autre comparaison enregistrée.", { couleur: GRIS })
      : tableau(
          [
            { libelle: "Date", largeur: 20 },
            { libelle: "Plan PE", largeur: 32 },
            { libelle: "Plan EXE", largeur: 32 },
            { libelle: "Annotations", largeur: 16 },
          ],
          lignesHistorique(props.historique)
        )
  );

  enfants.push(
    new Paragraph({ spacing: { before: 320 }, children: [] }),
    ligneInfo("Date de génération", props.dateGeneration),
    ligneInfo("Signé par", props.signePar)
  );
  if (props.entrepriseNom) {
    enfants.push(paragraphe(props.entrepriseNom, { couleur: GRIS }));
  }

  enfants.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 400 },
      children: [
        new TextRun({
          text: `© 2026 BTP-UP — ${
            props.entrepriseNom || "Securionis Chantiers"
          }`,
          size: 16,
          color: ORANGE,
        }),
      ],
    })
  );

  const document = new Document({ sections: [{ children: enfants }] });
  return Buffer.from(await Packer.toBuffer(document));
}
