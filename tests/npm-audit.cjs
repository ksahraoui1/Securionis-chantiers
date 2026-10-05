#!/usr/bin/env node
// Contrôle des dépendances de la CI : `npm audit --audit-level=moderate`, avec
// une liste d'exemptions **nominatives**, chacune justifiée et datée.
//
// `npm audit` n'a aucune option d'exemption : un avis sans version corrigée
// bloquerait donc la CI indéfiniment, et la seule issue serait d'abaisser le
// seuil pour toutes les dépendances. Ici, une vulnérabilité n'est tolérée que si
// **toutes** ses causes racines sont des avis exemptés ; tout autre avis de
// gravité modérée ou plus fait échouer la CI, exactement comme avant.
//
// Retirer une exemption dès qu'une version corrigée existe : le script le
// signale lui-même quand un avis exempté n'est plus rapporté.
"use strict";

const { execFileSync } = require("node:child_process");

const EXEMPTIONS = {
  // braces ≤ 3.0.3, déni de service par motif profondément imbriqué.
  // Aucune version corrigée publiée (3.0.3 est la dernière). Chaîne :
  // eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch →
  // braces, donc outillage de lint uniquement : absent de l'image de
  // production (`output: "standalone"`), et les motifs ne viennent que du
  // dépôt. Exempté le 5 octobre 2026.
  "GHSA-vfj7-8cjw-p6xm": "braces — aucun correctif, lint seulement",
};

const NIVEAUX = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

let brut;
try {
  brut = execFileSync("npm", ["audit", "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
} catch (e) {
  // npm audit sort en 1 dès qu'il trouve quelque chose : le JSON est sur stdout.
  brut = e.stdout;
}
if (!brut) {
  console.error("npm audit n'a rien renvoyé.");
  process.exit(1);
}
const vulns = JSON.parse(brut).vulnerabilities ?? {};

// Causes racines d'un paquet : les avis qu'il porte lui-même, plus ceux de ses
// dépendances vulnérables (les entrées `via` qui sont des noms de paquets).
const memo = new Map();
function racines(nom, pile = new Set()) {
  if (memo.has(nom)) return memo.get(nom);
  if (pile.has(nom)) return new Set();
  pile.add(nom);
  const res = new Set();
  for (const via of vulns[nom]?.via ?? []) {
    if (typeof via === "string") for (const r of racines(via, pile)) res.add(r);
    else res.add(via.url?.split("/").pop() ?? String(via.source));
  }
  memo.set(nom, res);
  return res;
}

const bloquants = [];
const exemptesVus = new Set();
for (const [nom, v] of Object.entries(vulns)) {
  if (NIVEAUX[v.severity] < NIVEAUX.moderate) continue;
  const causes = [...racines(nom)];
  const nonExemptes = causes.filter((c) => !EXEMPTIONS[c]);
  causes.filter((c) => EXEMPTIONS[c]).forEach((c) => exemptesVus.add(c));
  if (nonExemptes.length > 0 || causes.length === 0) {
    bloquants.push(`${nom} (${v.severity}) : ${nonExemptes.join(", ") || "cause inconnue"}`);
  }
}

for (const id of exemptesVus) console.log(`Exempté : ${id} — ${EXEMPTIONS[id]}`);
for (const id of Object.keys(EXEMPTIONS)) {
  if (!exemptesVus.has(id)) console.log(`⚠️ ${id} n'est plus rapporté : retirer l'exemption.`);
}

if (bloquants.length > 0) {
  console.error("Vulnérabilités de gravité modérée ou plus :");
  for (const b of bloquants) console.error(`  - ${b}`);
  console.error("Lancer `npm audit` pour le détail.");
  process.exit(1);
}
console.log("Audit des dépendances : aucune vulnérabilité modérée ou plus hors exemptions.");
