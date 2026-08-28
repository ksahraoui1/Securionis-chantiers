import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import {
  HEX_PRIORITE,
  LIBELLES_PRIORITE,
  ORDRE_PRIORITE,
  type PrioriteSST,
} from "@/lib/utils/priorite-sst";

const NAVY = "#002855";
const ORANGE = "#E67E22";
const GRIS = "#6b7280";

export interface EcartRapport {
  numero: number;
  type: string;
  hex: string;
  confiance: number;
  aireRelative: number;
  x: number;
  y: number;
  priorite: PrioriteSST;
  recommandation: string;
  nc: number | null;
}

export interface AnnotationRapportAuto {
  numero: number;
  type: string;
  couleur: string;
  hex: string;
  commentaire: string | null;
  numeroNC: number | null;
}

export interface ComparaisonHistorique {
  date: string;
  planPE: string;
  planEXE: string;
  annotations: number;
}

export interface ImagePdf {
  data: Buffer;
  format: "png";
}

export interface RapportComparaisonAutoProps {
  chantierNom: string;
  chantierAdresse: string | null;
  planPE: { nom: string; version: number | null; date: string; page: number };
  planEXE: { nom: string; version: number | null; date: string; page: number };
  dateJour: string;
  dateGeneration: string;
  signePar: string;
  entrepriseNom: string | null;
  logo: ImagePdf | null;
  carte: ImagePdf | null;
  miniaturePE: ImagePdf | null;
  miniatureEXE: ImagePdf | null;
  ecarts: EcartRapport[];
  annotations: AnnotationRapportAuto[];
  historique: ComparaisonHistorique[];
  confianceMoyenne: number;
  nbNonConformites: number;
  legende: { libelle: string; hex: string }[];
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9.5,
    paddingTop: 38,
    paddingBottom: 48,
    paddingHorizontal: 38,
    color: "#1a1a1a",
  },
  pagePaysage: {
    fontFamily: "Helvetica",
    fontSize: 8.5,
    paddingVertical: 24,
    paddingHorizontal: 26,
    color: "#1a1a1a",
  },

  bandeau: { borderTopWidth: 4, borderTopColor: NAVY, marginBottom: 34 },
  logo: { height: 40, maxWidth: 150, objectFit: "contain", marginBottom: 22 },
  marque: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    marginBottom: 22,
  },
  surtitre: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: GRIS,
    letterSpacing: 2,
    marginBottom: 8,
  },
  titre: {
    fontSize: 23,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    marginBottom: 6,
  },
  sousTitre: { fontSize: 11, color: GRIS, marginBottom: 34 },

  ligneInfo: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e7eb",
    paddingVertical: 6,
  },
  cleInfo: { width: "34%", color: GRIS },
  valeurInfo: { width: "66%", fontFamily: "Helvetica-Bold", color: "#111827" },

  titreSection: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    marginBottom: 10,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
  },
  titreSousSection: {
    fontSize: 10.5,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    marginTop: 14,
    marginBottom: 6,
  },

  // Résumé exécutif
  cartesResume: { flexDirection: "row", gap: 8, marginBottom: 14 },
  carteResume: {
    flex: 1,
    borderLeftWidth: 3,
    paddingLeft: 8,
    paddingVertical: 6,
    backgroundColor: "#f9fafb",
  },
  nombreResume: { fontSize: 19, fontFamily: "Helvetica-Bold" },
  etiquetteResume: { fontSize: 8, color: GRIS, marginTop: 1 },

  encadre: {
    padding: 9,
    backgroundColor: "#f3f4f6",
    borderLeftWidth: 3,
    borderLeftColor: NAVY,
    marginBottom: 12,
  },
  avertissement: {
    padding: 9,
    backgroundColor: "#fff7ed",
    borderLeftWidth: 3,
    borderLeftColor: ORANGE,
    marginTop: 12,
  },
  texteAvertissement: { fontSize: 8.5, color: "#7c2d12", lineHeight: 1.5 },

  // Carte des écarts
  cadreCarte: {
    height: 452,
    borderWidth: 0.5,
    borderColor: "#d1d5db",
    padding: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  imagePleine: { width: "100%", height: "100%", objectFit: "contain" },
  legende: {
    flexDirection: "row",
    gap: 14,
    marginTop: 8,
    alignItems: "center",
  },
  pastilleLegende: { width: 8, height: 8, marginRight: 4 },

  // Tableaux
  enTeteTableau: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    borderBottomWidth: 1,
    borderBottomColor: "#9ca3af",
    paddingVertical: 4,
  },
  ligneTableau: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e7eb",
    paddingVertical: 4,
  },
  cellEnTete: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: "#374151",
    paddingHorizontal: 3,
  },
  cell: { fontSize: 7.5, paddingHorizontal: 3 },
  pastille: { width: 6, height: 6, borderRadius: 3, marginRight: 3 },
  ligneCouleur: { flexDirection: "row", alignItems: "center" },

  vide: { fontSize: 9.5, color: GRIS, fontStyle: "italic" },

  miniature: {
    width: "100%",
    height: 250,
    objectFit: "contain",
    borderWidth: 0.5,
    borderColor: "#d1d5db",
  },

  signature: {
    marginTop: 22,
    paddingTop: 9,
    borderTopWidth: 0.5,
    borderTopColor: "#d1d5db",
  },
  ligneSignature: { fontSize: 9.5, marginBottom: 3 },

  pied: {
    position: "absolute",
    bottom: 22,
    left: 38,
    right: 38,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: "#9ca3af",
  },
});

