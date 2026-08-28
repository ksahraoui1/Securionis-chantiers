import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";

const NAVY = "#002855";
const VERT_PE = "#2E7D32";
const ORANGE_EXE = "#E67E22";
const GRIS = "#6b7280";

export interface AnnotationRapport {
  numero: number;
  type: string;
  couleur: string;
  hex: string;
  commentaire: string | null;
  numeroNC: number | null;
}

export interface PlanRapport {
  nom: string;
  version: number | null;
  date: string;
  page: number;
}

export interface RapportComparaisonProps {
  chantierNom: string;
  chantierAdresse: string | null;
  planPE: PlanRapport;
  planEXE: PlanRapport;
  image: { data: Buffer; format: "png" } | null;
  annotations: AnnotationRapport[];
  dateJour: string;
  dateGeneration: string;
  signePar: string;
  entrepriseNom: string | null;
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    paddingTop: 40,
    paddingBottom: 50,
    paddingHorizontal: 40,
    color: "#1a1a1a",
  },
  pagePaysage: {
    fontFamily: "Helvetica",
    fontSize: 9,
    paddingVertical: 24,
    paddingHorizontal: 28,
    color: "#1a1a1a",
  },

  // Page de garde
  bandeau: {
    borderTopWidth: 4,
    borderTopColor: NAVY,
    marginBottom: 60,
  },
  surtitre: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: GRIS,
    letterSpacing: 2,
    marginBottom: 8,
  },
  titre: {
    fontSize: 26,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    marginBottom: 6,
  },
  sousTitre: {
    fontSize: 12,
    color: GRIS,
    marginBottom: 40,
  },

  ligneInfo: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e7eb",
    paddingVertical: 7,
  },
  cleInfo: {
    width: "32%",
    color: GRIS,
  },
  valeurInfo: {
    width: "68%",
    fontFamily: "Helvetica-Bold",
    color: "#111827",
  },

  cartePlan: {
    borderLeftWidth: 3,
    paddingLeft: 10,
    paddingVertical: 6,
    marginBottom: 10,
  },
  etiquettePlan: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    marginBottom: 3,
  },
  nomPlan: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
  },
  detailPlan: {
    fontSize: 9,
    color: GRIS,
    marginTop: 2,
  },

  // Titres de section
  titreSection: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    marginBottom: 10,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
  },

  // Page image. La hauteur est fixée en points : une image ne peut pas se
  // couper entre deux pages, et react-pdf ne sait pas résoudre `flexGrow`
  // avant de la mettre en page (« bigger than available page height »).
  // A4 paysage = 595,28 pt de haut, moins les marges, le titre et la légende.
  imageCadre: {
    height: 470,
    borderWidth: 0.5,
    borderColor: "#d1d5db",
    padding: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
  },

  // Tableau des annotations
  enTeteTableau: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    borderBottomWidth: 1,
    borderBottomColor: "#9ca3af",
    paddingVertical: 5,
  },
  ligneTableau: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e7eb",
    paddingVertical: 6,
  },
  cellEnTete: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: "#374151",
    paddingHorizontal: 4,
  },
  cell: {
    fontSize: 9,
    paddingHorizontal: 4,
  },
  colNum: { width: "8%" },
  colType: { width: "16%" },
  colCouleur: { width: "18%" },
  colCommentaire: { width: "40%" },
  colNC: { width: "18%" },

  pastille: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 4,
  },
  ligneCouleur: {
    flexDirection: "row",
    alignItems: "center",
  },

  total: {
    marginTop: 16,
    padding: 10,
    backgroundColor: "#f3f4f6",
    borderLeftWidth: 3,
    borderLeftColor: NAVY,
  },
  totalTexte: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    color: NAVY,
  },

  signature: {
    marginTop: 28,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: "#d1d5db",
  },
  ligneSignature: {
    fontSize: 10,
    marginBottom: 3,
  },

  vide: {
    fontSize: 10,
    color: GRIS,
    fontStyle: "italic",
  },

  pied: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#9ca3af",
  },
});

function nomPlanComplet(plan: PlanRapport): string {
  return plan.version ? `${plan.nom} — V${plan.version}` : plan.nom;
}

function resumePlan(plan: PlanRapport, type: "PE" | "EXE"): string {
  const version = plan.version ? `V${plan.version}` : "sans version";
  return `${type} ${version} (${plan.date})`;
}

function LignePlan({
  type,
  plan,
  couleur,
  libelle,
}: {
  type: "PE" | "EXE";
  plan: PlanRapport;
  couleur: string;
  libelle: string;
}) {
  return (
    <View style={[styles.cartePlan, { borderLeftColor: couleur }]}>
      <Text style={[styles.etiquettePlan, { color: couleur }]}>
        {libelle} ({type})
      </Text>
      <Text style={styles.nomPlan}>{nomPlanComplet(plan)}</Text>
      <Text style={styles.detailPlan}>
        Page {plan.page} — mis à jour le {plan.date}
      </Text>
    </View>
  );
}

