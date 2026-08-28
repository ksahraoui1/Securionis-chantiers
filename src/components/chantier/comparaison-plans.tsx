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
  const [opacitePE, setOpacitePE] = useState(100);
  const [opaciteEXE, setOpaciteEXE] = useState(50);
  const [split, setSplit] = useState(false);
  const [inverse, setInverse] = useState(false);
  const [synchro, setSynchro] = useState(true);
  const [decalage, setDecalage] = useState({ x: 0, y: 0 });
  const [differences, setDifferences] = useState(0);
  const [pleinEcran, setPleinEcran] = useState(false);

  const conteneurRef = useRef<HTMLDivElement>(null);
  const cadreRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const osdRef = useRef<OSDStatic | null>(null);
  const itemPERef = useRef<TiledImage | null>(null);
  const itemEXERef = useRef<TiledImage | null>(null);
  const decalageRef = useRef({ x: 0, y: 0 });

  // Miroir des réglages, lu depuis les gestionnaires d'événements OpenSeadragon
  // qui sont enregistrés une seule fois, à l'initialisation du visualiseur.
  const etatRef = useRef({ synchro, split, inverse });
  etatRef.current = { synchro, split, inverse };

  const docPE = plansPE.find((p) => p.id === idPE) ?? null;
  const docEXE = plansEXE.find((p) => p.id === idEXE) ?? null;

  const recale = decalage.x !== 0 || decalage.y !== 0;

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
    dessous.setPosition(new OSD.Point(0, 0));
    dessus.setPosition(new OSD.Point(decalage.x, decalage.y));
  }, [inverse, split, opacitePE, opaciteEXE, decalage]);

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
      setPret(false);
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

  function reinitialiserRecalage() {
    decalageRef.current = { x: 0, y: 0 };
    setDecalage({ x: 0, y: 0 });
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
              className="inline-flex items-center gap-1 text-xs font-medium hover:underline mt-2"
              style={{ color: NAVY }}
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
            {!synchro && recale && (
              <OutilBouton
                icone="filter_center_focus"
                titre="Remettre le plan du dessus dans sa position d'origine"
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

            {/* Compteur de différences */}
            <div className="ml-auto flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2 py-1">
              <span
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
                <span className="material-symbols-outlined text-base">add</span>
              </button>
              {differences > 0 && (
                <button
                  type="button"
                  onClick={() => setDifferences(0)}
                  title="Remettre le compteur à zéro"
                  aria-label="Remettre le compteur à zéro"
                  className="inline-flex items-center justify-center min-h-touch min-w-touch rounded-lg text-gray-500 hover:bg-gray-100 transition-colors w-8 h-8"
                >
                  <span className="material-symbols-outlined text-base">restart_alt</span>
                </button>
              )}
            </div>
          </div>

          {/* Conteneur OpenSeadragon */}
          <div className="relative flex-1">
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
            {!synchro && !split && (
              <p className="absolute bottom-2 left-2 text-[11px] text-white bg-black/60 rounded-lg px-2 py-1 pointer-events-none">
                Recalage libre : glissez pour déplacer le plan{" "}
                {inverse ? "PE" : "EXE"}
              </p>
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
        </div>
      )}
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
      <span className="material-symbols-outlined text-base">{icone}</span>
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
      <span className="material-symbols-outlined text-base">{icone}</span>
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
      <span className="material-symbols-outlined text-lg">{icone}</span>
      {texte && <span className="hidden sm:inline">{texte}</span>}
    </button>
  );
}
