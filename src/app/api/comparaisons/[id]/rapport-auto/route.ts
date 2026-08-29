import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { canAccessChantier, getUserRole } from "@/lib/utils/security";
import { escapeHtml, isAllowedSupabaseUrl } from "@/lib/utils/security";
import { getLimits } from "@/lib/stripe/limits";
import { checkRateLimit } from "@/lib/rate-limit";
import { getResendApiKey, getResendFromEmail } from "@/lib/env";
import {
  chargerComparaison,
  lireCapturePng,
} from "@/lib/utils/comparaison-rapport";
import {
  prioriteSST,
  recommandationSST,
  synthetiser,
  type EcartEvalue,
} from "@/lib/utils/priorite-sst";
import type {
  ComparaisonHistorique,
  EcartRapport,
  ImagePdf,
} from "@/components/pdf/rapport-comparaison-auto";
import type { TypeDifference } from "@/lib/plan-diff-detection";
import { journaliser } from "@/lib/audit";
import { signerUrl } from "@/lib/utils/url-signee";

// Le rapport embarque trois images et jusqu'à 300 lignes : la génération PDF
// peut dépasser la minute par défaut sur un petit conteneur.
export const maxDuration = 120;

/** Au-delà, le rapport ne serait de toute façon pas exploitable. */
const NB_ECARTS_MAX = 300;

const LIBELLES_TYPE: Record<TypeDifference, string> = {
  added: "Ajouté",
  removed: "Supprimé",
  modified: "Modifié",
  moved: "Déplacé",
};

const HEX_TYPE: Record<TypeDifference, string> = {
  added: "#2E7D32",
  removed: "#B41E1E",
  modified: "#F59E0B",
  moved: "#002855",
};

interface EcartRecu {
  numero: number;
  type: TypeDifference;
  confiance: number;
  aireRelative: number;
  x: number;
  y: number;
  nc: number | null;
}

/**
 * Valide les écarts transmis par le navigateur.
 *
 * La détection tourne côté client : le serveur ne peut pas la refaire. Les
 * valeurs sont donc bornées et typées ici avant d'entrer dans le rapport —
 * elles ne servent qu'à composer un document, jamais à écrire en base.
 */
function lireEcarts(brut: FormDataEntryValue | null): EcartRecu[] | null {
  if (typeof brut !== "string") return null;

  let donnees: unknown;
  try {
    donnees = JSON.parse(brut);
  } catch {
    return null;
  }
  if (!Array.isArray(donnees)) return null;

  const borne = (valeur: unknown, min: number, max: number): number => {
    const nombre = Number(valeur);
    if (!Number.isFinite(nombre)) return min;
    return Math.min(max, Math.max(min, nombre));
  };

  return donnees.slice(0, NB_ECARTS_MAX).map((ligne, index) => {
    const objet = (ligne ?? {}) as Record<string, unknown>;
    const type = String(objet.type);
    return {
      numero: Math.round(borne(objet.numero, 1, 100_000)) || index + 1,
      type: (type in LIBELLES_TYPE ? type : "modified") as TypeDifference,
      confiance: borne(objet.confiance, 0, 1),
      aireRelative: borne(objet.aireRelative, 0, 1),
      x: borne(objet.x, 0, 100_000),
      y: borne(objet.y, 0, 100_000),
      nc:
        objet.nc === null || objet.nc === undefined
          ? null
          : Math.round(borne(objet.nc, 1, 1_000_000)),
    };
  });
}

/**
 * Télécharge une image du stockage, sous la whitelist SSRF de l'application.
 * L'URL est signée en amont par l'appelant : les buckets sont privés (SEC-03).
 */