export function RapportComparaison({
  chantierNom,
  chantierAdresse,
  planPE,
  planEXE,
  image,
  annotations,
  dateJour,
  dateGeneration,
  signePar,
  entrepriseNom,
}: RapportComparaisonProps) {
  const comparaison = `${resumePlan(planPE, "PE")} vs ${resumePlan(planEXE, "EXE")}`;

  return (
    <Document
      title={`Rapport de comparaison de plans — ${chantierNom}`}
      author={signePar}
    >
      {/* ===== Page de garde ===== */}
      <Page size="A4" style={styles.page}>
        <View style={styles.bandeau} />

        <Text style={styles.surtitre}>SÉCURITÉ ET SANTÉ AU TRAVAIL</Text>
        <Text style={styles.titre}>Rapport de comparaison de plans</Text>
        <Text style={styles.sousTitre}>
          Plan d&apos;enquête publique (PE) et plan d&apos;exécution (EXE)
        </Text>

        <View style={styles.ligneInfo}>
          <Text style={styles.cleInfo}>Chantier</Text>
          <Text style={styles.valeurInfo}>{chantierNom}</Text>
        </View>
        {chantierAdresse && chantierAdresse !== chantierNom && (
          <View style={styles.ligneInfo}>
            <Text style={styles.cleInfo}>Adresse</Text>
            <Text style={styles.valeurInfo}>{chantierAdresse}</Text>
          </View>
        )}
        <View style={styles.ligneInfo}>
          <Text style={styles.cleInfo}>Date</Text>
          <Text style={styles.valeurInfo}>{dateJour}</Text>
        </View>
        <View style={styles.ligneInfo}>
          <Text style={styles.cleInfo}>Plans comparés</Text>
          <Text style={styles.valeurInfo}>{comparaison}</Text>
        </View>
        <View style={styles.ligneInfo}>
          <Text style={styles.cleInfo}>Différences annotées</Text>
          <Text style={styles.valeurInfo}>{annotations.length}</Text>
        </View>

        <View style={{ marginTop: 30 }}>
          <LignePlan
            type="PE"
            plan={planPE}
            couleur={VERT_PE}
            libelle="Plan d'enquête publique"
          />
          <LignePlan
            type="EXE"
            plan={planEXE}
            couleur={ORANGE_EXE}
            libelle="Plan d'exécution"
          />
        </View>

        <View style={styles.pied} fixed>
          <Text>{entrepriseNom || "Securionis Chantiers"}</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>

      {/* ===== Vue de la comparaison, en paysage : les plans sont larges ===== */}
      <Page size="A4" orientation="landscape" style={styles.pagePaysage}>
        <Text style={styles.titreSection}>
          Vue de la comparaison — {chantierNom}
        </Text>
        {image ? (
          <View style={styles.imageCadre}>
            <Image src={image} style={styles.image} />
          </View>
        ) : (
          <Text style={styles.vide}>
            La vue n&apos;a pas pu être capturée. Le rapport reste valable pour
            la liste des annotations.
          </Text>
        )}
        <Text style={{ fontSize: 8, color: GRIS, marginTop: 6 }}>
          {comparaison} — capture de la vue au moment de la génération
          (opacités, recalage et page affichés).
        </Text>
      </Page>

      {/* ===== Annotations ===== */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.titreSection}>
          Différences annotées ({annotations.length})
        </Text>

        {annotations.length === 0 ? (
          <Text style={styles.vide}>
            Aucune annotation n&apos;a été posée sur cette comparaison.
          </Text>
        ) : (
          <View>
            <View style={styles.enTeteTableau} fixed>
              <Text style={[styles.cellEnTete, styles.colNum]}>N°</Text>
              <Text style={[styles.cellEnTete, styles.colType]}>Type</Text>
              <Text style={[styles.cellEnTete, styles.colCouleur]}>Couleur</Text>
              <Text style={[styles.cellEnTete, styles.colCommentaire]}>
                Commentaire
              </Text>
              <Text style={[styles.cellEnTete, styles.colNC]}>Liée à une NC</Text>
            </View>

            {annotations.map((annotation) => (
              <View
                key={annotation.numero}
                style={styles.ligneTableau}
                wrap={false}
              >
                <Text style={[styles.cell, styles.colNum]}>
                  {annotation.numero}
                </Text>
                <Text style={[styles.cell, styles.colType]}>
                  {annotation.type}
                </Text>
                <View style={[styles.colCouleur, styles.ligneCouleur]}>
                  <View
                    style={[styles.pastille, { backgroundColor: annotation.hex }]}
                  />
                  <Text style={styles.cell}>{annotation.couleur}</Text>
                </View>
                <Text style={[styles.cell, styles.colCommentaire]}>
                  {annotation.commentaire?.trim() || "—"}
                </Text>
                <Text style={[styles.cell, styles.colNC]}>
                  {annotation.numeroNC ? `Oui — NC #${annotation.numeroNC}` : "Non"}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.total}>
          <Text style={styles.totalTexte}>
            Total des différences annotées : {annotations.length}
          </Text>
        </View>

        <View style={styles.signature}>
          <Text style={styles.ligneSignature}>
            Date de génération : {dateGeneration}
          </Text>
          <Text style={styles.ligneSignature}>Signé par : {signePar}</Text>
          {entrepriseNom && (
            <Text style={[styles.ligneSignature, { color: GRIS }]}>
              {entrepriseNom}
            </Text>
          )}
        </View>

        <View style={styles.pied} fixed>
          <Text>{entrepriseNom || "Securionis Chantiers"}</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
