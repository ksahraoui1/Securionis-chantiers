import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import type { Tables } from "@/types/database";
import { LABELS_STATUT_ECART, stripMarkdown } from "@/lib/utils/constants";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    paddingTop: 40,
    paddingBottom: 60,
    paddingHorizontal: 40,
    color: "#1a1a1a",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  logoImage: {
    height: 60,
    maxWidth: 210,
    objectFit: "contain",
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: "#1e40af",
    flex: 1,
    textAlign: "center",
  },
  headerTitleAlone: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: "#1e40af",
    textAlign: "center",
    marginBottom: 20,
  },
  logoPlaceholder: {
    width: 210,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    marginTop: 16,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
    color: "#111827",
  },
  table: {
    marginBottom: 12,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e7eb",
    minHeight: 22,
    alignItems: "center",
  },
  tableRowHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#9ca3af",
    minHeight: 24,
    alignItems: "center",
    backgroundColor: "#f3f4f6",
  },
  tableCellLabel: {
    width: "35%",
    paddingVertical: 4,
    paddingHorizontal: 6,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: "#6b7280",
  },
  tableCellValue: {
    width: "65%",
    paddingVertical: 4,
    paddingHorizontal: 6,
    fontSize: 10,
  },
  constatation: {
    marginBottom: 10,
    padding: 8,
    backgroundColor: "#fef2f2",
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: "#dc2626",
  },
  constatationCorrigee: {
    marginBottom: 10,
    padding: 8,
    backgroundColor: "#f0fdf4",
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: "#16a34a",
  },
  badgeCorrige: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
    backgroundColor: "#16a34a",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  constatationTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    marginBottom: 4,
  },
  constatationText: {
    fontSize: 9,
    color: "#374151",
    marginBottom: 2,
  },
  photosRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  photoImage: {
    width: 120,
    height: 90,
    objectFit: "cover",
    borderRadius: 3,
    border: "0.5px solid #d1d5db",
  },
  ecartRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e7eb",
    minHeight: 20,
    alignItems: "center",
  },
  ecartCell: {
    paddingVertical: 3,
    paddingHorizontal: 6,
    fontSize: 9,
  },
  ecartCellDesc: {
    width: "45%",
  },
  ecartCellDelai: {
    width: "25%",
  },
  ecartCellStatut: {
    width: "30%",
  },
  delaiItem: {
    fontSize: 9,
    marginBottom: 3,
    paddingLeft: 8,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
  },
  footerLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.5,
    borderTopColor: "#d1d5db",
    paddingTop: 6,
  },
  footerText: {
    fontSize: 8,
    color: "#9ca3af",
  },
  footerAddress: {
    fontSize: 7,
    color: "#9ca3af",
    marginTop: 3,
    textAlign: "center",
  },
  pageNumber: {
    fontSize: 8,
    color: "#9ca3af",
  },
  copieItem: {
    fontSize: 9,
    marginBottom: 2,
    paddingLeft: 8,
  },
});

// Affiche une remarque en texte brut dans le PDF (sans markdown)
function RemarqueText({ text }: { text: string }) {
  const cleaned = stripMarkdown(text);
  const lines = cleaned.split("\n").filter((l) => l.trim() !== "");

  return (
    <View style={{ marginTop: 2 }}>
      {lines.map((line, i) => {
        const trimmed = line.trim();

        // Puce : - texte
        if (/^[-•]\s/.test(trimmed)) {
          const content = trimmed.replace(/^[-•]\s+/, "");
          return (
            <View key={i} style={{ flexDirection: "row", paddingLeft: 8, marginBottom: 1 }}>
              <Text style={{ fontSize: 9, color: "#374151", marginRight: 4 }}>-</Text>
              <Text style={{ fontSize: 9, color: "#374151", flex: 1 }}>{content}</Text>
            </View>
          );
        }

        // Ligne numérotée : 1. texte
        if (/^\d+\.\s/.test(trimmed)) {
          return (
            <Text key={i} style={{ fontSize: 9, color: "#374151", marginBottom: 1, paddingLeft: 8 }}>
              {trimmed}
            </Text>
          );
        }

        return (
          <Text key={i} style={{ fontSize: 9, color: "#374151", marginBottom: 1 }}>
            {trimmed}
          </Text>
        );
      })}
    </View>
  );
}

interface RapportVisiteProps {
  chantier: Tables<"chantiers">;
  visite: Tables<"visites">;
  inspecteur: { nom: string; email: string };
  reponses: (Tables<"reponses"> & {
    points_controle?: { intitule: string; critere: string | null; objet: string | null } | null;
  })[];
  ecarts: Tables<"ecarts">[];
  destinataires: Tables<"destinataires">[];
  entrepriseNom?: string | null;
  entrepriseLogoUrl?: string | null;
  entrepriseAdresse?: string | null;
  entrepriseTelephone?: string | null;
  entrepriseEmail?: string | null;
}

