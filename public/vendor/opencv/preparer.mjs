/**
 * Télécharge OpenCV.js et le rend compatible avec la CSP de l'application.
 *
 *   node public/vendor/opencv/preparer.mjs
 *
 * Le build officiel d'OpenCV.js utilise `new Function(...)` à deux endroits,
 * tous deux dans Embind. La CSP de l'application déclare `script-src 'self'
 * 'unsafe-inline' 'wasm-unsafe-eval'` : sans `'unsafe-eval'`, ces deux appels
 * lèvent `EvalError` et la bibliothèque ne s'initialise pas.
 *
 * Plutôt que de rouvrir `'unsafe-eval'` — retiré lors de l'audit de sécurité
 * de juillet 2026 parce qu'il transforme la moindre injection en exécution de
 * code — on remplace ces deux sites par leurs équivalents sans évaluation.
 * C'est exactement ce que fait Emscripten lorsqu'on compile avec
 * `-sDYNAMIC_EXECUTION=0` ; le procédé est donc prévu en amont, pas bricolé.
 *
 * 1. `createNamedFunction` ne servait qu'à donner un nom lisible à une
 *    fonction liée. `Object.defineProperty` fait la même chose.
 * 2. `makeDynCaller` fabriquait une trampoline d'arité fixe. Une fermeture
 *    variadique appelle le même `dynCall` ; l'arité est rétablie sur la
 *    propriété `length`, au cas où un appelant s'y fierait.
 *
 * Le script sort par ailleurs le binaire WebAssembly, embarqué en `data:` URI
 * dans le build officiel, vers `opencv_js.wasm`. Emscripten le récupère par
 * `fetch()` **sans** vérifier qu'il s'agit d'une URI de données : la CSP
 * `connect-src 'self' …` bloquait donc son chargement. Servi comme un fichier
 * du même domaine, il passe sans toucher à `connect-src`, et le navigateur
 * peut le compiler en flux.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "4.9.0";
const SOURCE = `https://docs.opencv.org/${VERSION}/opencv.js`;
const DOSSIER = dirname(fileURLToPath(import.meta.url));
const CIBLE = join(DOSSIER, "opencv.js");
const CIBLE_WASM = join(DOSSIER, "opencv_js.wasm");

const SHA_AMONT =
  "4d7b85e2e12ea0bd088f491c311d620a45b53d1489b7f065b4492a230bda243a";

const CORRECTIFS = [
  {
    nom: "createNamedFunction",
    avant:
      'function createNamedFunction(name,body){name=makeLegalFunctionName(name);return new Function("body","return function "+name+"() {\\n"+\'    "use strict";\'+"    return body.apply(this, arguments);\\n"+"};\\n")(body)}',
    apres:
      'function createNamedFunction(name,body){try{Object.defineProperty(body,"name",{value:makeLegalFunctionName(name),configurable:true})}catch(e){}return body}',
  },
  {
    nom: "makeDynCaller",
    avant:
      'function makeDynCaller(dynCall){var args=[];for(var i=1;i<signature.length;++i){args.push("a"+i)}var name="dynCall_"+signature+"_"+rawFunction;var body="return function "+name+"("+args.join(", ")+") {\\n";body+="    return dynCall(rawFunction"+(args.length?", ":"")+args.join(", ")+");\\n";body+="};\\n";return new Function("dynCall","rawFunction",body)(dynCall,rawFunction)}',
    apres:
      'function makeDynCaller(dynCall){var arite=Math.max(0,signature.length-1);var appel=function(){var a=new Array(arguments.length+1);a[0]=rawFunction;for(var i=0;i<arguments.length;++i){a[i+1]=arguments[i]}return dynCall.apply(null,a)};try{Object.defineProperty(appel,"length",{value:arite,configurable:true});Object.defineProperty(appel,"name",{value:"dynCall_"+signature+"_"+rawFunction,configurable:true})}catch(e){}return appel}',
  },
];

function empreinte(contenu) {
  return createHash("sha256").update(contenu).digest("hex");
}

async function telecharger() {
  process.stdout.write(`Téléchargement de ${SOURCE}…\n`);
  const reponse = await fetch(SOURCE);
  if (!reponse.ok) {
    throw new Error(`Téléchargement impossible : HTTP ${reponse.status}`);
  }
  return Buffer.from(await reponse.arrayBuffer()).toString("utf8");
}

const amont = process.argv.includes("--local")
  ? readFileSync(CIBLE, "utf8")
  : await telecharger();

const empreinteAmont = empreinte(amont);
if (!process.argv.includes("--local") && empreinteAmont !== SHA_AMONT) {
  throw new Error(
    `Le fichier amont a changé (SHA-256 ${empreinteAmont}, attendu ${SHA_AMONT}).\n` +
      "Vérifiez la version, puis mettez à jour SHA_AMONT après relecture."
  );
}

let corrige = amont;
for (const correctif of CORRECTIFS) {
  const occurrences = corrige.split(correctif.avant).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `Correctif « ${correctif.nom} » : ${occurrences} occurrence(s) trouvée(s), 1 attendue.`
    );
  }
  corrige = corrige.replace(correctif.avant, correctif.apres);
}

const restants = (corrige.match(/new Function\(/g) ?? []).length;
if (restants !== 0) {
  throw new Error(`Il reste ${restants} appel(s) à new Function().`);
}

// Extraction du binaire WebAssembly hors du fichier JavaScript.
const motifWasm =
  /wasmBinaryFile\s*=\s*"data:application\/octet-stream;base64,([A-Za-z0-9+/=]+)"/;
const trouve = corrige.match(motifWasm);
if (!trouve) {
  throw new Error(
    "Binaire WebAssembly introuvable : le build n'embarque plus de data: URI ?"
  );
}

const wasm = Buffer.from(trouve[1], "base64");
if (wasm.subarray(0, 4).toString("binary") !== "\0asm") {
  throw new Error("Le binaire extrait ne porte pas la signature WebAssembly.");
}
writeFileSync(CIBLE_WASM, wasm);

corrige = corrige.replace(motifWasm, 'wasmBinaryFile="opencv_js.wasm"');

writeFileSync(CIBLE, corrige);

process.stdout.write(
  [
    `OpenCV.js ${VERSION} préparé.`,
    `  amont      : ${empreinteAmont}`,
    `  opencv.js  : ${empreinte(corrige)} (${Buffer.byteLength(corrige)} octets)`,
    `  .wasm      : ${empreinte(wasm)} (${wasm.length} octets)`,
    "",
  ].join("\n")
);
