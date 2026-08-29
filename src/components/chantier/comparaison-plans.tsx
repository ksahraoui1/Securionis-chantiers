"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type OpenSeadragonNS from "openseadragon";
import { createClient } from "@/lib/supabase/client";
import {
  BarreOutilsAnnotation,
  CoucheAnnotations,
  ListeAnnotations,
  type Annotation,
  type CouleurAnnotation,
  type Geometrie,
  type LienNC,
  type OutilAnnotation,
  HEX_COULEURS,
} from "@/components/chantier/comparaison-annotations";
import {
  ModaleCreationNC,
  type Capture,
} from "@/components/chantier/nc-depuis-annotation";
import { GroupeExport } from "@/components/chantier/comparaison-export";
import {
  HEX_COULEURS as HEX_IMPRESSION,
  LIBELLES_COULEUR,
  LIBELLES_TYPE,
} from "@/lib/utils/comparaison-libelles";
import {
  analyserPlans,
  analyserVue,
  HEX_TYPE,
  LIBELLES_ETAPE,
  type EtapeAnalyse,
  type CalquesVue,
  type ResultatAnalyse,
  type TypeDifference,
  type ZoneAvancee,
} from "@/lib/plan-diff-detection";
import { opencvPret } from "@/lib/opencv";
import { PanneauDifferences } from "@/components/chantier/panneau-differences";
import {
  DiffOverlay,
  LegendeEcarts,
  type EcartAffiche,
} from "@/components/chantier/diff-overlay";
import {
  ControlesEcarts,
  TYPES_DIFFERENCE,
} from "@/components/chantier/controles-ecarts";
import {
  ModaleRapportComparaison,
  type EcartRapportClient,
  type FormatRapport,
} from "@/components/chantier/modale-rapport-comparaison";
import {
  assainirNom,
  capturerVue,
  dateFichier,
  telecharger,
} from "@/lib/utils/comparaison-capture";

type OSDStatic = typeof OpenSeadragonNS;
type Viewer = OpenSeadragonNS.Viewer;
type TiledImage = OpenSeadragonNS.TiledImage;

export interface PlanDoc {
  id: string;
  nom: string;
  fichier_url: string;
  fichier_nom: string;
  plan_type: "PE" | "EXE" | null;
  plan_version: number | null;
  updated_at: string;
}

interface ComparaisonPlansProps {
  chantierId: string;
  chantierNom: string;
  userId: string;
  plansPE: PlanDoc[];
  plansEXE: PlanDoc[];
  planPEInitial?: string;
  planEXEInitial?: string;
}

const EXTENSIONS_IMAGE = /\.(jpe?g|png|webp|gif)$/i;
const EXTENSION_PDF = /\.pdf$/i;

const COULEUR_PE = "#2E7D32";
const COULEUR_EXE = "#E67E22";
const NAVY = "#002855";

// Largeur de rendu d'une page PDF, en pixels : assez fin pour zoomer sur des
// cotes, assez léger pour ne pas saturer la mémoire sur tablette.
const LARGEUR_RENDU_PDF = 2400;

const PAS_OPACITE = 5;

const PRESETS: { label: string; pe: number; exe: number }[] = [
  { label: "PE seul", pe: 100, exe: 0 },
  { label: "PE 75 % / EXE 25 %", pe: 75, exe: 25 },
  { label: "50 / 50", pe: 50, exe: 50 },
  { label: "PE 25 % / EXE 75 %", pe: 25, exe: 75 },
  { label: "EXE seul", pe: 0, exe: 100 },
];

// 0,05 % de l'aire du plan. La valeur par défaut de `filterNoise` (1 %) vaut
// un carré de 150 px de côté sur une analyse à 1600 px : plus gros que la
// plupart des différences réelles, qui seraient toutes écartées.
const SEUIL_BRUIT_DETECTION = 0.0005;

const MESSAGE_DETECTION_IMPOSSIBLE =
  "Détection impossible. Vérifiez que les deux plans sont du même étage et orientés dans le même sens.";

// Formes courtes pour le résumé « 3 ajouts, 6 suppressions… »
const RESUME_DIFFERENCE: Record<TypeDifference, string> = {
  added: "ajout",
  removed: "suppression",
  modified: "modification",
  moved: "déplacement",
};

type EtatDetection =
  | { statut: "inactif" }
  | { statut: "encours"; premierChargement: boolean; etape: EtapeAnalyse }
  | { statut: "fait"; resultat: ResultatAnalyse }
  | { statut: "erreur"; message: string };

/**
 * Deux façons de comparer, qui ne servent pas les mêmes plans.
 *
 * - `vue` : les deux calques sont pris tels qu'ils sont affichés, dans le
 *   recalage et le cadrage de l'utilisateur. Seule option viable quand les
 *   dossiers ne sont pas dessinés au même format ni à la même échelle.
 * - `auto` : recalage par points d'intérêt ORB puis homographie, sur les plans
 *   entiers. Fait pour deux versions d'un **même** dessin.
 */
type ModeDetection = "vue" | "auto";

const MODES_DETECTION: {
  valeur: ModeDetection;
  icone: string;
  titre: string;
  detail: string;
}[] = [
  {
    valeur: "vue",
    icone: "align_horizontal_center",
    titre: "Sur la vue recalée",
    detail:
      "Compare les deux calques tels qu'ils sont affichés. À utiliser quand les plans n'ont ni le même format ni la même échelle.",
  },
  {
    valeur: "auto",
    icone: "auto_fix_high",
    titre: "Avec recalage automatique",
    detail:
      "Aligne les plans entiers par points d'intérêt (ORB), puis compare. Fait pour deux versions d'un même dessin.",
  },
];

const ORDRE_ETAPES: EtapeAnalyse[] = [
  "preparation-1",
  "preparation-2",
  "alignement",
  "detection",
  "classification",
];

/**
 * Couleur d'annotation par type de différence.
 *
 * Le bleu demandé pour le quatrième cas n'est pas retenu : la contrainte
 * `comparaison_annotations.color` (migration 042) n'accepte que red, orange,
 * green et yellow, et le bleu y est déjà réservé — non stocké — à l'état
 * « rattachée à une NC ».
 */
const COULEUR_ANNOTATION: Record<TypeDifference, CouleurAnnotation> = {
  added: "green",
  removed: "red",
  modified: "yellow",
  // Le bleu du calque n'existe pas en base : orange est la seule couleur libre.
  moved: "orange",
};

// Phrases complètes : « Suppression détecté » serait fautif.
const PHRASE_TYPE_ANNOTATION: Record<TypeDifference, string> = {
  added: "Ajout détecté",
  removed: "Suppression détectée",
  modified: "Modification détectée",
  moved: "Déplacement détecté",
};

/** Largeur des miniatures de plan jointes en annexe du rapport. */
const LARGEUR_MINIATURE_RAPPORT = 1000;

/**
 * Miniature PNG d'un plan entier, pour les annexes du rapport.
 * Renvoie null plutôt que d'échouer : le rapport reste valable sans annexe.
 */
async function miniaturePlan(url: string): Promise<Blob | null> {
  try {
    const image = await new Promise<HTMLImageElement>((resoudre, rejeter) => {
      const element = new Image();
      element.crossOrigin = "anonymous";
      element.onload = () => resoudre(element);
      element.onerror = () => rejeter(new Error("plan illisible"));
      element.src = url;
    });

    const echelle = Math.min(
      1,
      LARGEUR_MINIATURE_RAPPORT / image.naturalWidth
    );
    const canevas = document.createElement("canvas");
    canevas.width = Math.max(1, Math.round(image.naturalWidth * echelle));
    canevas.height = Math.max(1, Math.round(image.naturalHeight * echelle));

    const ctx = canevas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canevas.width, canevas.height);
    ctx.drawImage(image, 0, 0, canevas.width, canevas.height);

    return await new Promise<Blob | null>((resoudre) =>
      canevas.toBlob(resoudre, "image/png")
    );
  } catch {
    return null;
  }
}

interface SourcePlan {
  url: string;
  nbPages: number;
  liberer?: () => void;
}

function borner(valeur: number): number {
  return Math.min(100, Math.max(0, valeur));
}

// OpenSeadragon n'affiche que des images : une page de PDF est donc rendue
// dans un canvas, puis fournie au visualiseur sous forme d'URL blob.
async function construireSource(doc: PlanDoc, page: number): Promise<SourcePlan> {
  if (EXTENSIONS_IMAGE.test(doc.fichier_nom)) {
    return { url: doc.fichier_url, nbPages: 1 };
  }

  if (!EXTENSION_PDF.test(doc.fichier_nom)) {
    throw new Error(
      `Format non affichable : ${doc.fichier_nom}. Seuls les PDF et les images (JPEG, PNG) peuvent être comparés.`
    );
  }

  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  // La tâche de chargement porte destroy() : c'est elle qui libère le worker.
  const tache = pdfjs.getDocument({ url: doc.fichier_url });
  const pdf = await tache.promise;

  try {
    const numero = Math.min(Math.max(page, 1), pdf.numPages);
    const pagePdf = await pdf.getPage(numero);

    const base = pagePdf.getViewport({ scale: 1 });
    const echelle = Math.min(4, Math.max(1, LARGEUR_RENDU_PDF / base.width));
    const viewport = pagePdf.getViewport({ scale: echelle });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);

    await pagePdf.render({ canvas, viewport }).promise;

    const blob = await new Promise<Blob | null>((resoudre) =>
      canvas.toBlob(resoudre, "image/png")
    );
    if (!blob) {
      throw new Error(`Le rendu du plan « ${doc.nom} » a échoué.`);
    }

    const url = URL.createObjectURL(blob);
    return {
      url,
      nbPages: pdf.numPages,
      liberer: () => URL.revokeObjectURL(url),
    };
  } finally {
    void tache.destroy();
  }
}