export function RapportVisite({
  chantier,
  visite,
  inspecteur,
  reponses,
  ecarts,
  destinataires,
  entrepriseNom,
  entrepriseLogoUrl,
  entrepriseAdresse,
  entrepriseTelephone,
  entrepriseEmail,
}: RapportVisiteProps) {
  const dateFormatted = new Date(visite.date_visite).toLocaleDateString(
    "fr-CH",
    { day: "numeric", month: "long", year: "numeric" }
  );

  const nonConformeReponses = reponses.filter(
    (r) => r.valeur === "non_conforme"
  );

  // Map reponse_id → ecart pour afficher délai/statut sous chaque NC
  const ecartByReponseId = new Map(
    ecarts.map((e) => [e.reponse_id, e])
  );

  const heureFormatted = visite.heure_visite
    ? ` – ${visite.heure_visite.slice(0, 5)}`
    : "";

  const infoRows: [string, string][] = [
    ["Inspecteur(s)", inspecteur.nom],
    ["Date de la visite", `${dateFormatted}${heureFormatted}`],
  ];

  // Nom + Adresse du chantier
  if (chantier.nom) {
    infoRows.push(["Nom du chantier", chantier.nom]);
  }
  infoRows.push(["Adresse du chantier", chantier.adresse]);
  infoRows.push(["Nature des travaux", chantier.nature_travaux]);

  // Références sur une ligne (comme le PDF FWN)
  const refs: string[] = [];
  if (chantier.ref_communale) refs.push(`Réf. communale: ${chantier.ref_communale}`);
  if (chantier.numero_camac) refs.push(`N° CAMAC: ${chantier.numero_camac}`);
  if (chantier.numero_parcelle) refs.push(`N° parcelle: ${chantier.numero_parcelle}`);
  if (chantier.numero_eca) refs.push(`N° ECA: ${chantier.numero_eca}`);
  if (refs.length > 0) {
    infoRows.push(["Références", refs.join("  |  ")]);
  }

  if (visite.renseignements_par) {
    infoRows.push(["Renseignements donnés par", visite.renseignements_par]);
  } else if (chantier.contact_nom) {
    infoRows.push(["Renseignements donnés par", chantier.contact_nom]);
  }

  // Collect delais from NC reponses
  const delais = ecarts
    .filter((e) => e.delai)
    .map((e) => ({ description: e.description, delai: e.delai! }));

  const footerLabel = entrepriseNom ?? "Securionis";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        {entrepriseLogoUrl ? (
          <View style={styles.headerRow}>
            <Image src={entrepriseLogoUrl} style={styles.logoImage} />
            <Text style={styles.headerTitle}>Rapport de visite</Text>
            {/* Spacer to keep title centered */}
            <View style={styles.logoPlaceholder} />
          </View>
        ) : (
          <Text style={styles.headerTitleAlone}>Rapport de visite</Text>
        )}

        {/* Info table */}
        <View style={styles.table}>
          {infoRows.map(([label, value], idx) => (
            <View key={idx} style={styles.tableRow}>
              <Text style={styles.tableCellLabel}>{label}</Text>
              <Text style={styles.tableCellValue}>{value}</Text>
            </View>
          ))}
        </View>

        {/* Constatations */}
        <Text style={styles.sectionTitle}>Constatations</Text>
        {nonConformeReponses.length === 0 ? (
          <Text style={{ fontSize: 10, color: "#16a34a", marginBottom: 8 }}>
            Aucune non-conformité constatée.
          </Text>
        ) : (
          nonConformeReponses.map((r) => {
            const ecart = ecartByReponseId.get(r.id);
            const isCorrige = ecart?.statut === "corrige";

            return (
              <View key={r.id} style={isCorrige ? styles.constatationCorrigee : styles.constatation}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <Text style={styles.constatationTitle}>
                    {(r.points_controle as { intitule: string } | null)?.intitule ??
                      "Point de contrôle"}
                  </Text>
                  {isCorrige && (
                    <Text style={styles.badgeCorrige}>CORRIGÉ</Text>
                  )}
                </View>
                {r.remarque && (
                  <RemarqueText text={r.remarque} />
                )}
                {r.photos && r.photos.length > 0 && (
                  <View style={styles.photosRow}>
                    {r.photos.map((photoUrl, i) => (
                      <Image key={i} src={photoUrl} style={styles.photoImage} />
                    ))}
                  </View>
                )}
                {ecart && (
                  <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
                    {ecart.delai && (
                      <Text style={{ fontSize: 8, color: isCorrige ? "#166534" : "#b91c1c", fontFamily: "Helvetica-Bold" }}>
                        Délai : {ecart.delai}
                      </Text>
                    )}
                    <Text style={{ fontSize: 8, color: isCorrige ? "#16a34a" : "#6b7280", fontFamily: isCorrige ? "Helvetica-Bold" : "Helvetica" }}>
                      Statut : {LABELS_STATUT_ECART[ecart.statut] ?? ecart.statut}
                    </Text>
                  </View>
                )}
              </View>
            );
          })
        )}

        {/* Copie(s) */}
        {destinataires.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Copie(s)</Text>
            {destinataires.map((dest) => (
              <Text key={dest.id} style={styles.copieItem}>
                - {dest.nom}
                {dest.organisation ? ` (${dest.organisation})` : ""} &mdash;{" "}
                {dest.email}
              </Text>
            ))}
          </>
        )}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <View style={styles.footerLine}>
            {/* Gauche : coordonnées entreprise */}
            <View>
              <Text style={styles.footerText}>{footerLabel}</Text>
              {entrepriseAdresse && (
                <Text style={styles.footerText}>{entrepriseAdresse}</Text>
              )}
              {entrepriseEmail && (
                <Text style={styles.footerText}>{entrepriseEmail}</Text>
              )}
            </View>
            {/* Droite : numéro de page */}
            <Text
              style={styles.pageNumber}
              render={({ pageNumber, totalPages }) =>
                `Page ${pageNumber} / ${totalPages}`
              }
            />
          </View>
        </View>
      </Page>
    </Document>
  );
}
