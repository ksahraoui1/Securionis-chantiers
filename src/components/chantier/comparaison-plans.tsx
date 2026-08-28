"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type OpenSeadragonNS from "openseadragon";

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
  plansPE: PlanDoc[];
  plansEXE: PlanDoc[];
}

const EXTENSIONS_IMAGE = /\.(jpe?g|png|webp|gif)$/i;
const EXTENSION_PDF = /\.pdf$/i;

// Largeur de rendu d'une page PDF, en pixels : assez fin pour zoomer sur des
// cotes, assez léger pour ne pas saturer la mémoire sur tablette.
const LARGEUR_RENDU_PDF = 2400;

interface SourcePlan {
  url: string;
  nbPages: number;
  liberer?: () => void;
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
  plansPE,
  plansEXE,
}: ComparaisonPlansProps) {
  const [idPE, setIdPE] = useState(plansPE[0]?.id ?? "");
  const [idEXE, setIdEXE] = useState(plansEXE[0]?.id ?? "");
  const [pagePE, setPagePE] = useState(1);
  const [pageEXE, setPageEXE] = useState(1);
  const [nbPagesPE, setNbPagesPE] = useState(1);
  const [nbPagesEXE, setNbPagesEXE] = useState(1);
  const [charge, setCharge] = useState(false);
  const [pret, setPret] = useState(false);
  const [preparation, setPreparation] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [opacite, setOpacite] = useState(50);
  const [split, setSplit] = useState(false);
  const [inverse, setInverse] = useState(false);
  const [pleinEcran, setPleinEcran] = useState(false);

  const conteneurRef = useRef<HTMLDivElement>(null);
  const cadreRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const osdRef = useRef<OSDStatic | null>(null);
  const itemPERef = useRef<TiledImage | null>(null);
  const itemEXERef = useRef<TiledImage | null>(null);

  const docPE = plansPE.find((p) => p.id === idPE) ?? null;
  const docEXE = plansEXE.find((p) => p.id === idEXE) ?? null;

  // Le calque du dessus reçoit l'opacité réglable ; par défaut c'est l'EXE.
  const typeDessus = inverse ? "PE" : "EXE";

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
    dessous.setOpacity(1);

    if (split) {
      dessus.setOpacity(1);
      dessous.setPosition(new OSD.Point(0, 0));
      dessus.setPosition(new OSD.Point(1.05, 0));
    } else {
      dessus.setOpacity(opacite / 100);
      pe.setPosition(new OSD.Point(0, 0));
      exe.setPosition(new OSD.Point(0, 0));
    }
  }, [inverse, split, opacite]);

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
        });

        osdRef.current = OSD;
        viewerRef.current = viewer;

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
            opacity: index === 0 ? 1 : opacite / 100,
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
      setPret(false);
    };
    // L'opacité initiale est lue au montage : la changer ne doit pas tout reconstruire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charge, docPE?.id, docEXE?.id, pagePE, pageEXE]);

  // Opacité, ordre des calques, disposition
  useEffect(() => {
    appliquerCalques();
  }, [appliquerCalques]);

  // Recadrer quand on bascule superposition / côte à côte
  useEffect(() => {
    if (pret) viewerRef.current?.viewport.goHome();
  }, [split, pret]);

  // Suivi du plein écran (déclenché sur le cadre, pour garder la barre d'outils)
  useEffect(() => {
    function onChange() {
      setPleinEcran(document.fullscreenElement === cadreRef.current);
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

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

  return (
    <div className="space-y-5">
      {/* Sélecteurs */}
      <div className="rounded-lg bg-white p-4 shadow-sm border border-gray-400 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="plan-pe"
              className="block text-xs font-semibold text-[#2E7D32] mb-1"
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
              className="block text-xs font-semibold text-[#E67E22] mb-1"
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
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 bg-[#002855] text-white font-medium rounded-lg hover:bg-[#002855]/90 disabled:opacity-50 transition-colors text-sm"
          >
            <span className="material-symbols-outlined text-lg">compare_arrows</span>
            {preparation ? "Préparation…" : "Charger la comparaison"}
          </button>
        </div>
      </div>

      {erreur && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-3">
          <span className="material-symbols-outlined text-red-600 text-xl shrink-0">
            error
          </span>
          <div className="min-w-0">
            <p className="text-sm text-red-800">{erreur}</p>
            <Link
              href={`/chantiers/${chantierId}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#002855] hover:underline mt-2"
            >
              <span className="material-symbols-outlined text-sm">upload_file</span>
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

            {/* Choix de page pour les PDF multi-pages */}
            <SelecteurPage
              id="page-pe"
              etiquette="Page PE"
              couleur="#2E7D32"
              page={pagePE}
              nbPages={nbPagesPE}
              onChange={setPagePE}
            />
            <SelecteurPage
              id="page-exe"
              etiquette="Page EXE"
              couleur="#E67E22"
              page={pageEXE}
              nbPages={nbPagesEXE}
              onChange={setPageEXE}
            />
          </div>

          {/* Conteneur OpenSeadragon */}
          <div className="relative flex-1">
            <div
              ref={conteneurRef}
              className={`w-full bg-gray-900 ${pleinEcran ? "h-full" : "h-[65vh] min-h-[380px]"}`}
            />
            {!pret && !erreur && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p className="text-sm text-white/80 bg-black/40 rounded-lg px-3 py-2">
                  {preparation ? "Préparation des plans…" : "Chargement…"}
                </p>
              </div>
            )}
          </div>

          {/* Opacité */}
          <div className="border-t border-gray-200 px-4 py-3 bg-gray-50">
            <label
              htmlFor="opacite-calque"
              className="block text-xs font-semibold text-[#002855] mb-2"
            >
              Opacité du plan {typeDessus} : {opacite} %
              {split && (
                <span className="font-normal text-gray-500">
                  {" "}
                  — sans effet en vue côte à côte
                </span>
              )}
            </label>
            <input
              id="opacite-calque"
              type="range"
              min={0}
              max={100}
              step={1}
              value={opacite}
              onChange={(e) => setOpacite(Number(e.target.value))}
              disabled={split}
              className="w-full accent-[#E67E22] disabled:opacity-50"
            />
          </div>
        </div>
      )}
    </div>
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
      <label
        htmlFor={id}
        className="text-xs font-semibold"
        style={{ color: couleur }}
      >
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
  onClick,
}: {
  icone: string;
  titre: string;
  libelle?: string;
  actif?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titre}
      aria-label={titre}
      aria-pressed={texte ? actif : undefined}
      className={`inline-flex items-center gap-1.5 min-h-touch min-w-touch justify-center px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        actif
          ? "bg-[#002855] text-white"
          : "text-[#002855] hover:bg-[#002855]/10"
      }`}
    >
      <span className="material-symbols-outlined text-lg">{icone}</span>
      {texte && <span className="hidden sm:inline">{texte}</span>}
    </button>
  );
}
