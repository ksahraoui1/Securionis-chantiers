"use client";

import { useCallback, useEffect, useRef } from "react";
import type OpenSeadragonNS from "openseadragon";

type Viewer = OpenSeadragonNS.Viewer;
type TiledImage = OpenSeadragonNS.TiledImage;

/** Patience accordée au rechargement des deux calques, en millisecondes. */
export const DELAI_POSE_MS = 15_000;

interface Options {
  viewerRef: React.RefObject<Viewer | null>;
  itemPERef: React.RefObject<TiledImage | null>;
  itemEXERef: React.RefObject<TiledImage | null>;
  /** Applique la géométrie une fois les deux calques ajoutés. */
  appliquerCalquesRef: React.RefObject<() => void>;
  onPret: (pret: boolean) => void;
  onErreur: (message: string) => void;
}

/**
 * Pose des deux calques dans le visualiseur.
 *
 * Sorti du composant avec la géométrie : ce sont les deux endroits qui ont
 * produit le plus de pièges du module de comparaison, et celui-ci porte le plus
 * retors — la conservation du cadrage à travers un `world.removeAll()`.
 */
export function usePoseCalques({
  viewerRef,
  itemPERef,
  itemEXERef,
  appliquerCalquesRef,
  onPret,
  onErreur,
}: Options) {
  /** URLs actuellement posées dans le visualiseur, pour ne rien reposer en vain. */
  const urlsPoseesRef = useRef<{ pe: string; exe: string } | null>(null);

  const poserCalques = useCallback(
    (
      urlPE: string,
      urlEXE: string,
      options: { recentrer: boolean; nomPE: string; nomEXE: string }
    ) => {
      const viewer = viewerRef.current;
      if (!viewer) return;

      // ⚠️ Vider le monde **remet le cadrage à zéro** : OpenSeadragon revient
      // à la vue d'ensemble dès que le monde se retrouve vide, puis se
      // redimensionne sur le nouveau contenu. Vérifié dans le navigateur — un
      // centre à (0,31 ; 0,42) et un zoom de 4 reviennent à (0,5 ; 0,5) et
      // 0,78. Il faut donc relever le cadrage avant, et le reposer après.
      const cadrage = options.recentrer
        ? null
        : {
            centre: viewer.viewport.getCenter(true),
            zoom: viewer.viewport.getZoom(true),
          };

      urlsPoseesRef.current = { pe: urlPE, exe: urlEXE };
      itemPERef.current = null;
      itemEXERef.current = null;
      viewer.world.removeAll();

      const ajouter = (
        url: string,
        index: number,
        cible: React.RefObject<TiledImage | null>,
        nom: string
      ) => {
        viewer.addTiledImage({
          tileSource: { type: "image", url },
          index,
          width: 1,
          success: (event) => {
            cible.current = (event as unknown as { item: TiledImage }).item;
            if (itemPERef.current && itemEXERef.current) {
              appliquerCalquesRef.current();
              const vue = viewerRef.current?.viewport;
              if (options.recentrer) {
                vue?.goHome(true);
              } else if (cadrage && vue) {
                vue.zoomTo(cadrage.zoom, undefined, true);
                vue.panTo(cadrage.centre, true);
              }
              onPret(true);
            }
          },
          error: () => {
            // Le visualiseur détruit met sa référence à null : c'est le signe
            // que l'échec n'intéresse plus personne.
            if (viewerRef.current) {
              onErreur(`Le plan « ${nom} » n'a pas pu être affiché.`);
            }
          },
        });
      };

      ajouter(urlPE, 0, itemPERef, options.nomPE);
      ajouter(urlEXE, 1, itemEXERef, options.nomEXE);
    },
    [viewerRef, itemPERef, itemEXERef, appliquerCalquesRef, onPret, onErreur]
  );

  // Écrite dans un effet, jamais pendant le rendu (même défaut que celui
  // corrigé dans `use-geometrie-calques` lors de DET-05) : un rendu non
  // validé par React laisserait la ref en avance sur l'état affiché.
  const poserCalquesRef = useRef(poserCalques);
  useEffect(() => {
    poserCalquesRef.current = poserCalques;
  }, [poserCalques]);

  /** Même chose, mais rendue quand les deux plans sont entièrement chargés. */
  const poserCalquesCharges = useCallback(
    (urlPE: string, urlEXE: string, nomPE: string, nomEXE: string) =>
      new Promise<void>((resoudre, rejeter) => {
        const debut = Date.now();
        poserCalquesRef.current(urlPE, urlEXE, {
          recentrer: false,
          nomPE,
          nomEXE,
        });
        const verifier = () => {
          const pe = itemPERef.current;
          const exe = itemEXERef.current;
          if (pe?.getFullyLoaded() && exe?.getFullyLoaded()) return resoudre();
          if (Date.now() - debut > DELAI_POSE_MS) {
            return rejeter(new Error("les plans n'ont pas fini de se charger"));
          }
          requestAnimationFrame(verifier);
        };
        requestAnimationFrame(verifier);
      }),
    [itemPERef, itemEXERef]
  );

  return { urlsPoseesRef, poserCalques, poserCalquesRef, poserCalquesCharges };
}
