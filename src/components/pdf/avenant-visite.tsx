import React from "react";
import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { PlanAvenant } from "@/lib/visites/avenant";
export function AvenantVisite({ plan }: { plan: PlanAvenant }) {
  const date = new Date(plan.valide_le).toLocaleString("fr-CH", { timeZone: "Europe/Zurich" });
  return <Document title={`Avenant ${plan.numero} — ${plan.objet}`} author={plan.auteur_nom}>
    <Page size="A4" style={{ fontFamily: "Helvetica", fontSize: 10, padding: 42, paddingBottom: 62, color: "#1f2937" }}>
      <Text style={{ fontSize: 19, fontFamily: "Helvetica-Bold", color: "#1e40af", marginBottom: 15 }}>AVENANT N° {plan.numero}</Text>
      <Text style={{ marginBottom: 5 }}>Rapport de visite du {new Date(`${plan.date_visite}T12:00:00Z`).toLocaleDateString("fr-CH")} — {plan.chantier_adresse}</Text>
      <Text style={{ marginBottom: 16, fontSize: 9 }}>Validé par {plan.auteur_nom} le {date} (heure suisse).</Text>
      <View style={{ padding: 10, backgroundColor: "#eff6ff", marginBottom: 18 }}>
        <Text>Cet avenant complète ou rectifie explicitement le rapport référencé. Les constats d’origine et les avenants précédents restent conservés. Il doit être lu avec le rapport et l’historique des avenants.</Text>
      </View>
      <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 13, marginBottom: 8 }}>{plan.objet}</Text>
      <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 4 }}>Motif</Text>
      <Text style={{ marginBottom: 15, fontSize: 10, lineHeight: 1.4 }}>{plan.motif}</Text>
      <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 5 }}>Complément ou rectification</Text>
      {plan.contenu.split("\n").map((line, i) => <Text key={i} style={{ marginBottom: 4, fontSize: 10, lineHeight: 1.4 }}>{line || " "}</Text>)}
      <View style={{ marginTop: 22, borderTop: "1 solid #d1d5db", paddingTop: 10, fontSize: 7 }} wrap={false}>
        <Text>Visite : {plan.visite_id}</Text><Text>Avenant : {plan.id}</Text>
        <Text>Rapport de référence : {plan.rapport_reference}</Text>
        <Text>Archive des sources : {plan.archive_id}</Text>
        <Text>SHA-256 de l’archive : {plan.archive_sha256}</Text>
        {plan.archive_mode === "reprise_historique" && <Text>Sources issues d’une reprise historique, capturées après la visite.</Text>}
        {plan.precedent_id && <Text>Avenant précédent : {plan.precedent_id}</Text>}
      </View>
      <Text fixed style={{ position: "absolute", bottom: 28, left: 42, right: 42, fontSize: 8, color: "#6b7280" }} render={({ pageNumber, totalPages }) => `Avenant ${plan.numero} — ${pageNumber}/${totalPages}`} />
    </Page>
  </Document>;
}