function libelle(doc: PlanDoc): string {
  const version = doc.plan_version ? ` — V${doc.plan_version}` : "";
  const date = new Date(doc.updated_at).toLocaleDateString("fr-CH");
  return `${doc.nom}${version} — ${date}`;
}

export function ComparaisonPlans({
  chantierId,
  chantierNom,
  userId,
  plansPE,
  plansEXE,
  planPEInitial,
  planEXEInitial,
}: ComparaisonPlansProps) {
  const [idPE, setIdPE] = useState(
    plansPE.find((p) => p.id === planPEInitial)?.id ?? plansPE[0]?.id ?? ""
  );
  const [idEXE, setIdEXE] = useState(
    plansEXE.find((p) => p.id === planEXEInitial)?.id ?? plansEXE[0]?.id ?? ""
  );
  const [pagePE, setPagePE] = useState(1);
  const [pageEXE, setPageEXE] = useState(1);
  const [nbPagesPE, setNbPagesPE] = useState(1);
  const [nbPagesEXE, setNbPagesEXE] = useState(1);
  const [charge, setCharge] = useState(false);
  const [pret, setPret] = useState(false);
  const [preparation, setPreparation] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [opacitePE, setOpacitePE] = useState(100);
  const [opaciteEXE, setOpaciteEXE] = useState(50);
  const [split, setSplit] = useState(false);
  const [inverse, setInverse] = useState(false);
  const [synchro, setSynchro] = useState(true);
  const [decalage, setDecalage] = useState({ x: 0, y: 0 });
  /**
   * Largeur du calque du dessus en unités monde. Les deux plans sont posés à
   * 1 de large : un plan au 1:50 doit donc être ramené autour de 0,5 pour se
   * superposer à un 1:100 du même ouvrage.
   */
  const [echelleCalque, setEchelleCalque] = useState(1);
  const [differences, setDifferences] = useState(0);
  const [pleinEcran, setPleinEcran] = useState(false);

  const [detection, setDetection] = useState<EtatDetection>({ statut: "inactif" });
  const [panneauOuvert, setPanneauOuvert] = useState(false);
  const [zonesAnnotees, setZonesAnnotees] = useState<Set<number>>(new Set());
  const [ecartsVisibles, setEcartsVisibles] = useState(true);
  const [opaciteEcarts, setOpaciteEcarts] = useState(0.3);
  const [typesEcarts, setTypesEcarts] = useState<Set<TypeDifference>>(
    () => new Set(TYPES_DIFFERENCE)
  );
  // Partagé avec le panneau latéral : deux seuils indépendants se
  // contrediraient et l'utilisateur ne saurait plus lequel gouverne l'affichage.
  const [confianceMin, setConfianceMin] = useState(0);
  const [ecartSelectionne, setEcartSelectionne] = useState<number | null>(null);
  const [menuDetection, setMenuDetection] = useState(false);
  /**
   * Les cartouches diffèrent systématiquement entre un dossier d'enquête et un
   * dossier d'exécution — bureau, date, indice, numéro de plan. Les comparer
   * produit des écarts à forte confiance qui n'en sont pas : on les écarte par
   * défaut.
   */
  const [ignorerCartouches, setIgnorerCartouches] = useState(true);
  const menuDetectionRef = useRef<HTMLDivElement>(null);
  const [modaleRapport, setModaleRapport] = useState(false);
  // Annotation créée depuis chaque écart : permet de savoir, au moment du
  // rapport, si l'écart a donné lieu à une non-conformité.
  const [annotationParEcart, setAnnotationParEcart] = useState<
    Record<number, string>
  >({});

  const [comparaisonId, setComparaisonId] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [outil, setOutil] = useState<OutilAnnotation>("pan");
  const [couleurAnnotation, setCouleurAnnotation] = useState<CouleurAnnotation>("red");
  const [selection, setSelection] = useState<string | null>(null);
  const [filtreCouleur, setFiltreCouleur] = useState<CouleurAnnotation | "all">("all");
  const [erreurAnnotation, setErreurAnnotation] = useState<string | null>(null);
  const [idAFocaliser, setIdAFocaliser] = useState<string | null>(null);
  const [liensNC, setLiensNC] = useState<Record<string, LienNC>>({});
  const [annotationNC, setAnnotationNC] = useState<Annotation | null>(null);
  const [capture, setCapture] = useState<Capture>({ blob: null, apercu: null });

  const conteneurRef = useRef<HTMLDivElement>(null);
  const cadreRef = useRef<HTMLDivElement>(null);
  // Zone qui porte le visualiseur et la couche d'annotations : c'est elle que
  // la capture PNG recompose.
  const zoneRef = useRef<HTMLDivElement>(null);
  // Images réellement affichées (page de PDF rendue, ou image d'origine) :
  // c'est sur elles que porte la détection de différences, pas sur le canevas
  // du visualiseur, qui n'en montre qu'un cadrage à l'opacité du moment.
  const sourcesRef = useRef<{ pe: string; exe: string } | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const osdRef = useRef<OSDStatic | null>(null);
  const itemPERef = useRef<TiledImage | null>(null);
  const itemEXERef = useRef<TiledImage | null>(null);
  const decalageRef = useRef({ x: 0, y: 0 });
  const minuteursCommentaire = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Miroir des réglages, lu depuis les gestionnaires d'événements OpenSeadragon
  // qui sont enregistrés une seule fois, à l'initialisation du visualiseur.
  const etatRef = useRef({ synchro, split, inverse });
  etatRef.current = { synchro, split, inverse };

  const docPE = plansPE.find((p) => p.id === idPE) ?? null;
  const docEXE = plansEXE.find((p) => p.id === idEXE) ?? null;

  const recale = decalage.x !== 0 || decalage.y !== 0 || echelleCalque !== 1;

  const appliquerCalques = useCallback(() => {
    const viewer = viewerRef.current;
    const OSD = osdRef.current;
    const pe = itemPERef.current;
    const exe = itemEXERef.current;
    if (!viewer || !OSD || !pe || !exe) return;

    const dessus = inverse ? pe : exe;
    const dessous = inverse ? exe : pe;

    viewer.world.setItemIndex(dessous, 0);
    viewer.world.setItemIndex(dessus, 1);

    if (split) {
      // Côte à côte : les deux plans sont pleinement visibles, l'opacité n'a
      // plus de sens et le recalage non plus.
      pe.setOpacity(1);
      exe.setOpacity(1);
      dessous.setPosition(new OSD.Point(0, 0));
      dessus.setPosition(new OSD.Point(1.05, 0));
      return;
    }

    pe.setOpacity(opacitePE / 100);
    exe.setOpacity(opaciteEXE / 100);
    dessous.setWidth(1);
    dessous.setPosition(new OSD.Point(0, 0));
    // L'ordre compte : la largeur d'abord, la position ensuite — `setWidth`
    // conserve le coin supérieur gauche, que `setPosition` fixe juste après.
    dessus.setWidth(echelleCalque);
    dessus.setPosition(new OSD.Point(decalage.x, decalage.y));
  }, [inverse, split, opacitePE, opaciteEXE, decalage, echelleCalque]);

  // Référence toujours à jour, pour l'appeler depuis l'effet d'initialisation
  const appliquerCalquesRef = useRef(appliquerCalques);
  appliquerCalquesRef.current = appliquerCalques;

  // Préparation des sources puis initialisation du visualiseur
  useEffect(() => {
    if (!charge || !docPE || !docEXE) return;
    const element = conteneurRef.current;
    if (!element) return;

    let annule = false;
    let viewer: Viewer | null = null;
    const aLiberer: Array<() => void> = [];

    (async () => {
      setPreparation(true);
      try {
        const [srcPE, srcEXE] = await Promise.all([
          construireSource(docPE, pagePE),
          construireSource(docEXE, pageEXE),
        ]);

        if (annule) {
          srcPE.liberer?.();
          srcEXE.liberer?.();
          return;
        }

        sourcesRef.current = { pe: srcPE.url, exe: srcEXE.url };

        if (srcPE.liberer) aLiberer.push(srcPE.liberer);
        if (srcEXE.liberer) aLiberer.push(srcEXE.liberer);
        setNbPagesPE(srcPE.nbPages);
        setNbPagesEXE(srcEXE.nbPages);

        const OSD = (await import("openseadragon")).default;
        if (annule || !conteneurRef.current) return;

        viewer = OSD({
          element,
          showNavigationControl: false,
          visibilityRatio: 0.4,
          minZoomLevel: 0.2,
          maxZoomPixelRatio: 6,
          smoothTileEdgesMinZoom: Infinity,
          // Un simple clic doit servir à désigner un point du plan, pas à zoomer ;
          // le zoom reste accessible au double-clic, à la molette et aux boutons.
          gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: true },
          gestureSettingsTouch: { clickToZoom: false, dblClickToZoom: true },
          // Sans cela, un plan image servi par le stockage teinte le canevas
          // et la capture de la zone annotée devient impossible.
          crossOriginPolicy: "Anonymous",
        });

        osdRef.current = OSD;
        viewerRef.current = viewer;

        // Verrou ouvert : le glissement déplace le calque du dessus au lieu de
        // déplacer la vue, ce qui permet de recaler deux plans mal superposés.
        viewer.addHandler("canvas-drag", (event) => {
          const { synchro: verrouille, split: cote, inverse: inv } = etatRef.current;
          if (verrouille || cote) return;

          const v = viewerRef.current;
          const dessus = inv ? itemPERef.current : itemEXERef.current;
          if (!v || !dessus) return;

          event.preventDefaultAction = true;
          const delta = v.viewport.deltaPointsFromPixels(event.delta, true);
          const position = dessus.getBounds(true).getTopLeft().plus(delta);
          dessus.setPosition(position, true);
          decalageRef.current = { x: position.x, y: position.y };
        });

        viewer.addHandler("canvas-drag-end", () => {
          if (etatRef.current.synchro || etatRef.current.split) return;
          setDecalage(decalageRef.current);
        });

        const ajouter = (
          url: string,
          index: number,
          cible: typeof itemPERef,
          nom: string
        ) => {
          viewer?.addTiledImage({
            tileSource: { type: "image", url },
            index,
            width: 1,
            success: (event) => {
              cible.current = (event as unknown as { item: TiledImage }).item;
              if (itemPERef.current && itemEXERef.current) {
                appliquerCalquesRef.current();
                viewerRef.current?.viewport.goHome(true);
                setPret(true);
              }
            },
            error: () => {
              if (!annule) {
                setErreur(`Le plan « ${nom} » n'a pas pu être affiché.`);
              }
            },
          });
        };

        ajouter(srcPE.url, 0, itemPERef, docPE.nom);
        ajouter(srcEXE.url, 1, itemEXERef, docEXE.nom);
      } catch (err) {
        if (!annule) {
          setErreur(
            err instanceof Error
              ? err.message
              : "Les plans n'ont pas pu être préparés."
          );
          setCharge(false);
        }
      } finally {
        if (!annule) setPreparation(false);
      }
    })();

    return () => {
      annule = true;
      viewer?.destroy();
      viewerRef.current = null;
      itemPERef.current = null;
      itemEXERef.current = null;
      aLiberer.forEach((liberer) => liberer());
      sourcesRef.current = null;
      setDetection({ statut: "inactif" });
      setPanneauOuvert(false);
      setZonesAnnotees(new Set());
      setEcartSelectionne(null);
      setAnnotationParEcart({});
      setPret(false);
      setAnnotations([]);
      setLiensNC({});
      setComparaisonId(null);
      setSelection(null);
    };
  }, [charge, docPE, docEXE, pagePE, pageEXE]);

  // Opacités, ordre des calques, disposition, recalage
  useEffect(() => {
    appliquerCalques();
  }, [appliquerCalques]);

  // Recadrer quand on bascule superposition / côte à côte
  useEffect(() => {
    if (pret) viewerRef.current?.viewport.goHome();
  }, [split, pret]);

  // Fermeture du menu de détection au clic extérieur et à Échap
  useEffect(() => {
    if (!menuDetection) return;

    function auClic(event: MouseEvent) {
      if (!menuDetectionRef.current?.contains(event.target as Node)) {
        setMenuDetection(false);
      }
    }
    function auClavier(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuDetection(false);
    }

    document.addEventListener("mousedown", auClic);
    document.addEventListener("keydown", auClavier);
    return () => {
      document.removeEventListener("mousedown", auClic);
      document.removeEventListener("keydown", auClavier);
    };
  }, [menuDetection]);

  // Suivi du plein écran (déclenché sur le cadre, pour garder la barre d'outils)
  useEffect(() => {
    function onChange() {
      setPleinEcran(document.fullscreenElement === cadreRef.current);
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Session de comparaison : le couple de plans et de pages réellement
  // affichés. C'est elle qui porte les annotations, d'où leur réapparition
  // exactement au même endroit au rechargement.
  useEffect(() => {
    if (!pret || !docPE || !docEXE) return;
    let annule = false;

    (async () => {
      const supabase = createClient();
      setErreurAnnotation(null);

      const cles = {
        chantier_id: chantierId,
        document_pe_id: docPE.id,
        document_exe_id: docEXE.id,
        page_pe: pagePE,
        page_exe: pageEXE,
      };

      const { data: existante } = await supabase
        .from("comparaisons")
        .select("id")
        .match(cles)
        .maybeSingle();

      let identifiant = existante?.id ?? null;

      if (!identifiant) {
        const { data: creee, error } = await supabase
          .from("comparaisons")
          .insert({ ...cles, created_by: userId })
          .select("id")
          .single();

        if (error) {
          // Course possible avec un autre onglet : la ligne existe désormais.
          const { data: reprise } = await supabase
            .from("comparaisons")
            .select("id")
            .match(cles)
            .maybeSingle();
          identifiant = reprise?.id ?? null;
          if (!identifiant && !annule) {
            setErreurAnnotation(
              "Les annotations ne peuvent pas être enregistrées : " + error.message
            );
          }
        } else {
          identifiant = creee.id;
        }
      }

      if (annule || !identifiant) return;
      setComparaisonId(identifiant);

      const { data: lignes, error: erreurLecture } = await supabase
        .from("comparaison_annotations")
        .select("id, type, x, y, width, height, color, commentaire")
        .eq("comparaison_id", identifiant)
        .order("created_at");

      if (annule) return;
      if (erreurLecture) {
        setErreurAnnotation(
          "Les annotations n'ont pas pu être chargées : " + erreurLecture.message
        );
        return;
      }
      setAnnotations(lignes ?? []);

      const idsAnnotations = (lignes ?? []).map((l) => l.id);
      if (idsAnnotations.length === 0) {
        setLiensNC({});
        return;
      }

      const { data: liens } = await supabase
        .from("comparaison_nc_links")
        .select("annotation_id, nc_id, ecarts(numero)")
        .in("annotation_id", idsAnnotations);

      if (annule) return;
      setLiensNC(
        Object.fromEntries(
          (liens ?? []).map((l) => [
            l.annotation_id,
            {
              ncId: l.nc_id,
              numero:
                (l.ecarts as unknown as { numero: number } | null)?.numero ?? 0,
            },
          ])
        )
      );
    })();

    return () => {
      annule = true;
    };
  }, [pret, chantierId, docPE, docEXE, pagePE, pageEXE, userId]);

  // Une étiquette de texte est vide à la création : on amène l'utilisateur
  // directement dans son champ de commentaire, qui en porte le contenu.
  useEffect(() => {
    if (!idAFocaliser) return;
    document.getElementById(`commentaire-${idAFocaliser}`)?.focus();
    setIdAFocaliser(null);
  }, [idAFocaliser]);

  // Les minuteurs de sauvegarde des commentaires ne doivent pas survivre au démontage
  useEffect(() => {
    const minuteurs = minuteursCommentaire.current;
    return () => {
      Object.values(minuteurs).forEach(clearTimeout);
    };
  }, []);

  async function creerAnnotation(
    nouvelle: Omit<Annotation, "id" | "commentaire">,
    // Renseigné quand l'annotation vient d'une différence détectée
    commentaire: string | null = null
  ) {
    if (!comparaisonId) return;
    const supabase = createClient();

    const { data, error } = await supabase
      .from("comparaison_annotations")
      .insert({
        comparaison_id: comparaisonId,
        ...nouvelle,
        commentaire,
        created_by: userId,
      })
      .select("id, type, x, y, width, height, color, commentaire")
      .single();

    if (error || !data) {
      setErreurAnnotation(
        "L'annotation n'a pas pu être enregistrée : " +
          (error?.message ?? "réponse vide")
      );
      return;
    }

    setAnnotations((precedentes) => [...precedentes, data]);
    setSelection(data.id);

    // Le champ n'existe pas encore : on le focalise depuis un effet, une fois rendu.
    if (data.type === "text") setIdAFocaliser(data.id);

    return data.id as string;
  }

  async function majGeometrie(id: string, geometrie: Geometrie) {
    setAnnotations((precedentes) =>
      precedentes.map((a) => (a.id === id ? { ...a, ...geometrie } : a))
    );
    const supabase = createClient();
    const { error } = await supabase
      .from("comparaison_annotations")
      .update(geometrie)
      .eq("id", id);
    if (error) setErreurAnnotation("Déplacement non enregistré : " + error.message);
  }

  function majCommentaire(id: string, commentaire: string) {
    setAnnotations((precedentes) =>
      precedentes.map((a) => (a.id === id ? { ...a, commentaire } : a))
    );
    clearTimeout(minuteursCommentaire.current[id]);
    minuteursCommentaire.current[id] = setTimeout(async () => {
      const supabase = createClient();
      const { error } = await supabase
        .from("comparaison_annotations")
        .update({ commentaire: commentaire.trim() || null })
        .eq("id", id);
      if (error) setErreurAnnotation("Commentaire non enregistré : " + error.message);
    }, 600);
  }

  async function majCouleur(id: string, color: CouleurAnnotation) {
    setAnnotations((precedentes) =>
      precedentes.map((a) => (a.id === id ? { ...a, color } : a))
    );
    const supabase = createClient();
    const { error } = await supabase
      .from("comparaison_annotations")
      .update({ color })
      .eq("id", id);
    if (error) setErreurAnnotation("Couleur non enregistrée : " + error.message);
  }

  async function supprimerAnnotation(id: string) {
    if (
      liensNC[id] &&
      !confirm(
        `Cette annotation est rattachée à la NC #${liensNC[id].numero}. La supprimer laissera la non-conformité en place, sans lien vers le plan. Continuer ?`
      )
    ) {
      return;
    }

    setAnnotations((precedentes) => precedentes.filter((a) => a.id !== id));
    if (selection === id) setSelection(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("comparaison_annotations")
      .delete()
      .eq("id", id);
    if (error) setErreurAnnotation("Suppression non enregistrée : " + error.message);
  }

  // Capture PNG de la zone annotée : on découpe le canevas du visualiseur
  // autour de la boîte de l'annotation, avec une marge, et on y trace son
  // contour — la couche SVG des annotations n'est pas dans ce canevas.
  async function genererCapture(annotation: Annotation): Promise<Capture> {
    const viewer = viewerRef.current;
    const OSD = osdRef.current;
    const vide: Capture = { blob: null, apercu: null };
    if (!viewer || !OSD) return vide;

    try {
      const source = viewer.container.querySelector("canvas");
      if (!(source instanceof HTMLCanvasElement)) return vide;

      const ratio = source.width / viewer.container.clientWidth;
      const x0 = Math.min(annotation.x, annotation.x + annotation.width);
      const y0 = Math.min(annotation.y, annotation.y + annotation.height);
      const largeur = Math.abs(annotation.width);
      const hauteur = Math.abs(annotation.height);
      const marge = Math.max(largeur, hauteur) * 0.3 + 0.01;

      const coin1 = viewer.viewport.pixelFromPoint(
        new OSD.Point(x0 - marge, y0 - marge),
        true
      );
      const coin2 = viewer.viewport.pixelFromPoint(
        new OSD.Point(x0 + largeur + marge, y0 + hauteur + marge),
        true
      );

      const sx = Math.max(0, Math.min(coin1.x, coin2.x) * ratio);
      const sy = Math.max(0, Math.min(coin1.y, coin2.y) * ratio);
      const sw = Math.min(source.width - sx, Math.abs(coin2.x - coin1.x) * ratio);
      const sh = Math.min(source.height - sy, Math.abs(coin2.y - coin1.y) * ratio);
      if (sw < 8 || sh < 8) return vide;

      const cible = document.createElement("canvas");
      cible.width = Math.round(sw);
      cible.height = Math.round(sh);
      const ctx = cible.getContext("2d");
      if (!ctx) return vide;

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, cible.width, cible.height);
      ctx.drawImage(source, sx, sy, sw, sh, 0, 0, cible.width, cible.height);

      const haut = viewer.viewport.pixelFromPoint(new OSD.Point(x0, y0), true);
      const bas = viewer.viewport.pixelFromPoint(
        new OSD.Point(x0 + largeur, y0 + hauteur),
        true
      );
      ctx.strokeStyle = HEX_COULEURS[annotation.color];
      ctx.lineWidth = 3;
      ctx.strokeRect(
        haut.x * ratio - sx,
        haut.y * ratio - sy,
        (bas.x - haut.x) * ratio,
        (bas.y - haut.y) * ratio
      );

      const blob = await new Promise<Blob | null>((resoudre) =>
        cible.toBlob(resoudre, "image/png")
      );
      return { blob, apercu: blob ? cible.toDataURL("image/png") : null };
    } catch {
      // Canevas teinté ou navigateur restrictif : la NC sera créée sans image.
      return vide;
    }
  }

  async function ouvrirModaleNC(annotation: Annotation) {
    setCapture(await genererCapture(annotation));
    setAnnotationNC(annotation);
  }

  async function detecterDifferences(mode: ModeDetection) {
    setMenuDetection(false);

    if (mode === "vue" && split) {
      setDetection({
        statut: "erreur",
        message:
          "La détection compare les deux calques superposés. Repassez en superposition avant de la lancer.",
      });
      return;
    }

    // Près de 7 Mo au premier appel : le dire évite de croire à un blocage.
    const premierChargement = !opencvPret();
    setDetection({
      statut: "encours",
      premierChargement,
      etape: "preparation-1",
    });
    setZonesAnnotees(new Set());
    setAnnotationParEcart({});
    setEcartSelectionne(null);
    setEcartsVisibles(true);
    setTypesEcarts(new Set(TYPES_DIFFERENCE));
    setConfianceMin(0);

    try {
      const onEtape = (etape: EtapeAnalyse) =>
        setDetection({ statut: "encours", premierChargement, etape });

      let resultat: ResultatAnalyse;

      if (mode === "auto") {
        // Recalage automatique : ORB + homographie sur les plans entiers.
        const sources = sourcesRef.current;
        if (!sources) {
          throw new Error("Les plans ne sont plus disponibles.");
        }
        resultat = await analyserPlans(sources.pe, sources.exe, {
          seuilBruit: SEUIL_BRUIT_DETECTION,
          onEtape,
          ignorerCartouches,
        });
      } else {
        // Le recalage est celui de l'utilisateur : on compare les deux calques
        // dans le cadrage courant, pas les plans entiers.
        const calques = await capturerCalques();
        resultat = await analyserVue(calques, {
          seuilBruit: SEUIL_BRUIT_DETECTION,
          onEtape,
          ignorerCartouches,
        });
      }
      if (resultat.aligne) {
        setDetection({ statut: "fait", resultat });
        setPanneauOuvert(resultat.zones.length > 0);
        setErreurAnnotation(resultat.avertissement);
      } else {
        // Le motif venu de l'alignement dit *pourquoi* : « Plans trop
        // différents » n'appelle pas la même vérification qu'une transformation
        // aberrante.
        setDetection({
          statut: "erreur",
          message: resultat.raison
            ? `${MESSAGE_DETECTION_IMPOSSIBLE} (${resultat.raison}.)`
            : MESSAGE_DETECTION_IMPOSSIBLE,
        });
        setPanneauOuvert(false);
      }
    } catch (err) {
      console.error("Détection de différences :", err);
      // Sans le détail, l'utilisateur — et nous — n'avons aucune prise sur la
      // panne : le message générique ne distingue pas deux plans incompatibles
      // d'un incident technique.
      const detail = err instanceof Error ? err.message.trim() : "";
      setDetection({
        statut: "erreur",
        message: detail
          ? `${MESSAGE_DETECTION_IMPOSSIBLE} (${detail}.)`
          : MESSAGE_DETECTION_IMPOSSIBLE,
      });
      setPanneauOuvert(false);
    }
  }

  // Numérotation figée sur l'ordre d'origine (confiance décroissante), pour
  // que le numéro reste le même dans le calque, l'infobulle et le tableau.
  const ecartsNumerotes: EcartAffiche[] = useMemo(
    () =>
      detection.statut === "fait"
        ? detection.resultat.zones.map((zone, index) => ({
            zone,
            numero: index + 1,
          }))
        : [],
    [detection]
  );

  const ecartsFiltres = useMemo(
    () =>
      ecartsNumerotes.filter(
        ({ zone }) =>
          typesEcarts.has(zone.type) && zone.confiance >= confianceMin / 100
      ),
    [ecartsNumerotes, typesEcarts, confianceMin]
  );

  /** Reporte en annotation tous les écarts actuellement affichés. */
  async function accepterTout() {
    const aTraiter = ecartsFiltres.filter(
      ({ numero }) => !zonesAnnotees.has(numero)
    );
    if (aTraiter.length === 0) return;

    if (
      !confirm(
        `Créer ${aTraiter.length} annotation${
          aTraiter.length > 1 ? "s" : ""
        } sur la comparaison ?`
      )
    ) {
      return;
    }

    // En série : chaque création est une écriture en base, et l'ordre des
    // numéros d'annotation doit suivre celui des écarts.
    for (const { zone, numero } of aTraiter) {
      await annoterZone(zone, numero);
    }
  }

  /** Écarte le résultat de la détection sans rien enregistrer. */
  function rejeterTout() {
    setDetection({ statut: "inactif" });
    setPanneauOuvert(false);
    setEcartSelectionne(null);
    setZonesAnnotees(new Set());
    setAnnotationParEcart({});
  }

  /**
   * Reporte une différence détectée en annotation sur la vue.
   *
   * Les zones sont exprimées en pixels dans le repère de l'image d'analyse ;
   * les annotations en unités monde OpenSeadragon. Le repère renvoyé par
   * l'analyse porte l'origine et le pas — il vaut aussi bien pour une analyse
   * sur les plans entiers que sur la vue recalée à l'écran.
   */
  async function annoterZone(zone: ZoneAvancee, numero: number) {
    if (detection.statut !== "fait") return;

    const repere = detection.resultat.repere;
    if (repere.unitesParPixel <= 0) return;

    const pourcent = Math.round(zone.confiance * 100);
    const idAnnotation = await creerAnnotation(
      {
        type: "rect",
        x: repere.origineX + zone.x * repere.unitesParPixel,
        y: repere.origineY + zone.y * repere.unitesParPixel,
        width: zone.width * repere.unitesParPixel,
        height: zone.height * repere.unitesParPixel,
        color: COULEUR_ANNOTATION[zone.type],
      },
      `${PHRASE_TYPE_ANNOTATION[zone.type]} — confiance ${pourcent} % (différence n° ${numero})`
    );

    setZonesAnnotees((precedentes) => new Set(precedentes).add(numero));
    if (idAnnotation) {
      setAnnotationParEcart((precedents) => ({
        ...precedents,
        [numero]: idAnnotation,
      }));
    }
  }

  /**
   * Compose et télécharge le rapport de comparaison.
   *
   * La carte des écarts est la capture de la vue **telle qu'elle est affichée**,
   * calque compris ; les miniatures sont les deux plans entiers. Les écarts
   * partent en JSON — la détection tourne dans le navigateur, le serveur ne peut
   * pas la refaire —, tandis que le chantier, les annotations, les
   * non-conformités et l'historique sont relus en base côté serveur.
   */
  async function genererRapport(
    format: FormatRapport,
    envoyerEmail: boolean
  ): Promise<void> {
    if (detection.statut !== "fait" || !comparaisonId) {
      throw new Error("Aucune détection à rapporter.");
    }
    const sources = sourcesRef.current;
    if (!sources) throw new Error("Les plans ne sont plus disponibles.");

    setSelection(null);
    const carte = await capturerComparaison();

    const [miniaturePE, miniatureEXE] = await Promise.all([
      miniaturePlan(sources.pe),
      miniaturePlan(sources.exe),
    ]);

    const ecarts: EcartRapportClient[] = ecartsNumerotes.map(
      ({ zone, numero }) => {
        const idAnnotation = annotationParEcart[numero];
        return {
          numero,
          type: zone.type,
          confiance: zone.confiance,
          aireRelative: zone.aireRelative,
          x: zone.x,
          y: zone.y,
          nc: idAnnotation ? liensNC[idAnnotation]?.numero ?? null : null,
        };
      }
    );

    const formulaire = new FormData();
    formulaire.append("format", format);
    formulaire.append("envoyerEmail", envoyerEmail ? "1" : "0");
    formulaire.append("ecarts", JSON.stringify(ecarts));
    formulaire.append("carte", carte, "carte.png");
    if (miniaturePE) formulaire.append("miniaturePE", miniaturePE, "pe.png");
    if (miniatureEXE) formulaire.append("miniatureEXE", miniatureEXE, "exe.png");

    const reponse = await fetch(
      `/api/comparaisons/${comparaisonId}/rapport-auto`,
      { method: "POST", body: formulaire }
    );

    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => null);
      throw new Error(corps?.error ?? "La génération du rapport a échoué.");
    }

    const extension = format === "docx" ? "docx" : "pdf";
    telecharger(
      await reponse.blob(),
      `Rapport_comparaison_auto_${assainirNom(
        chantierNom
      )}_${dateFichier()}.${extension}`
    );

    const brut = reponse.headers.get("X-Rapport-Avertissement");
    const destinataires = Number(
      reponse.headers.get("X-Rapport-Destinataires") ?? 0
    );

    setModaleRapport(false);
    setErreurAnnotation(
      brut
        ? decodeURIComponent(brut)
        : destinataires > 0
          ? `Rapport généré, classé dans les documents du chantier et envoyé à ${destinataires} destinataire${
              destinataires > 1 ? "s" : ""
            }.`
          : "Rapport généré et classé dans les documents du chantier."
    );
  }

  // Vue « rapport » des annotations : numérotées comme dans la liste et dans
  // le PDF, avec les libellés français et le numéro de NC rattachée.
  const annotationsImpression = annotations.map((annotation, index) => ({
    numero: index + 1,
    type: LIBELLES_TYPE[annotation.type] ?? annotation.type,
    couleur: LIBELLES_COULEUR[annotation.color] ?? annotation.color,
    hex: HEX_IMPRESSION[annotation.color] ?? "#6b7280",
    commentaire: annotation.commentaire,
    numeroNC: liensNC[annotation.id]?.numero ?? null,
  }));

  /**
   * Rend les deux calques séparément, dans le cadrage courant.
   *
   * On éteint l'un puis l'autre et on lit le canevas du visualiseur entre les
   * deux : les deux images sortent donc du **même** cadre, à la position, à
   * l'échelle et au recalage que l'utilisateur leur a donnés. C'est ce qui
   * permet de comparer des plans qui ne sont ni au même format ni à la même
   * échelle.
   */
  async function capturerCalques(): Promise<CalquesVue> {
    const viewer = viewerRef.current;
    const OSD = osdRef.current;
    const pe = itemPERef.current;
    const exe = itemEXERef.current;
    if (!viewer || !OSD || !pe || !exe) {
      throw new Error("le visualiseur n'est pas initialisé");
    }

    // OpenSeadragon peut retomber sur son rendu HTML, sans canevas, quand le
    // navigateur refuse WebGL et le canevas 2D. La comparaison est alors
    // impossible : autant le dire.
    const source = viewer.container.querySelector("canvas");
    if (!(source instanceof HTMLCanvasElement)) {
      throw new Error(
        "le visualiseur ne fournit pas de canevas — accélération graphique désactivée ?"
      );
    }

    const largeurCss = viewer.container.clientWidth;
    const hauteurCss = viewer.container.clientHeight;
    if (largeurCss < 8 || hauteurCss < 8) {
      throw new Error("la zone d'affichage est trop petite");
    }

    const attendreRendu = () =>
      new Promise<void>((resoudre) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resoudre()))
      );

    const rendre = async (
      visible: TiledImage,
      cache: TiledImage
    ): Promise<HTMLCanvasElement> => {
      visible.setOpacity(1);
      cache.setOpacity(0);
      viewer.forceRedraw();
      await attendreRendu();

      const canevas = document.createElement("canvas");
      canevas.width = source.width;
      canevas.height = source.height;
      const ctx = canevas.getContext("2d");
      if (!ctx) {
        throw new Error("le navigateur n'a pas fourni de contexte de dessin");
      }
      // Fond blanc : hors du plan, le canevas est transparent, ce qui serait
      // lu comme de l'encre par le seuillage.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canevas.width, canevas.height);
      ctx.drawImage(source, 0, 0);
      return canevas;
    };

    try {
      const canevasPE = await rendre(pe, exe);
      const canevasEXE = await rendre(exe, pe);

      // Repère : origine et pas du canevas de capture, en unités monde.
      const ratio = source.width / largeurCss;
      const origine = viewer.viewport.pointFromPixel(new OSD.Point(0, 0), true);
      const unite = viewer.viewport.pointFromPixel(new OSD.Point(1, 0), true);

      return {
        canevasPE,
        canevasEXE,
        repere: {
          origineX: origine.x,
          origineY: origine.y,
          unitesParPixel: (unite.x - origine.x) / ratio,
        },
      };
    } finally {
      // Rétablit les opacités choisies par l'utilisateur.
      appliquerCalques();
      viewer.forceRedraw();
    }
  }

  // Les poignées de sélection ne doivent pas figurer dans l'export : on
  // désélectionne, puis on laisse React repeindre avant de lire le canevas.
  async function capturerComparaison(): Promise<Blob> {
    const zone = zoneRef.current;
    if (!zone) {
      throw new Error("La vue de comparaison n'est pas encore prête.");
    }

    setSelection(null);
    await new Promise<void>((resoudre) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resoudre()))
    );

    const { blob } = await capturerVue(zone);
    return blob;
  }

  function exporterAnnotations() {
    const contenu = {
      exporte_le: new Date().toISOString(),
      chantier_id: chantierId,
      comparaison_id: comparaisonId,
      plan_pe: docPE && {
        id: docPE.id,
        nom: docPE.nom,
        version: docPE.plan_version,
        page: pagePE,
      },
      plan_exe: docEXE && {
        id: docEXE.id,
        nom: docEXE.nom,
        version: docEXE.plan_version,
        page: pageEXE,
      },
      repere:
        "Coordonnées en unités monde OpenSeadragon : le plan PE fait 1 de large, origine au coin supérieur gauche.",
      annotations: annotations.map((a, index) => ({ numero: index + 1, ...a })),
    };

    const blob = new Blob([JSON.stringify(contenu, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const lien = document.createElement("a");
    lien.href = url;
    lien.download = `annotations-comparaison-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    lien.click();
    URL.revokeObjectURL(url);
  }

  function lancerComparaison() {
    setErreur(null);
    setPret(false);
    setCharge(true);
  }

  function zoomer(facteur: number) {
    const viewport = viewerRef.current?.viewport;
    if (!viewport) return;
    viewport.zoomBy(facteur);
    viewport.applyConstraints();
  }

  function basculerPleinEcran() {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    // Un refus (politique du navigateur, environnement embarqué) doit se voir,
    // sinon le bouton paraît simplement inerte.
    cadreRef.current?.requestFullscreen().catch(() => {
      setErreur(
        "Le plein écran a été refusé par le navigateur. Utilisez le plein écran du navigateur (F11) à la place."
      );
    });
  }

  function reinitialiserRecalage() {
    decalageRef.current = { x: 0, y: 0 };
    setDecalage({ x: 0, y: 0 });
    setEchelleCalque(1);
  }

  /**
   * Redimensionne le calque du dessus autour du centre de la vue.
   *
   * Sans ce recentrage, `setWidth` conserverait le coin supérieur gauche : ce
   * qu'on regarde s'échapperait du cadre à chaque cran, et il faudrait
   * redéplacer le calque après chaque changement d'échelle.
   */
  function changerEchelleCalque(nouvelle: number) {
    const viewer = viewerRef.current;
    const facteurBorne = Math.min(4, Math.max(0.25, nouvelle));

    if (viewer && echelleCalque > 0) {
      const rapport = facteurBorne / echelleCalque;
      const centre = viewer.viewport.getCenter(true);
      const suivant = {
        x: centre.x - (centre.x - decalage.x) * rapport,
        y: centre.y - (centre.y - decalage.y) * rapport,
      };
      decalageRef.current = suivant;
      setDecalage(suivant);
    }

    setEchelleCalque(facteurBorne);
  }

  // Alterne entre « PE seul » et « EXE seul »
  function basculerPlans() {
    if (opacitePE >= opaciteEXE) {
      setOpacitePE(0);
      setOpaciteEXE(100);
    } else {
      setOpacitePE(100);
      setOpaciteEXE(0);
    }
  }

  const opaciteDesactivee = split;

  return (
    <div className="space-y-5">
      {/* Sélecteurs */}
      <div className="rounded-lg bg-white p-4 shadow-sm border border-gray-400 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="plan-pe"
              className="block text-xs font-semibold mb-1"
              style={{ color: COULEUR_PE }}
            >
              Plan d&apos;enquête publique (PE)
            </label>
            <select
              id="plan-pe"
              value={idPE}
              onChange={(e) => {
                setIdPE(e.target.value);
                setPagePE(1);
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 min-h-touch text-sm"
            >
              {plansPE.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {libelle(doc)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="plan-exe"
              className="block text-xs font-semibold mb-1"
              style={{ color: COULEUR_EXE }}
            >
              Plan d&apos;exécution (EXE)
            </label>
            <select
              id="plan-exe"
              value={idEXE}
              onChange={(e) => {
                setIdEXE(e.target.value);
                setPageEXE(1);
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 min-h-touch text-sm"
            >
              {plansEXE.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {libelle(doc)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={lancerComparaison}
            disabled={!docPE || !docEXE || preparation}
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 text-white font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity text-sm"
            style={{ backgroundColor: NAVY }}
          >
            <span translate="no" className="material-symbols-outlined text-lg">compare_arrows</span>
            {preparation ? "Préparation…" : "Charger la comparaison"}
          </button>
        </div>
      </div>

      {erreur && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-3">
          <span translate="no" className="material-symbols-outlined text-red-600 text-xl shrink-0">
            error
          </span>
          <div className="min-w-0">
            <p className="text-sm text-red-800">{erreur}</p>
            <Link
              href={`/chantiers/${chantierId}`}
              className="inline-flex items-center gap-1 text-xs font-medium hover:underline mt-2"
              style={{ color: NAVY }}
            >
              <span translate="no" className="material-symbols-outlined text-sm">upload_file</span>
              Ajouter un plan
            </Link>
          </div>
        </div>
      )}

      {/* Vue */}
      {charge && (
        <div
          ref={cadreRef}
          className={`rounded-lg bg-white border border-gray-400 overflow-hidden flex flex-col ${
            pleinEcran ? "h-screen rounded-none" : ""
          }`}
        >
          {/* Barre d'outils */}
          <div className="flex items-center gap-1 flex-wrap border-b border-gray-200 px-2 py-2 bg-gray-50">
            <OutilBouton icone="zoom_in" titre="Zoom avant" onClick={() => zoomer(1.4)} />
            <OutilBouton icone="zoom_out" titre="Zoom arrière" onClick={() => zoomer(1 / 1.4)} />
            <OutilBouton
              icone="fit_screen"
              titre="Vue d'ensemble"
              onClick={() => viewerRef.current?.viewport.goHome()}
            />
            <OutilBouton
              icone={pleinEcran ? "fullscreen_exit" : "fullscreen"}
              titre={pleinEcran ? "Quitter le plein écran" : "Plein écran"}
              onClick={basculerPleinEcran}
            />
            <div className="w-px h-6 bg-gray-300 mx-1" />
            <OutilBouton
              icone="vertical_split"
              titre="Superposition / côte à côte"
              libelle="Split view"
              actif={split}
              onClick={() => setSplit((v) => !v)}
            />
            <OutilBouton
              icone="swap_vert"
              titre="Inverser l'ordre des calques"
              libelle="Inverser les calques"
              actif={inverse}
              onClick={() => setInverse((v) => !v)}
            />
            <OutilBouton
              icone={synchro ? "lock" : "lock_open"}
              titre={
                synchro
                  ? "Zoom verrouillé : les deux plans bougent ensemble. Déverrouiller pour recaler le plan du dessus."
                  : "Verrou ouvert : glissez pour recaler le plan du dessus. Cliquez pour reverrouiller."
              }
              libelle={synchro ? "Zoom verrouillé" : "Recalage libre"}
              actif={!synchro}
              desactive={split}
              onClick={() => setSynchro((v) => !v)}
            />
            {!synchro && !split && (
              <EchelleCalque
                valeur={echelleCalque}
                plan={inverse ? "PE" : "EXE"}
                onChange={changerEchelleCalque}
              />
            )}
            {!synchro && recale && (
              <OutilBouton
                icone="filter_center_focus"
                titre="Remettre le plan du dessus à sa position et à son échelle d'origine"
                onClick={reinitialiserRecalage}
              />
            )}

            {/* Choix de page pour les PDF multi-pages */}
            <SelecteurPage
              id="page-pe"
              etiquette="Page PE"
              couleur={COULEUR_PE}
              page={pagePE}
              nbPages={nbPagesPE}
              onChange={setPagePE}
            />
            <SelecteurPage
              id="page-exe"
              etiquette="Page EXE"
              couleur={COULEUR_EXE}
              page={pageEXE}
              nbPages={nbPagesEXE}
              onChange={setPageEXE}
            />

            <div className="w-px h-6 bg-gray-300 mx-1" />

            {/* Deux modes de comparaison, explicités : ils ne conviennent pas
                aux mêmes plans, l'utilisateur doit savoir lequel il lance. */}
            <div className="relative" ref={menuDetectionRef}>
              <button
                type="button"
                onClick={() => setMenuDetection((v) => !v)}
                disabled={!pret || detection.statut === "encours"}
                aria-haspopup="menu"
                aria-expanded={menuDetection}
                title="Comparer les deux plans et repérer les zones qui diffèrent"
                className="inline-flex items-center gap-1.5 min-h-touch px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 hover:bg-[#002855]/10"
                style={{ color: NAVY }}
              >
                <span translate="no" className="material-symbols-outlined text-lg">
                  troubleshoot
                </span>
                <span className="hidden sm:inline">Détecter les différences</span>
                <span translate="no" className="material-symbols-outlined text-base">
                  {menuDetection ? "expand_less" : "expand_more"}
                </span>
              </button>

              {menuDetection && (
                <div
                  role="menu"
                  className="absolute left-0 top-full mt-1 z-40 w-80 rounded-lg border border-gray-300 bg-white shadow-lg py-1"
                >
                  <label className="w-full flex items-start gap-2 px-3 py-2 min-h-touch text-left hover:bg-gray-100 transition-colors cursor-pointer border-b border-gray-200">
                    <input
                      type="checkbox"
                      checked={ignorerCartouches}
                      onChange={(e) => setIgnorerCartouches(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span className="min-w-0">
                      <span
                        className="block text-xs font-semibold"
                        style={{ color: NAVY }}
                      >
                        Ignorer les cartouches
                      </span>
                      <span className="block text-[11px] text-gray-500">
                        Leur contenu diffère toujours entre les deux dossiers.
                        Les zones écartées sont hachurées sur le plan.
                      </span>
                    </span>
                  </label>

                  {MODES_DETECTION.map((mode) => (
                    <button
                      key={mode.valeur}
                      type="button"
                      role="menuitem"
                      onClick={() => void detecterDifferences(mode.valeur)}
                      className="w-full flex items-start gap-2 px-3 py-2 min-h-touch text-left hover:bg-gray-100 transition-colors"
                    >
                      <span
                        translate="no"
                        className="material-symbols-outlined text-lg mt-0.5 shrink-0"
                        style={{ color: COULEUR_EXE }}
                      >
                        {mode.icone}
                      </span>
                      <span className="min-w-0">
                        <span
                          className="block text-xs font-semibold"
                          style={{ color: NAVY }}
                        >
                          {mode.titre}
                        </span>
                        <span className="block text-[11px] text-gray-500">
                          {mode.detail}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {docPE && docEXE && (
              <>
                <div className="w-px h-6 bg-gray-300 mx-1" />
                <GroupeExport
                  pret={pret}
                  comparaisonId={comparaisonId}
                  chantierNom={chantierNom}
                  docPE={docPE}
                  docEXE={docEXE}
                  pagePE={pagePE}
                  pageEXE={pageEXE}
                  annotations={annotationsImpression}
                  onCapturer={capturerComparaison}
                />
              </>
            )}

            {/* Compteur de différences */}
            <div className="ml-auto flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2 py-1">
              <span
                translate="no"
                className="material-symbols-outlined text-base"
                style={{ color: COULEUR_EXE }}
              >
                difference
              </span>
              <span className="text-xs font-semibold" style={{ color: NAVY }}>
                Différences repérées : {differences}
              </span>
              <button
                type="button"
                onClick={() => setDifferences((n) => n + 1)}
                title="Ajouter une différence"
                aria-label="Ajouter une différence"
                className="inline-flex items-center justify-center min-h-touch min-w-touch rounded-lg text-white hover:opacity-90 transition-opacity w-8 h-8"
                style={{ backgroundColor: NAVY }}
              >
                <span translate="no" className="material-symbols-outlined text-base">add</span>
              </button>
              {differences > 0 && (
                <button
                  type="button"
                  onClick={() => setDifferences(0)}
                  title="Remettre le compteur à zéro"
                  aria-label="Remettre le compteur à zéro"
                  className="inline-flex items-center justify-center min-h-touch min-w-touch rounded-lg text-gray-500 hover:bg-gray-100 transition-colors w-8 h-8"
                >
                  <span translate="no" className="material-symbols-outlined text-base">restart_alt</span>
                </button>
              )}
            </div>
          </div>

          {detection.statut !== "inactif" && (
            <ResultatDetection
              etat={detection}
              panneauOuvert={panneauOuvert}
              onRouvrir={() => setPanneauOuvert(true)}
              onRapport={() => setModaleRapport(true)}
            />
          )}

          {/* Barre d'outils d'annotation */}
          <BarreOutilsAnnotation
            outil={outil}
            couleur={couleurAnnotation}
            nbAnnotations={annotations.length}
            onOutil={(o) => {
              setOutil(o);
              // Le marqueur appelle le jaune : c'est la couleur attendue d'un surligneur.
              if (o === "highlight") setCouleurAnnotation("yellow");
            }}
            onCouleur={setCouleurAnnotation}
            onExporter={exporterAnnotations}
          />

          {detection.statut === "fait" &&
            detection.resultat.zones.length > 0 && (
              <ControlesEcarts
                visible={ecartsVisibles}
                opacite={opaciteEcarts}
                typesActifs={typesEcarts}
                confianceMin={confianceMin}
                nbAffiches={ecartsFiltres.length}
                nbTotal={ecartsNumerotes.length}
                nbAnnotees={
                  ecartsFiltres.filter(({ numero }) => zonesAnnotees.has(numero))
                    .length
                }
                onVisible={setEcartsVisibles}
                onOpacite={setOpaciteEcarts}
                onType={(type, actif) =>
                  setTypesEcarts((precedents) => {
                    const suivants = new Set(precedents);
                    if (actif) suivants.add(type);
                    else suivants.delete(type);
                    return suivants;
                  })
                }
                onConfiance={setConfianceMin}
                onToutAccepter={() => void accepterTout()}
                onToutRejeter={rejeterTout}
              />
            )}

          {erreurAnnotation && (
            <p className="px-3 py-2 text-xs text-red-700 bg-red-50 border-b border-red-200 flex items-center gap-1">
              <span translate="no" className="material-symbols-outlined text-sm">error</span>
              {erreurAnnotation}
            </p>
          )}

          {/* Visualiseur et panneau des différences, côte à côte */}
          <div className="flex flex-col lg:flex-row flex-1 min-h-0">
          {/* Conteneur OpenSeadragon */}
          <div ref={zoneRef} className="relative flex-1 min-w-0">
            <div
              ref={conteneurRef}
              className={`w-full bg-gray-100 ${
                pleinEcran ? "h-full" : "h-[65vh] min-h-[380px]"
              }`}
            />
            {!pret && !erreur && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p className="text-sm text-gray-700 bg-white/90 border border-gray-300 rounded-lg px-3 py-2">
                  {preparation ? "Préparation des plans…" : "Chargement…"}
                </p>
              </div>
            )}
            {pret && (
              <CoucheAnnotations
                viewer={viewerRef.current}
                osd={osdRef.current}
                outil={outil}
                couleur={couleurAnnotation}
                annotations={annotations}
                liens={liensNC}
                selection={selection}
                onSelection={setSelection}
                onCreer={creerAnnotation}
                onGeometrie={majGeometrie}
              />
            )}
            {pret && ecartsVisibles && detection.statut === "fait" && (
              <>
                <DiffOverlay
                  viewer={viewerRef.current}
                  osd={osdRef.current}
                  ecarts={ecartsFiltres}
                  cartouches={detection.resultat.cartouches}
                  repere={detection.resultat.repere}
                  opacite={opaciteEcarts}
                  selection={ecartSelectionne}
                  onSelection={(numero) => {
                    setEcartSelectionne(numero);
                    if (numero !== null) setPanneauOuvert(true);
                  }}
                />
                {ecartsFiltres.length > 0 && (
                  <LegendeEcarts
                    types={TYPES_DIFFERENCE.filter((type) =>
                      typesEcarts.has(type)
                    )}
                    cartouches={detection.resultat.cartouches.length}
                  />
                )}
              </>
            )}

            {!synchro && !split && (
              <p className="absolute bottom-2 left-2 text-[11px] text-white bg-black/60 rounded-lg px-2 py-1 pointer-events-none">
                Recalage libre : glissez pour déplacer le plan{" "}
                {inverse ? "PE" : "EXE"}, réglez son échelle dans la barre
                d&apos;outils
              </p>
            )}
          </div>

          {panneauOuvert && detection.statut === "fait" && (
            <PanneauDifferences
              zones={detection.resultat.zones}
              annotees={zonesAnnotees}
              confianceMin={confianceMin}
              selection={ecartSelectionne}
              onConfiance={setConfianceMin}
              onSelection={setEcartSelectionne}
              onAnnoter={(zone, numero) => void annoterZone(zone, numero)}
              onFermer={() => setPanneauOuvert(false)}
            />
          )}
          </div>

          {/* Réglage des opacités */}
          <div className="border-t border-gray-200 px-4 py-3 bg-gray-50 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm font-semibold" style={{ color: NAVY }}>
                <span style={{ color: COULEUR_PE }}>Plan PE : {opacitePE} %</span>
                <span className="text-gray-400"> — </span>
                <span style={{ color: COULEUR_EXE }}>Plan EXE : {opaciteEXE} %</span>
                {opaciteDesactivee && (
                  <span className="font-normal text-gray-500">
                    {" "}
                    — sans effet en vue côte à côte
                  </span>
                )}
              </p>
              <div className="flex items-center gap-2">
                <BoutonSecondaire
                  icone="restart_alt"
                  libelle="Reset"
                  titre="Revenir à 50 % / 50 %"
                  desactive={opaciteDesactivee}
                  onClick={() => {
                    setOpacitePE(50);
                    setOpaciteEXE(50);
                  }}
                />
                <BoutonSecondaire
                  icone="swap_horiz"
                  libelle="Basculer"
                  titre="Alterner entre PE seul et EXE seul"
                  desactive={opaciteDesactivee}
                  onClick={basculerPlans}
                />
              </div>
            </div>

            <LigneOpacite
              id="opacite-pe"
              etiquette="PE"
              couleur={COULEUR_PE}
              valeur={opacitePE}
              desactive={opaciteDesactivee}
              onChange={setOpacitePE}
            />
            <LigneOpacite
              id="opacite-exe"
              etiquette="EXE"
              couleur={COULEUR_EXE}
              valeur={opaciteEXE}
              desactive={opaciteDesactivee}
              onChange={setOpaciteEXE}
            />

            <div className="flex items-center gap-1.5 flex-wrap">
              {PRESETS.map((preset) => {
                const actif =
                  opacitePE === preset.pe && opaciteEXE === preset.exe;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setOpacitePE(preset.pe);
                      setOpaciteEXE(preset.exe);
                    }}
                    disabled={opaciteDesactivee}
                    aria-pressed={actif}
                    className={`px-3 py-1.5 min-h-touch rounded-full text-xs font-medium whitespace-nowrap transition-colors disabled:opacity-50 ${
                      actif
                        ? "text-white"
                        : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-100"
                    }`}
                    style={actif ? { backgroundColor: NAVY } : undefined}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Liste des annotations */}
          <ListeAnnotations
            annotations={annotations}
            liens={liensNC}
            chantierId={chantierId}
            filtre={filtreCouleur}
            selection={selection}
            onFiltre={setFiltreCouleur}
            onSelection={setSelection}
            onCommentaire={majCommentaire}
            onCouleur={majCouleur}
            onSupprimer={supprimerAnnotation}
            onCreerNC={ouvrirModaleNC}
          />
        </div>
      )}

      {modaleRapport && detection.statut === "fait" && (
        <ModaleRapportComparaison
          ecarts={ecartsNumerotes.map(({ zone, numero }) => ({
            numero,
            type: zone.type,
            confiance: zone.confiance,
            aireRelative: zone.aireRelative,
            x: zone.x,
            y: zone.y,
            nc: null,
          }))}
          nbAnnotations={annotations.length}
          nbNonConformites={Object.keys(liensNC).length}
          onGenerer={genererRapport}
          onFermer={() => setModaleRapport(false)}
        />
      )}

      {annotationNC && docPE && docEXE && (
        <ModaleCreationNC
          annotation={annotationNC}
          chantierId={chantierId}
          chantierNom={chantierNom}
          docPE={docPE}
          docEXE={docEXE}
          pagePE={pagePE}
          pageEXE={pageEXE}
          capture={capture}
          onFermer={() => {
            setAnnotationNC(null);
            setCapture({ blob: null, apercu: null });
          }}
          onCree={(nc) => {
            setLiensNC((precedents) => ({
              ...precedents,
              [annotationNC.id]: { ncId: nc.ncId, numero: nc.numero },
            }));
            setErreurAnnotation(
              nc.avertissement
                ? `NC #${nc.numero} créée. ${nc.avertissement}`
                : null
            );
            setAnnotationNC(null);
            setCapture({ blob: null, apercu: null });
          }}
        />
      )}
    </div>
  );
}