// Largeurs du tableau détaillé, en paysage
const COL = {
  num: "5%",
  type: "10%",
  confiance: "8%",
  surface: "8%",
  position: "10%",
  priorite: "10%",
  recommandation: "41%",
  nc: "8%",
};

function versionPlan(plan: { version: number | null }): string {
  return plan.version ? `V${plan.version}` : "sans version";
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

function Pied({ entrepriseNom }: { entrepriseNom: string | null }) {
  return (
    <View style={styles.pied} fixed>
      <Text>{entrepriseNom || "Securionis Chantiers"}</Text>
      <Text
        render={({ pageNumber, totalPages }) =>
          `Page ${pageNumber} / ${totalPages}`
        }
      />
    </View>
  );
}

export function RapportComparaisonAuto(props: RapportComparaisonAutoProps) {
  const {
    chantierNom,
    chantierAdresse,
    planPE,
    planEXE,
    dateJour,
    dateGeneration,
    signePar,
    entrepriseNom,
    logo,
    carte,
    miniaturePE,
    miniatureEXE,
    ecarts,
    annotations,
    historique,
    confianceMoyenne,
    nbNonConformites,
    legende,
  } = props;

  const comparaison =
    `PE ${versionPlan(planPE)} (${planPE.date}) ` +
    `vs EXE ${versionPlan(planEXE)} (${planEXE.date})`;

  const parPriorite = ORDRE_PRIORITE.map((priorite) => ({
    priorite,
    nombre: ecarts.filter((ecart) => ecart.priorite === priorite).length,
  }));

  return (
    <Document
      title={`Rapport de comparaison automatique — ${chantierNom}`}
      author={signePar}
    >
      {/* ===== Page de garde ===== */}
      <Page size="A4" style={styles.page}>
        <View style={styles.bandeau} />

        {logo ? (
          <Image src={logo} style={styles.logo} />
        ) : (
          <Text style={styles.marque}>Securionis Chantiers</Text>
        )}

        <Text style={styles.surtitre}>SÉCURITÉ ET SANTÉ AU TRAVAIL</Text>
        <Text style={styles.titre}>
          Rapport de comparaison automatique de plans
        </Text>
        <Text style={styles.sousTitre}>
          Détection assistée par ordinateur des écarts entre plans
        </Text>

        <View style={styles.ligneInfo}>
          <Text style={styles.cleInfo}>Date du rapport</Text>
          <Text style={styles.valeurInfo}>{dateJour}</Text>
        </View>
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
          <Text style={styles.cleInfo}>Plans comparés</Text>
          <Text style={styles.valeurInfo}>{comparaison}</Text>
        </View>
        <View style={styles.ligneInfo}>
          <Text style={styles.cleInfo}>Chargé de sécurité</Text>
          <Text style={styles.valeurInfo}>{signePar}</Text>
        </View>
        {entrepriseNom && (
          <View style={styles.ligneInfo}>
            <Text style={styles.cleInfo}>Entreprise</Text>
            <Text style={styles.valeurInfo}>{entrepriseNom}</Text>
          </View>
        )}

        <View style={styles.avertissement}>
          <Text style={styles.texteAvertissement}>
            Les écarts de ce rapport sont relevés par comparaison d&apos;images.
            Le procédé mesure des différences de tracé entre deux plans ; il
            n&apos;interprète ni leur contenu ni leur portée. Les priorités et
            les recommandations ci-après sont établies par une règle
            déterministe fondée sur la confiance de détection, la surface
            concernée et le sens de l&apos;écart. Elles servent à ordonner les
            vérifications et ne se substituent pas à l&apos;appréciation du
            chargé de sécurité.
          </Text>
        </View>

        <Pied entrepriseNom={entrepriseNom} />
      </Page>

      {/* ===== Résumé exécutif ===== */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.titreSection}>Résumé exécutif</Text>

        <View style={styles.encadre}>
          <Text style={{ fontSize: 17, fontFamily: "Helvetica-Bold", color: NAVY }}>
            {ecarts.length} différence{ecarts.length > 1 ? "s" : ""} détectée
            {ecarts.length > 1 ? "s" : ""}
          </Text>
          <Text style={{ fontSize: 8.5, color: GRIS, marginTop: 2 }}>
            {comparaison} — page {planPE.page} du plan PE, page {planEXE.page}{" "}
            du plan EXE
          </Text>
        </View>

        <Text style={styles.titreSousSection}>Répartition par priorité</Text>
        <View style={styles.cartesResume}>
          {parPriorite.map(({ priorite, nombre }) => (
            <View
              key={priorite}
              style={[
                styles.carteResume,
                { borderLeftColor: HEX_PRIORITE[priorite] },
              ]}
            >
              <Text
                style={[
                  styles.nombreResume,
                  { color: HEX_PRIORITE[priorite] },
                ]}
              >
                {nombre}
              </Text>
              <Text style={styles.etiquetteResume}>
                {LIBELLES_PRIORITE[priorite]}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.ligneInfo}>
          <Text style={styles.cleInfo}>Non-conformités créées</Text>
          <Text style={styles.valeurInfo}>{nbNonConformites}</Text>
        </View>
        <View style={styles.ligneInfo}>
          <Text style={styles.cleInfo}>Taux de confiance moyen</Text>
          <Text style={styles.valeurInfo}>{pourcent(confianceMoyenne)}</Text>
        </View>
        <View style={styles.ligneInfo}>
          <Text style={styles.cleInfo}>Annotations manuelles</Text>
          <Text style={styles.valeurInfo}>{annotations.length}</Text>
        </View>

        <Text style={styles.titreSousSection}>Lecture des priorités</Text>
        <Text style={{ fontSize: 8.5, color: GRIS, lineHeight: 1.5 }}>
          La priorité combine trois éléments : la confiance de détection, qui
          domine ; la surface concernée ; et le sens de l&apos;écart. Un élément
          présent au plan d&apos;enquête et absent à l&apos;exécution gagne un
          cran — c&apos;est le cas qui appelle une vérification, une disposition
          ayant pu disparaître.
        </Text>

        <Pied entrepriseNom={entrepriseNom} />
      </Page>

      {/* ===== Carte des écarts ===== */}
      <Page size="A4" orientation="landscape" style={styles.pagePaysage}>
        <Text style={styles.titreSection}>Carte des écarts — {chantierNom}</Text>
        {carte ? (
          <View style={styles.cadreCarte}>
            <Image src={carte} style={styles.imagePleine} />
          </View>
        ) : (
          <Text style={styles.vide}>
            La carte n&apos;a pas pu être capturée. Le rapport reste valable pour
            la liste des écarts.
          </Text>
        )}
        <View style={styles.legende}>
          {legende.map((entree) => (
            <View key={entree.libelle} style={styles.ligneCouleur}>
              <View
                style={[styles.pastilleLegende, { backgroundColor: entree.hex }]}
              />
              <Text style={{ fontSize: 8 }}>{entree.libelle}</Text>
            </View>
          ))}
          <Text style={{ fontSize: 7.5, color: GRIS, marginLeft: "auto" }}>
            Superposition des deux plans au moment de la génération.
          </Text>
        </View>
        <Pied entrepriseNom={entrepriseNom} />
      </Page>

      {/* ===== Liste détaillée ===== */}
      <Page size="A4" orientation="landscape" style={styles.pagePaysage}>
        <Text style={styles.titreSection}>
          Liste détaillée des écarts ({ecarts.length})
        </Text>

        {ecarts.length === 0 ? (
          <Text style={styles.vide}>Aucun écart détecté.</Text>
        ) : (
          <View>
            <View style={styles.enTeteTableau} fixed>
              <Text style={[styles.cellEnTete, { width: COL.num }]}>N°</Text>
              <Text style={[styles.cellEnTete, { width: COL.type }]}>Type</Text>
              <Text style={[styles.cellEnTete, { width: COL.confiance }]}>
                Confiance
              </Text>
              <Text style={[styles.cellEnTete, { width: COL.surface }]}>
                Surface
              </Text>
              <Text style={[styles.cellEnTete, { width: COL.position }]}>
                Position
              </Text>
              <Text style={[styles.cellEnTete, { width: COL.priorite }]}>
                Priorité
              </Text>
              <Text style={[styles.cellEnTete, { width: COL.recommandation }]}>
                Recommandation
              </Text>
              <Text style={[styles.cellEnTete, { width: COL.nc }]}>NC</Text>
            </View>

            {ecarts.map((ecart) => (
              <View key={ecart.numero} style={styles.ligneTableau} wrap={false}>
                <Text style={[styles.cell, { width: COL.num }]}>
                  {ecart.numero}
                </Text>
                <View style={[styles.ligneCouleur, { width: COL.type }]}>
                  <View
                    style={[styles.pastille, { backgroundColor: ecart.hex }]}
                  />
                  <Text style={styles.cell}>{ecart.type}</Text>
                </View>
                <Text style={[styles.cell, { width: COL.confiance }]}>
                  {pourcent(ecart.confiance)}
                </Text>
                <Text style={[styles.cell, { width: COL.surface }]}>
                  {surface(ecart.aireRelative)}
                </Text>
                <Text style={[styles.cell, { width: COL.position }]}>
                  {Math.round(ecart.x)} ; {Math.round(ecart.y)}
                </Text>
                <View style={[styles.ligneCouleur, { width: COL.priorite }]}>
                  <View
                    style={[
                      styles.pastille,
                      { backgroundColor: HEX_PRIORITE[ecart.priorite] },
                    ]}
                  />
                  <Text style={styles.cell}>
                    {LIBELLES_PRIORITE[ecart.priorite]}
                  </Text>
                </View>
                <Text style={[styles.cell, { width: COL.recommandation }]}>
                  {ecart.recommandation}
                </Text>
                <Text style={[styles.cell, { width: COL.nc }]}>
                  {ecart.nc ? `Oui — #${ecart.nc}` : "Non"}
                </Text>
              </View>
            ))}
          </View>
        )}

        <Pied entrepriseNom={entrepriseNom} />
      </Page>

      {/* ===== Annexes ===== */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.titreSection}>Annexes</Text>

        <Text style={styles.titreSousSection}>
          A. Plan d&apos;enquête publique (PE) — {planPE.nom}{" "}
          {versionPlan(planPE)}, page {planPE.page}
        </Text>
        {miniaturePE ? (
          <Image src={miniaturePE} style={styles.miniature} />
        ) : (
          <Text style={styles.vide}>Miniature indisponible.</Text>
        )}

        <Text style={styles.titreSousSection}>
          B. Plan d&apos;exécution (EXE) — {planEXE.nom} {versionPlan(planEXE)},
          page {planEXE.page}
        </Text>
        {miniatureEXE ? (
          <Image src={miniatureEXE} style={styles.miniature} />
        ) : (
          <Text style={styles.vide}>Miniature indisponible.</Text>
        )}

        <Pied entrepriseNom={entrepriseNom} />
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.titreSousSection}>
          C. Annotations manuelles ({annotations.length})
        </Text>
        {annotations.length === 0 ? (
          <Text style={styles.vide}>
            Aucune annotation manuelle sur cette comparaison.
          </Text>
        ) : (
          <View>
            <View style={styles.enTeteTableau}>
              <Text style={[styles.cellEnTete, { width: "8%" }]}>N°</Text>
              <Text style={[styles.cellEnTete, { width: "16%" }]}>Type</Text>
              <Text style={[styles.cellEnTete, { width: "18%" }]}>Gravité</Text>
              <Text style={[styles.cellEnTete, { width: "42%" }]}>
                Commentaire
              </Text>
              <Text style={[styles.cellEnTete, { width: "16%" }]}>NC</Text>
            </View>
            {annotations.map((annotation) => (
              <View
                key={annotation.numero}
                style={styles.ligneTableau}
                wrap={false}
              >
                <Text style={[styles.cell, { width: "8%" }]}>
                  {annotation.numero}
                </Text>
                <Text style={[styles.cell, { width: "16%" }]}>
                  {annotation.type}
                </Text>
                <View style={[styles.ligneCouleur, { width: "18%" }]}>
                  <View
                    style={[
                      styles.pastille,
                      { backgroundColor: annotation.hex },
                    ]}
                  />
                  <Text style={styles.cell}>{annotation.couleur}</Text>
                </View>
                <Text style={[styles.cell, { width: "42%" }]}>
                  {annotation.commentaire?.trim() || "—"}
                </Text>
                <Text style={[styles.cell, { width: "16%" }]}>
                  {annotation.numeroNC ? `NC #${annotation.numeroNC}` : "—"}
                </Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.titreSousSection}>
          D. Historique des comparaisons de ce chantier ({historique.length})
        </Text>
        {historique.length === 0 ? (
          <Text style={styles.vide}>Aucune autre comparaison enregistrée.</Text>
        ) : (
          <View>
            <View style={styles.enTeteTableau}>
              <Text style={[styles.cellEnTete, { width: "20%" }]}>Date</Text>
              <Text style={[styles.cellEnTete, { width: "32%" }]}>Plan PE</Text>
              <Text style={[styles.cellEnTete, { width: "32%" }]}>Plan EXE</Text>
              <Text style={[styles.cellEnTete, { width: "16%" }]}>
                Annotations
              </Text>
            </View>
            {historique.map((ligne, index) => (
              <View key={index} style={styles.ligneTableau} wrap={false}>
                <Text style={[styles.cell, { width: "20%" }]}>{ligne.date}</Text>
                <Text style={[styles.cell, { width: "32%" }]}>
                  {ligne.planPE}
                </Text>
                <Text style={[styles.cell, { width: "32%" }]}>
                  {ligne.planEXE}
                </Text>
                <Text style={[styles.cell, { width: "16%" }]}>
                  {ligne.annotations}
                </Text>
              </View>
            ))}
          </View>
        )}

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

        <Pied entrepriseNom={entrepriseNom} />
      </Page>
    </Document>
  );
}
