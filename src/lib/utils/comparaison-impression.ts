/**
 * Document imprimable de la comparaison des plans.
 *
 * Une page A4 paysage : en-tête, puis la capture de la vue. Une seconde page
 * porte le tableau des annotations lorsqu'il y en a.
 *
 * ⚠️ La capture doit être bornée sur ses **deux** dimensions. Avec le seul
 * `width: 100%`, une capture au ratio 944/844 réclame 248 mm de haut sur les
 * 277 mm de large utiles, pour 190 mm disponibles : elle ne tient ni sous le
 * titre ni sur une page, et se coupe en deux.
 */

export interface AnnotationImpression {
  numero: number;
  type: string;
  couleur: string;
  hex: string;
  commentaire: string | null;
  numeroNC: number | null;
}

export interface DocumentImpression {
  chantierNom: string;
  titrePE: string;
  titreEXE: string;
  pagePE: number;
  pageEXE: number;
  imageUrl: string;
  annotations: AnnotationImpression[];
}

// A4 paysage 297 × 210 mm, marges de page 10 mm : 277 × 190 mm utiles, dont
// environ 14 pour l'en-tête. Valeur de rupture mesurée sur Chrome : à 176 mm
// la capture bascule sur une seconde page. 168 laisse 8 mm de sécurité pour
// les en-têtes et pieds de page du navigateur et les autres moteurs de rendu.
const HAUTEUR_MAX_IMAGE_MM = 168;

export function echapperHtml(valeur: string): string {
  return valeur
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ligneAnnotation(annotation: AnnotationImpression): string {
  return `<tr>
    <td class="num">${annotation.numero}</td>
    <td>${echapperHtml(annotation.type)}</td>
    <td class="nowrap"><span class="pastille" style="background:${echapperHtml(
      annotation.hex
    )}"></span>${echapperHtml(annotation.couleur)}</td>
    <td>${
      annotation.commentaire?.trim()
        ? echapperHtml(annotation.commentaire.trim())
        : "&mdash;"
    }</td>
    <td class="nowrap">${
      annotation.numeroNC ? `Oui &mdash; NC #${annotation.numeroNC}` : "Non"
    }</td>
  </tr>`;
}

export function construireDocumentImpression({
  chantierNom,
  titrePE,
  titreEXE,
  pagePE,
  pageEXE,
  imageUrl,
  annotations,
}: DocumentImpression): string {
  const titre = `Comparaison des plans — ${chantierNom}`;
  const nombre = annotations.length;
  const date = new Date().toLocaleDateString("fr-CH");

  const tableau = nombre
    ? `<section class="annotations">
        <h2>Différences annotées (${nombre})</h2>
        <table>
          <thead>
            <tr>
              <th class="num">N°</th><th>Type</th><th>Couleur</th>
              <th>Commentaire</th><th>Liée à une NC</th>
            </tr>
          </thead>
          <tbody>${annotations.map(ligneAnnotation).join("")}</tbody>
        </table>
        <p class="total">Total des différences annotées : ${nombre}</p>
      </section>`
    : "";

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>${echapperHtml(titre)}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: Helvetica, Arial, sans-serif;
    color: #002855;
    /* Sans cela, les navigateurs suppriment les aplats à l'impression :
       les pastilles de couleur et les filets disparaîtraient. */
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .entete {
    border-bottom: 1.5pt solid #002855;
    padding-bottom: 2mm;
    margin-bottom: 3mm;
  }
  h1 { font-size: 12pt; margin: 0 0 1.5mm; }
  .infos {
    font-size: 8pt;
    color: #4b5563;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 1mm 5mm;
  }
  .infos span { white-space: nowrap; }
  .pe { color: #2E7D32; font-weight: 700; }
  .exe { color: #E67E22; font-weight: 700; }

  figure { margin: 0; text-align: center; break-inside: avoid; page-break-inside: avoid; }
  figure img {
    max-width: 100%;
    max-height: ${HAUTEUR_MAX_IMAGE_MM}mm;
    width: auto;
    height: auto;
    border: 0.3mm solid #d1d5db;
  }

  .annotations { break-before: page; page-break-before: always; }
  h2 { font-size: 11pt; margin: 0 0 3mm; }
  table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  th {
    background: #f3f4f6;
    border-bottom: 0.6pt solid #9ca3af;
    text-align: left;
    padding: 1.5mm 2mm;
    font-size: 8pt;
    color: #374151;
  }
  td { border-bottom: 0.3pt solid #e5e7eb; padding: 1.5mm 2mm; vertical-align: top; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  thead { display: table-header-group; }
  .num { width: 10mm; }
  .nowrap { white-space: nowrap; }
  .pastille {
    display: inline-block;
    width: 2.4mm; height: 2.4mm;
    border-radius: 50%;
    margin-right: 1.5mm;
    vertical-align: middle;
  }
  .total {
    margin: 4mm 0 0;
    padding: 2mm 3mm;
    background: #f3f4f6;
    border-left: 1mm solid #002855;
    font-weight: 700;
    font-size: 9.5pt;
  }
</style></head>
<body>
  <div class="entete">
    <h1>${echapperHtml(titre)}</h1>
    <p class="infos">
      <span><span class="pe">PE</span> ${echapperHtml(titrePE)} — page ${pagePE}</span>
      <span><span class="exe">EXE</span> ${echapperHtml(titreEXE)} — page ${pageEXE}</span>
      <span>${nombre} annotation${nombre > 1 ? "s" : ""}</span>
      <span>${echapperHtml(date)}</span>
    </p>
  </div>

  <figure>
    <img src="${echapperHtml(imageUrl)}" alt="Comparaison des plans">
  </figure>

  ${tableau}
</body></html>`;
}