function ResultatDetection({
  etat,
  panneauOuvert,
  onRouvrir,
  onRapport,
}: {
  etat: EtatDetection;
  panneauOuvert: boolean;
  onRouvrir: () => void;
  onRapport: () => void;
}) {
  if (etat.statut === "inactif") return null;

  if (etat.statut === "encours") {
    const rang = ORDRE_ETAPES.indexOf(etat.etape);
    return (
      <div className="px-3 py-2 border-b border-gray-200 bg-gray-50 space-y-1.5">
        <p className="text-xs flex items-center gap-2 text-gray-700">
          <span
            translate="no"
            className="material-symbols-outlined text-sm animate-spin"
          >
            progress_activity
          </span>
          {/* « Analyse en cours… » reste l'état lisible d'un coup d'œil ;
              l'étape courante le précise sans le remplacer. */}
          <span className="font-medium" style={{ color: NAVY }}>
            Analyse en cours…
          </span>
          <span className="text-gray-600">{LIBELLES_ETAPE[etat.etape]}</span>
          {etat.premierChargement && (
            <span className="text-gray-500">
              Premier appel : la bibliothèque d&apos;analyse d&apos;image
              (environ 7 Mo) est en cours de téléchargement.
            </span>
          )}
        </p>
        <div className="flex items-center gap-1" aria-hidden>
          {ORDRE_ETAPES.map((cle, index) => (
            <span
              key={cle}
              className="h-1 flex-1 rounded-full transition-colors"
              style={{
                backgroundColor:
                  index <= rang ? COULEUR_EXE : "rgba(0,40,85,0.12)",
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (etat.statut === "erreur") {
    return (
      <p className="px-3 py-2 text-xs text-red-700 bg-red-50 border-b border-red-200 flex items-start gap-1">
        <span translate="no" className="material-symbols-outlined text-sm">
          error
        </span>
        {etat.message}
      </p>
    );
  }

  const { zones } = etat.resultat;
  const parType = (type: TypeDifference) =>
    zones.filter((zone) => zone.type === type).length;

  return (
    <div className="px-3 py-2 text-xs border-b border-gray-200 bg-gray-50 flex items-center gap-x-3 gap-y-2 flex-wrap">
      <span className="flex items-center gap-1.5 font-semibold" style={{ color: NAVY }}>
        <span translate="no" className="material-symbols-outlined text-sm">
          troubleshoot
        </span>
        {zones.length} différence{zones.length > 1 ? "s" : ""} détectée
        {zones.length > 1 ? "s" : ""}
      </span>

      {zones.length > 0 &&
        (Object.keys(RESUME_DIFFERENCE) as TypeDifference[]).map((type) => {
          const nombre = parType(type);
          if (nombre === 0) return null;
          return (
            <span key={type} className="flex items-center gap-1 text-gray-600">
              <span
                className="w-2.5 h-2.5 rounded-full border border-black/10"
                style={{ backgroundColor: HEX_TYPE[type] }}
              />
              {nombre} {RESUME_DIFFERENCE[type]}
              {nombre > 1 ? "s" : ""}
            </span>
          );
        })}

      {/* La comparaison porte sur la vue telle qu'elle est recalée : il n'y a
          pas de correspondance calculée à annoncer. */}
      <span className="text-gray-500">
        {etat.resultat.correspondances > 0 ? (
          <>
            Recalage sur {etat.resultat.correspondances} points communs
            {etat.resultat.echelle.fiable &&
              Math.abs(etat.resultat.echelle.echelle - 1) > 0.02 && (
                <> — échelle EXE/PE estimée à {etat.resultat.echelle.echelle}</>
              )}
            .
          </>
        ) : (
          <>
            Sur la vue telle qu&apos;elle est recalée et cadrée
            {etat.resultat.echelle.fiable && (
              <>
                {" "}
                — échelle résiduelle entre calques :{" "}
                {etat.resultat.echelle.echelle}
              </>
            )}
            .
          </>
        )}
      </span>

      {zones.length > 0 && (
        <button
          type="button"
          onClick={onRapport}
          title="Composer le rapport complet de cette comparaison"
          className="inline-flex items-center gap-1 px-2 py-1 min-h-touch rounded-lg text-white text-[11px] font-medium hover:opacity-90 transition-opacity"
          style={{ backgroundColor: NAVY }}
        >
          <span translate="no" className="material-symbols-outlined text-sm">
            lab_profile
          </span>
          Générer le rapport de comparaison
        </button>
      )}

      {zones.length > 0 && !panneauOuvert && (
        <button
          type="button"
          onClick={onRouvrir}
          className="ml-auto inline-flex items-center gap-1 px-2 py-1 min-h-touch rounded-lg border border-gray-300 bg-white text-[11px] font-medium hover:bg-gray-100 transition-colors"
          style={{ color: NAVY }}
        >
          <span translate="no" className="material-symbols-outlined text-sm">
            right_panel_open
          </span>
          Voir le détail
        </button>
      )}
    </div>
  );
}

/**
 * Réglage de l'échelle du calque du dessus, pour superposer deux plans dessinés
 * à des échelles différentes — un 1:50 sur un 1:100, par exemple.
 *
 * Le pas fin (1 %) sert à l'ajustement final ; le curseur permet d'atteindre
 * rapidement un rapport de moitié ou de double.
 */
function EchelleCalque({
  valeur,
  plan,
  onChange,
}: {
  valeur: number;
  plan: string;
  onChange: (valeur: number) => void;
}) {
  const pourcent = Math.round(valeur * 100);

  return (
    <div className="flex items-center gap-1 ml-1 rounded-lg border border-gray-300 bg-white px-1.5 py-1">
      <span
        translate="no"
        className="material-symbols-outlined text-base"
        style={{ color: COULEUR_EXE }}
        title={`Échelle du plan ${plan}, celui du dessus`}
      >
        aspect_ratio
      </span>
      <BoutonPas
        icone="remove"
        titre={`Réduire le plan ${plan} de 1 %`}
        desactive={valeur <= 0.25}
        onClick={() => onChange(valeur - 0.01)}
      />
      <input
        type="range"
        min={25}
        max={400}
        step={1}
        value={pourcent}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        aria-label={`Échelle du plan ${plan}`}
        className="w-24"
        style={{ accentColor: COULEUR_EXE }}
      />
      <BoutonPas
        icone="add"
        titre={`Agrandir le plan ${plan} de 1 %`}
        desactive={valeur >= 4}
        onClick={() => onChange(valeur + 0.01)}
      />
      <span
        className="text-xs font-semibold tabular-nums w-12 text-right"
        style={{ color: NAVY }}
      >
        {pourcent} %
      </span>
    </div>
  );
}

function LigneOpacite({
  id,
  etiquette,
  couleur,
  valeur,
  desactive,
  onChange,
}: {
  id: string;
  etiquette: string;
  couleur: string;
  valeur: number;
  desactive: boolean;
  onChange: (valeur: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor={id}
        className="text-xs font-bold w-10 shrink-0"
        style={{ color: couleur }}
      >
        {etiquette}
      </label>
      <BoutonPas
        icone="remove"
        titre={`Diminuer l'opacité du plan ${etiquette} de ${PAS_OPACITE} %`}
        desactive={desactive || valeur <= 0}
        onClick={() => onChange(borner(valeur - PAS_OPACITE))}
      />
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={1}
        value={valeur}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={desactive}
        className="flex-1 disabled:opacity-50"
        style={{ accentColor: couleur }}
      />
      <BoutonPas
        icone="add"
        titre={`Augmenter l'opacité du plan ${etiquette} de ${PAS_OPACITE} %`}
        desactive={desactive || valeur >= 100}
        onClick={() => onChange(borner(valeur + PAS_OPACITE))}
      />
      <span className="text-xs font-semibold text-gray-600 w-12 text-right tabular-nums">
        {valeur} %
      </span>
    </div>
  );
}

function BoutonPas({
  icone,
  titre,
  desactive,
  onClick,
}: {
  icone: string;
  titre: string;
  desactive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titre}
      aria-label={titre}
      disabled={desactive}
      className="inline-flex items-center justify-center min-h-touch min-w-touch w-9 h-9 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40 transition-colors shrink-0"
    >
      <span translate="no" className="material-symbols-outlined text-base">{icone}</span>
    </button>
  );
}

function BoutonSecondaire({
  icone,
  libelle: texte,
  titre,
  desactive,
  onClick,
}: {
  icone: string;
  libelle: string;
  titre: string;
  desactive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titre}
      disabled={desactive}
      className="inline-flex items-center gap-1.5 min-h-touch px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-xs font-medium hover:bg-gray-100 disabled:opacity-50 transition-colors"
      style={{ color: NAVY }}
    >
      <span translate="no" className="material-symbols-outlined text-base">{icone}</span>
      {texte}
    </button>
  );
}

function SelecteurPage({
  id,
  etiquette,
  couleur,
  page,
  nbPages,
  onChange,
}: {
  id: string;
  etiquette: string;
  couleur: string;
  page: number;
  nbPages: number;
  onChange: (page: number) => void;
}) {
  if (nbPages <= 1) return null;

  return (
    <div className="flex items-center gap-1 ml-1">
      <label htmlFor={id} className="text-xs font-semibold" style={{ color: couleur }}>
        {etiquette}
      </label>
      <select
        id={id}
        value={page}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-lg border border-gray-300 px-2 py-1 min-h-touch text-xs"
      >
        {Array.from({ length: nbPages }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>
            {n} / {nbPages}
          </option>
        ))}
      </select>
    </div>
  );
}

function OutilBouton({
  icone,
  titre,
  libelle: texte,
  actif = false,
  desactive = false,
  onClick,
}: {
  icone: string;
  titre: string;
  libelle?: string;
  actif?: boolean;
  desactive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titre}
      aria-label={titre}
      aria-pressed={texte ? actif : undefined}
      disabled={desactive}
      className={`inline-flex items-center gap-1.5 min-h-touch min-w-touch justify-center px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 ${
        actif ? "text-white" : "hover:bg-[#002855]/10"
      }`}
      style={actif ? { backgroundColor: NAVY } : { color: NAVY }}
    >
      <span translate="no" className="material-symbols-outlined text-lg">{icone}</span>
      {texte && <span className="hidden sm:inline">{texte}</span>}
    </button>
  );
}
