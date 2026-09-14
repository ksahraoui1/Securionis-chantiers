/**
 * Prépare OpenCV 4.9.0 depuis la distribution officielle vérifiée par SHA-256.
 * Quatre fonctions Embind sont remplacées sans eval ni constructeur Function.
 * craftInvokerFunction adapte DYNAMIC_EXECUTION=0 d’Emscripten 3.1.51.
 * Le WASM reste inchangé ; le nouveau nom JS invalide les anciens caches.
 * Voir LISEZ-MOI.md pour les sources et les tests.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "4.9.0";
const SOURCE = `https://docs.opencv.org/${VERSION}/opencv.js`;
const DOSSIER = dirname(fileURLToPath(import.meta.url));
const CIBLE = join(DOSSIER, "opencv-csp.js");
const CIBLE_WASM = join(DOSSIER, "opencv_js.wasm");

const SHA_AMONT =
  "4d7b85e2e12ea0bd088f491c311d620a45b53d1489b7f065b4492a230bda243a";

const CORRECTIFS = [
  { nom: "__emval_get_method_caller", avant: "function __emval_get_method_caller(argCount,argTypes){var types=__emval_lookupTypes(argCount,argTypes);var retType=types[0];var signatureName=retType.name+\"_$\"+types.slice(1).map(function(t){return t.name}).join(\"_\")+\"$\";var params=[\"retType\"];var args=[retType];var argsList=\"\";for(var i=0;i<argCount-1;++i){argsList+=(i!==0?\", \":\"\")+\"arg\"+i;params.push(\"argType\"+i);args.push(types[1+i])}var functionName=makeLegalFunctionName(\"methodCaller_\"+signatureName);var functionBody=\"return function \"+functionName+\"(handle, name, destructors, args) {\\n\";var offset=0;for(var i=0;i<argCount-1;++i){functionBody+=\"    var arg\"+i+\" = argType\"+i+\".readValueFromPointer(args\"+(offset?\"+\"+offset:\"\")+\");\\n\";offset+=types[i+1][\"argPackAdvance\"]}functionBody+=\"    var rv = handle[name](\"+argsList+\");\\n\";for(var i=0;i<argCount-1;++i){if(types[i+1][\"deleteObject\"]){functionBody+=\"    argType\"+i+\".deleteObject(arg\"+i+\");\\n\"}}if(!retType.isVoid){functionBody+=\"    return retType.toWireType(destructors, rv);\\n\"}functionBody+=\"};\\n\";params.push(functionBody);var invokerFunction=new_(Function,params).apply(null,args);return __emval_addMethodCaller(invokerFunction)}", apres: "function __emval_get_method_caller(argCount,argTypes){var types=__emval_lookupTypes(argCount,argTypes),retType=types[0];return __emval_addMethodCaller(function(handle,name,destructors,args){var values=[],offset=0;for(var i=1;i<argCount;i++){values.push(types[i].readValueFromPointer(args+offset));offset+=types[i].argPackAdvance}var rv=handle[name].apply(handle,values);for(var i=1;i<argCount;i++){if(types[i].deleteObject){types[i].deleteObject(values[i-1])}}if(!retType.isVoid){return retType.toWireType(destructors,rv)}})}" },
  { nom: "craftInvokerFunction", avant: "function craftInvokerFunction(humanName,argTypes,classType,cppInvokerFunc,cppTargetFunc){var argCount=argTypes.length;if(argCount<2){throwBindingError(\"argTypes array size mismatch! Must at least get return value and 'this' types!\")}var isClassMethodFunc=argTypes[1]!==null&&classType!==null;var needsDestructorStack=false;for(var i=1;i<argTypes.length;++i){if(argTypes[i]!==null&&argTypes[i].destructorFunction===undefined){needsDestructorStack=true;break}}var returns=argTypes[0].name!==\"void\";var argsList=\"\";var argsListWired=\"\";for(var i=0;i<argCount-2;++i){argsList+=(i!==0?\", \":\"\")+\"arg\"+i;argsListWired+=(i!==0?\", \":\"\")+\"arg\"+i+\"Wired\"}var invokerFnBody=\"return function \"+makeLegalFunctionName(humanName)+\"(\"+argsList+\") {\\n\"+\"if (arguments.length !== \"+(argCount-2)+\") {\\n\"+\"throwBindingError('function \"+humanName+\" called with ' + arguments.length + ' arguments, expected \"+(argCount-2)+\" args!');\\n\"+\"}\\n\";if(needsDestructorStack){invokerFnBody+=\"var destructors = [];\\n\"}var dtorStack=needsDestructorStack?\"destructors\":\"null\";var args1=[\"throwBindingError\",\"invoker\",\"fn\",\"runDestructors\",\"retType\",\"classParam\"];var args2=[throwBindingError,cppInvokerFunc,cppTargetFunc,runDestructors,argTypes[0],argTypes[1]];if(isClassMethodFunc){invokerFnBody+=\"var thisWired = classParam.toWireType(\"+dtorStack+\", this);\\n\"}for(var i=0;i<argCount-2;++i){invokerFnBody+=\"var arg\"+i+\"Wired = argType\"+i+\".toWireType(\"+dtorStack+\", arg\"+i+\"); // \"+argTypes[i+2].name+\"\\n\";args1.push(\"argType\"+i);args2.push(argTypes[i+2])}if(isClassMethodFunc){argsListWired=\"thisWired\"+(argsListWired.length>0?\", \":\"\")+argsListWired}invokerFnBody+=(returns?\"var rv = \":\"\")+\"invoker(fn\"+(argsListWired.length>0?\", \":\"\")+argsListWired+\");\\n\";if(needsDestructorStack){invokerFnBody+=\"runDestructors(destructors);\\n\"}else{for(var i=isClassMethodFunc?1:2;i<argTypes.length;++i){var paramName=i===1?\"thisWired\":\"arg\"+(i-2)+\"Wired\";if(argTypes[i].destructorFunction!==null){invokerFnBody+=paramName+\"_dtor(\"+paramName+\"); // \"+argTypes[i].name+\"\\n\";args1.push(paramName+\"_dtor\");args2.push(argTypes[i].destructorFunction)}}}if(returns){invokerFnBody+=\"var ret = retType.fromWireType(rv);\\n\"+\"return ret;\\n\"}else{}invokerFnBody+=\"}\\n\";args1.push(invokerFnBody);var invokerFunction=new_(Function,args1).apply(null,args2);return invokerFunction}", apres: "function craftInvokerFunction(humanName,argTypes,classType,cppInvokerFunc,cppTargetFunc){\n var argCount=argTypes.length;\n if(argCount<2){throwBindingError(\"argTypes array size mismatch!\")}\n var isClassMethodFunc=argTypes[1]!==null&&classType!==null;\n var needsDestructorStack=false;\n for(var i=1;i<argCount;i++){if(argTypes[i]!==null&&argTypes[i].destructorFunction===undefined){needsDestructorStack=true;break}}\n var expectedArgCount=argCount-2;\n var invokerFn=function(){\n  if(arguments.length!==expectedArgCount){throwBindingError(\"function \"+humanName+\" called with \"+arguments.length+\" arguments, expected \"+expectedArgCount)}\n  var destructors=[],argsWired=[],invokerArgs=[cppTargetFunc],thisWired;\n  if(isClassMethodFunc){thisWired=argTypes[1].toWireType(destructors,this);invokerArgs.push(thisWired)}\n  for(var i=0;i<expectedArgCount;i++){argsWired[i]=argTypes[i+2].toWireType(destructors,arguments[i]);invokerArgs.push(argsWired[i])}\n  var rv=cppInvokerFunc.apply(null,invokerArgs);\n  if(needsDestructorStack){runDestructors(destructors)}else{\n   for(var i=isClassMethodFunc?1:2;i<argCount;i++){if(argTypes[i].destructorFunction!==null){argTypes[i].destructorFunction(i===1?thisWired:argsWired[i-2])}}\n  }\n  if(argTypes[0].name!==\"void\"){return argTypes[0].fromWireType(rv)}\n };\n try{Object.defineProperty(invokerFn,\"length\",{value:expectedArgCount,configurable:true})}catch(e){}\n return createNamedFunction(humanName,invokerFn)\n}" },
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

const restants = (corrige.match(/new Function\(|new_\(Function|eval\(/g) ?? []).length;
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
