# OpenCV.js — copie locale

Fichier : `opencv.js`
Version : **4.9.0**
Source : <https://docs.opencv.org/4.9.0/opencv.js>

| Fichier | SHA-256 | Taille |
|---|---|---|
| amont (`opencv.js` d'origine) | `4d7b85e2…bda243a` | 10 257 309 o |
| `opencv.js` servi | `d24f5131f1a2d9dd03255a8fb4b506c6620a0964c29ce0901ca139602301de20` | 222 191 o |
| `opencv_js.wasm` servi | `46f08518e851ae420dc5df969d20a0961a5b03ce08beb74fa46f197cd8cfed3a` | 7 526 321 o |

Empreinte amont complète :
`4d7b85e2e12ea0bd088f491c311d620a45b53d1489b7f065b4492a230bda243a`

Les fichiers servis **ne sont pas** l'original bit pour bit : deux appels à
`new Function()` en ont été retirés et le binaire WebAssembly en a été sorti,
voir plus bas. Ils sont reproductibles par
`node public/vendor/opencv/preparer.mjs`, qui retélécharge l'amont, vérifie son
empreinte, applique les transformations et échoue si quoi que ce soit a bougé.

Effet secondaire agréable : sans le base64, le JavaScript passe de 9,8 Mo à
217 Ko et le total téléchargé de 9,8 à 7,4 Mo.

## Pourquoi une copie locale et pas le CDN

La CSP de l'application déclare `script-src 'self' 'unsafe-inline'`. Un
`<script src="https://docs.opencv.org/...">` serait **bloqué**. L'autoriser
reviendrait à exécuter, sur une page qui porte la session Supabase de
l'utilisateur, du code servi par un domaine tiers — exactement ce que le
durcissement de juillet 2026 cherchait à éviter (audit v3 : `unsafe-eval`
retiré, `object-src 'none'`).

Servi depuis `/vendor/opencv/opencv.js`, le fichier satisfait `'self'`, il est
figé sur une version et vérifiable par son empreinte.

## Le binaire WebAssembly est sorti du JavaScript

Le build officiel porte son `.wasm` en `data:` URI (`wasmBinaryFile`). Une
lecture rapide du code laisse croire qu'Emscripten évite alors le réseau
(`!isDataURI(wasmBinaryFile) && …`), mais la branche réellement empruntée est
`getBinaryPromise()`, qui **ne fait pas** cette vérification et appelle
`fetch()` sur l'URI de données. La CSP `connect-src 'self' …` la bloquait :

```
Fetch API cannot load data:application/octet-stream;base64,… Refused to
connect because it violates the document's Content Security Policy.
```

Le script d'installation extrait donc le binaire vers `opencv_js.wasm` et
remplace la valeur par un chemin relatif. Emscripten le résout via
`locateFile()` en `/vendor/opencv/opencv_js.wasm` : même domaine, donc couvert
par `'self'`, sans toucher à `connect-src`. Le navigateur peut en prime le
compiler en flux.

En revanche `WebAssembly.instantiate` exige **`'wasm-unsafe-eval'`** dans
`script-src` (cf. `next.config.ts`). Cette valeur n'autorise que la
compilation WebAssembly — elle ne réactive ni `eval()` ni `new Function()`.

## Les deux `new Function()` retirés

Le build officiel en contient deux, tous deux dans **Embind** :

1. `createNamedFunction` — ne servait qu'à donner un nom lisible à une fonction
   liée. Remplacé par `Object.defineProperty(body, "name", …)`.
2. `makeDynCaller` — fabriquait une trampoline d'arité fixe vers `dynCall`.
   Remplacé par une fermeture variadique, dont `length` et `name` sont rétablis
   au cas où un appelant s'y fierait.

Sans ce correctif, la CSP fait lever
`EvalError: Evaluating a string as JavaScript violates the following CSP
directive` et la bibliothèque ne s'initialise jamais.

**Ce n'est pas un bricolage** : Emscripten produit exactement ces deux
variantes quand on compile avec `-sDYNAMIC_EXECUTION=0`. Le procédé est prévu
en amont ; il n'est simplement pas activé dans le build publié sur
`docs.opencv.org`.

L'alternative aurait été d'ajouter `'unsafe-eval'` à `script-src`. Elle est
écartée : cette valeur a été retirée lors de l'audit de sécurité de juillet
2026 parce qu'elle transforme la moindre injection en exécution de code, sur
des pages qui portent la session Supabase de l'utilisateur.

## Mise à jour

Télécharger la version voulue, remplacer le fichier, mettre à jour la version
et l'empreinte ci-dessus :

```bash
node public/vendor/opencv/preparer.mjs
```

Pour une autre version, changer `VERSION` et `SHA_AMONT` dans `preparer.mjs`
après avoir relu que les deux motifs corrigés existent toujours à l'identique —
le script refuse de s'exécuter sinon, plutôt que de produire un fichier à
moitié corrigé.
