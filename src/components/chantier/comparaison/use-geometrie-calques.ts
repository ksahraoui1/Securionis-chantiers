"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type OpenSeadragonNS from "openseadragon";
import {
  bornerEchelle,
  bornerRotation,
  calculerOperations,
  decalageApresEchelle,
  type EtatGeometrie,
  type Point,
} from "./geometrie-calques";

type OSDStatic = typeof OpenSeadragonNS;
type Viewer = OpenSeadragonNS.Viewer;
type TiledImage = OpenSeadragonNS.TiledImage;

interface Refs {
  viewerRef: React.RefObject<Viewer | null>;
  osdRef: React.RefObject<OSDStatic | null>;
  itemPERef: React.RefObject<TiledImage | null>;
  itemEXERef: React.RefObject<TiledImage | null>;
}

/**
 * Géométrie des deux calques : opacités, ordre, recalage, échelle, rotation.
 *
 * La décision est prise par `geometrie-calques.ts`, module pur et éprouvé ;
 * ce hook ne fait que la porter à OpenSeadragon et tenir l'état de
 * l'interface. C'est la partie du module de comparaison qui a produit le plus
 * de pièges, d'où la séparation.
 */
export function useGeometrieCalques({ viewerRef, osdRef, itemPERef, itemEXERef }: Refs) {
  const [opacitePE, setOpacitePE] = useState(100);
  const [opaciteEXE, setOpaciteEXE] = useState(50);
  const [split, setSplit] = useState(false);
  const [inverse, setInverse] = useState(false);
  const [synchro, setSynchro] = useState(true);
  const [decalage, setDecalage] = useState<Point>({ x: 0, y: 0 });

  /**
   * Largeur du calque du dessus en unités monde. Les deux plans sont posés à
   * 1 de large : un plan au 1:50 doit donc être ramené autour de 0,5 pour se
   * superposer à un 1:100 du même ouvrage.
   */
  const [echelleCalque, setEchelleCalque] = useState(1);

  /**
   * Rotation du calque du dessus, en degrés.
   *
   * Deux dessins du même ouvrage ne sont pas toujours orientés pareil : un
   * plan d'exécution est couramment tourné pour tenir sur la feuille, ou pour
   * mettre le nord dans un coin. Translation et échelle ne rattrapent pas cela
   * — et la détection compare les calques tels qu'ils sont superposés.
   */
  const [rotationCalque, setRotationCalque] = useState(0);

  /** Décalage en cours de glissement, avant d'être commité en état. */
  const decalageRef = useRef<Point>({ x: 0, y: 0 });

  const etat: EtatGeometrie = {
    inverse,
    split,
    opacitePE,
    opaciteEXE,
    decalage,
    echelleCalque,
    rotationCalque,
  };

  const appliquerCalques = useCallback(() => {
    const viewer = viewerRef.current;
    const OSD = osdRef.current;
    const pe = itemPERef.current;
    const exe = itemEXERef.current;
    if (!viewer || !OSD || !pe || !exe) return;

    const ops = calculerOperations({
      inverse,
      split,
      opacitePE,
      opaciteEXE,
      decalage,
      echelleCalque,
      rotationCalque,
    });
    const calques = { pe, exe };

    viewer.world.setItemIndex(calques[ops.dessous], 0);
    viewer.world.setItemIndex(calques[ops.dessus], 1);

    // ⚠️ L'ordre compte, et il n'est pas capturé par les valeurs elles-mêmes :
    // la largeur d'abord, car `setWidth` conserve le coin supérieur gauche,
    // que `setPosition` fixe juste après ; la rotation en dernier, car elle
    // pivote autour du centre des bornes non tournées, lequel dépend des deux
    // premières. Ce pivot au centre est aussi ce qui dispense de recentrer,
    // contrairement à `setWidth`.
    //
    // Le calque du dessous est traité avant celui du dessus, comme à l'origine.
    for (const plan of [ops.dessous, ops.dessus]) {
      const r = ops[plan];
      const calque = calques[plan];
      calque.setOpacity(r.opacite);
      if (r.largeur !== null) calque.setWidth(r.largeur);
      calque.setPosition(new OSD.Point(r.position.x, r.position.y));
      calque.setRotation(r.rotation);
    }
  }, [
    viewerRef,
    osdRef,
    itemPERef,
    itemEXERef,
    inverse,
    split,
    opacitePE,
    opaciteEXE,
    decalage,
    echelleCalque,
    rotationCalque,
  ]);

  /**
   * Référence toujours à jour, pour appeler la fonction depuis les rappels
   * d'OpenSeadragon, enregistrés une seule fois à l'initialisation.
   *
   * ⚠️ L'écriture se fait dans un effet, jamais pendant le rendu : React peut
   * rendre un composant sans le valider (rendu concurrent, StrictMode), et une
   * ref mutée pendant le rendu part alors en avance sur l'état affiché. Le
   * rappel `success` d'`addTiledImage` est asynchrone — l'image doit charger —
   * donc la ref est à jour bien avant qu'il ne s'exécute.
   */
  const appliquerCalquesRef = useRef(appliquerCalques);
  useEffect(() => {
    appliquerCalquesRef.current = appliquerCalques;
  }, [appliquerCalques]);

  function reinitialiserRecalage() {
    decalageRef.current = { x: 0, y: 0 };
    setDecalage({ x: 0, y: 0 });
    setEchelleCalque(1);
    setRotationCalque(0);
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
    const facteurBorne = bornerEchelle(nouvelle);

    if (viewer && echelleCalque > 0) {
      const centre = viewer.viewport.getCenter(true);
      const suivant = decalageApresEchelle(
        { x: centre.x, y: centre.y },
        decalage,
        echelleCalque,
        facteurBorne
      );
      decalageRef.current = suivant;
      setDecalage(suivant);
    }

    setEchelleCalque(facteurBorne);
  }

  /**
   * Fait pivoter le calque du dessus.
   *
   * Aucun recentrage à prévoir : `setRotation` pivote autour du centre des
   * bornes non tournées de l'image, qui ne bouge pas. C'est la différence avec
   * `setWidth`, qui conserve le coin supérieur gauche.
   */
  function changerRotationCalque(degres: number) {
    setRotationCalque(bornerRotation(degres));
  }

  return {
    etat,
    opacitePE,
    setOpacitePE,
    opaciteEXE,
    setOpaciteEXE,
    split,
    setSplit,
    inverse,
    setInverse,
    synchro,
    setSynchro,
    decalage,
    setDecalage,
    decalageRef,
    echelleCalque,
    setEchelleCalque,
    rotationCalque,
    setRotationCalque,
    appliquerCalques,
    appliquerCalquesRef,
    reinitialiserRecalage,
    changerEchelleCalque,
    changerRotationCalque,
  };
}