async function chargerImageDistante(url: string | null): Promise<ImagePdf | null> {
  if (!url || !isAllowedSupabaseUrl(url)) return null;
  try {
    const reponse = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!reponse.ok) return null;
    const octets = Buffer.from(await reponse.arrayBuffer());
    // Signature PNG : react-pdf et docx n'acceptent ici que ce format.
    const png = [0x89, 0x50, 0x4e, 0x47].every((o, i) => octets[i] === o);
    return png ? { data: octets, format: "png" } : null;
  } catch {
    return null;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: comparaisonId } = await params;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    // Rate limit : 5 rapports complets par heure — chacun écrit un document.
    if (!checkRateLimit(`comparaison-rapport:${user.id}`, 5, 60 * 60 * 1000)) {
      return NextResponse.json(
        { error: "Trop de requêtes. Réessayez plus tard." },
        { status: 429 }
      );
    }

    const role = await getUserRole(supabase, user.id);
    const limites = getLimits(role ?? "invité");
    if (!limites.canGeneratePdf) {
      return NextResponse.json(
        {
          error:
            "La génération de rapports est réservée aux abonnés. Passez à l'offre payante.",
        },
        { status: 403 }
      );
    }

    const donnees = await chargerComparaison(supabase, comparaisonId, user.id);
    if (!donnees) {
      return NextResponse.json(
        { error: "Comparaison introuvable" },
        { status: 404 }
      );
    }
    if (!(await canAccessChantier(supabase, user.id, donnees.chantierId))) {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }

    const formulaire = await request.formData();
    const format = formulaire.get("format") === "docx" ? "docx" : "pdf";
    const envoyerEmail = formulaire.get("envoyerEmail") === "1";

    const carteLue = await lireCapturePng(formulaire.get("carte"));
    if ("erreur" in carteLue) {
      return NextResponse.json({ error: carteLue.erreur }, { status: 400 });
    }

    const ecartsRecus = lireEcarts(formulaire.get("ecarts"));
    if (!ecartsRecus) {
      return NextResponse.json(
        { error: "Liste des écarts illisible." },
        { status: 400 }
      );
    }

    const miniaturePE = await lireCapturePng(formulaire.get("miniaturePE"));
    const miniatureEXE = await lireCapturePng(formulaire.get("miniatureEXE"));

    // --- Données complémentaires, toutes lues en base (donc autoritatives)
    const [{ data: chantier }, { data: entreprise }, { data: sessions }] =
      await Promise.all([
        supabase
          .from("chantiers")
          .select("nom, adresse")
          .eq("id", donnees.chantierId)
          .single(),
        (async () => {
          const { data: profil } = await supabase
            .from("profiles")
            .select("entreprise_id")
            .eq("id", user.id)
            .single();
          if (!profil?.entreprise_id) return { data: null };
          return supabase
            .from("entreprises")
            .select("nom, logo_url")
            .eq("id", profil.entreprise_id)
            .single();
        })(),
        supabase
          .from("comparaisons")
          .select(
            "id, created_at, page_pe, page_exe, pe:document_pe_id(nom, plan_version), exe:document_exe_id(nom, plan_version)"
          )
          .eq("chantier_id", donnees.chantierId)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

    // Nombre d'annotations par session, pour l'historique
    const idsSessions = (sessions ?? []).map((s) => s.id);
    const comptes = new Map<string, number>();
    if (idsSessions.length > 0) {
      const { data: lignes } = await supabase
        .from("comparaison_annotations")
        .select("comparaison_id")
        .in("comparaison_id", idsSessions);
      for (const ligne of lignes ?? []) {
        comptes.set(
          ligne.comparaison_id,
          (comptes.get(ligne.comparaison_id) ?? 0) + 1
        );
      }
    }

    const nomPlan = (valeur: unknown): string => {
      const plan = valeur as { nom?: string; plan_version?: number | null } | null;
      if (!plan?.nom) return "—";
      return plan.plan_version ? `${plan.nom} V${plan.plan_version}` : plan.nom;
    };

    const historique: ComparaisonHistorique[] = (sessions ?? []).map((s) => ({
      date: new Date(s.created_at).toLocaleDateString("fr-CH"),
      planPE: `${nomPlan(s.pe)} — p. ${s.page_pe}`,
      planEXE: `${nomPlan(s.exe)} — p. ${s.page_exe}`,
      annotations: comptes.get(s.id) ?? 0,
    }));

    const logo = await chargerImageDistante(await signerUrl(supabase, entreprise?.logo_url ?? null));

    // --- Composition des écarts
    const evalues: EcartEvalue[] = ecartsRecus.map((e) => ({
      type: e.type,
      confiance: e.confiance,
      aireRelative: e.aireRelative,
    }));
    const synthese = synthetiser(evalues);

    const ecarts: EcartRapport[] = ecartsRecus.map((e) => ({
      numero: e.numero,
      type: LIBELLES_TYPE[e.type],
      hex: HEX_TYPE[e.type],
      confiance: e.confiance,
      aireRelative: e.aireRelative,
      x: e.x,
      y: e.y,
      priorite: prioriteSST(e),
      recommandation: recommandationSST(e.type),
      nc: e.nc,
    }));

    const maintenant = new Date();
    const props = {
      chantierNom: donnees.chantierNom,
      chantierAdresse: chantier?.adresse ?? donnees.chantierAdresse,
      planPE: donnees.planPE,
      planEXE: donnees.planEXE,
      dateJour: maintenant.toLocaleDateString("fr-CH"),
      dateGeneration: `${maintenant.toLocaleDateString(
        "fr-CH"
      )} à ${maintenant.toLocaleTimeString("fr-CH", {
        hour: "2-digit",
        minute: "2-digit",
      })}`,
      signePar: donnees.signePar,
      entrepriseNom: entreprise?.nom ?? donnees.entrepriseNom,
      logo,
      carte: { data: carteLue.buffer, format: "png" as const },
      miniaturePE:
        "buffer" in miniaturePE
          ? { data: miniaturePE.buffer, format: "png" as const }
          : null,
      miniatureEXE:
        "buffer" in miniatureEXE
          ? { data: miniatureEXE.buffer, format: "png" as const }
          : null,
      ecarts,
      annotations: donnees.annotations.map((a) => ({
        numero: a.numero,
        type: a.type,
        couleur: a.couleur,
        hex: a.hex,
        commentaire: a.commentaire,
        numeroNC: a.numeroNC,
      })),
      historique,
      confianceMoyenne: synthese.confianceMoyenne,
      nbNonConformites: donnees.annotations.filter((a) => a.numeroNC).length,
      legende: (Object.keys(LIBELLES_TYPE) as TypeDifference[]).map((type) => ({
        libelle: LIBELLES_TYPE[type],
        hex: HEX_TYPE[type],
      })),
      repartitionType: (Object.keys(LIBELLES_TYPE) as TypeDifference[]).map(
        (type) => ({
          libelle: LIBELLES_TYPE[type],
          hex: HEX_TYPE[type],
          nombre: ecartsRecus.filter((e) => e.type === type).length,
        })
      ),
    };

    // --- Rendu
    let fichier: Buffer;
    let mime: string;
    let extension: string;

    if (format === "docx") {
      const { construireRapportDocx } = await import(
        "@/lib/comparaison/rapport-auto-docx"
      );
      fichier = await construireRapportDocx(props);
      mime =
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      extension = "docx";
    } else {
      const { renderToBuffer } = await import("@react-pdf/renderer");
      const { RapportComparaisonAuto } = await import(
        "@/components/pdf/rapport-comparaison-auto"
      );
      fichier = await renderToBuffer(RapportComparaisonAuto(props));
      mime = "application/pdf";
      extension = "pdf";
    }

    const jour = maintenant.toISOString().slice(0, 10);
    const nomFichier = `Rapport_comparaison_auto_${assainir(
      donnees.chantierNom
    )}_${jour}.${extension}`;

    // --- Enregistrement dans les documents du chantier
    let avertissement: string | null = null;
    const chemin = `${donnees.chantierId}/rapports-comparaison/${crypto.randomUUID()}.${extension}`;

    const { error: erreurStockage } = await supabase.storage
      .from("rapports")
      .upload(chemin, fichier, { contentType: mime, upsert: false });

    if (erreurStockage) {
      avertissement = `Le rapport n'a pas pu être classé dans les documents du chantier : ${erreurStockage.message}`;
    } else {
      const {
        data: { publicUrl },
      } = supabase.storage.from("rapports").getPublicUrl(chemin);

      const { error: erreurDocument } = await supabase.from("documents").insert({
        chantier_id: donnees.chantierId,
        nom: `Rapport de comparaison — ${props.dateJour}`,
        categorie: "autre",
        description: `Comparaison automatique ${donnees.planPE.nom} / ${donnees.planEXE.nom} — ${ecarts.length} écart(s) détecté(s).`,
        fichier_url: publicUrl,
        fichier_nom: nomFichier,
        fichier_taille: fichier.length,
        uploaded_by: user.id,
      });

      if (erreurDocument) {
        avertissement = `Le rapport n'a pas pu être classé dans les documents du chantier : ${erreurDocument.message}`;
      }
    }

    // --- Envoi aux destinataires du chantier
    let destinatairesTouches = 0;
    if (envoyerEmail) {
      if (!limites.canSendEmail) {
        avertissement =
          "L'envoi d'emails est réservé aux abonnés : le rapport a été généré sans être envoyé.";
      } else {
        const { data: destinataires } = await supabase
          .from("destinataires")
          .select("email, nom")
          .eq("chantier_id", donnees.chantierId);

        const adresses = (destinataires ?? [])
          .map((d) => d.email?.trim())
          .filter((email): email is string => !!email);

        if (adresses.length === 0) {
          avertissement =
            "Aucun destinataire n'est enregistré sur ce chantier : le rapport n'a pas été envoyé.";
        } else {
          const expediteur =
            donnees.signePar.replace(/[<>"'\r\n]/g, "").trim() ||
            "Securionis Chantiers";
          const resend = new Resend(getResendApiKey());
          const resultat = await resend.emails.send({
            from: `${expediteur} <${getResendFromEmail()}>`,
            to: adresses,
            subject: `Rapport de comparaison de plans — ${donnees.chantierNom}`,
            html: `
              <p><strong>Ne veuille pas répondre à cette email ! Utilisez : ks.aigle@gmail.com</strong></p>
              <p>Bonjour,</p>
              <p>
                Veuillez trouver ci-joint le rapport de comparaison automatique des plans du
                chantier <strong>${escapeHtml(donnees.chantierNom)}</strong>.
              </p>
              <ul>
                <li>Plans comparés : ${escapeHtml(donnees.planPE.nom)} / ${escapeHtml(
                  donnees.planEXE.nom
                )}</li>
                <li>Écarts détectés : ${ecarts.length}</li>
                <li>Taux de confiance moyen : ${Math.round(
                  synthese.confianceMoyenne * 100
                )} %</li>
              </ul>
              <p style="color:#6b7280;font-size:12px">
                Les écarts sont relevés par comparaison d'images. Le procédé mesure des
                différences de tracé ; il n'interprète ni leur contenu ni leur portée.
              </p>
              <br>
              <p>Cordialement,<br>${escapeHtml(expediteur)}${
                props.entrepriseNom ? `<br>${escapeHtml(props.entrepriseNom)}` : ""
              }</p>
            `,
            attachments: [{ filename: nomFichier, content: fichier }],
          });

          if (resultat.error) {
            avertissement = `Rapport généré, mais Resend a refusé l'envoi : ${resultat.error.message}`;
          } else {
            destinatairesTouches = adresses.length;
          }
        }
      }
    }

    await journaliser({
      userId: user.id,
      action: "generate_comparaison_report",
      resource: "comparaisons",
      resourceId: comparaisonId,
      details: {
        chantier_id: donnees.chantierId,
        format,
        ecarts: ecarts.length,
        destinataires: destinatairesTouches,
      },
    });

    return new NextResponse(new Uint8Array(fichier), {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `attachment; filename="${nomFichier}"`,
        "Content-Length": String(fichier.length),
        "X-Rapport-Destinataires": String(destinatairesTouches),
        ...(avertissement
          ? { "X-Rapport-Avertissement": encodeURIComponent(avertissement) }
          : {}),
      },
    });
  } catch (err) {
    console.error("Rapport de comparaison :", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Erreur lors de la génération du rapport",
      },
      { status: 500 }
    );
  }
}

function assainir(valeur: string): string {
  return (
    valeur
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "chantier"
  );
}
