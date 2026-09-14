# OpenCV 4.9.0 sans évaluation dynamique JavaScript

Le fichier servi est `opencv-csp.js`. Son nouveau nom évite de reprendre le JavaScript ancien encore en cache. Le binaire `opencv_js.wasm` est identique.

`node public/vendor/opencv/preparer.mjs` télécharge la distribution officielle, vérifie son SHA-256, applique quatre remplacements exacts et extrait le binaire. Il refuse un changement de source ou une occurrence inattendue. Les fonctions `createNamedFunction`, `makeDynCaller` `craftInvokerFunction` et `__emval_get_method_caller` utilisent des fermetures. `craftInvokerFunction` adapte le chemin `DYNAMIC_EXECUTION=0` d’Emscripten 3.1.51, avec tableaux locaux à chaque appel pour éviter leur partage réentrant. Le build OpenCV utilise des appels synchrones.

Source : https://github.com/emscripten-core/emscripten/blob/3.1.51/src/embind/embind.js

La CSP autorise la compilation WebAssembly (`wasm-unsafe-eval`), sans `unsafe-eval` JavaScript ni scripts inline sans nonce. `node tests/opencv-no-eval.cjs` charge le véritable binaire avec les chaînes exécutables interdites, puis vérifie les matrices, conversion couleur, seuillage et ORB. Le test navigateur complète ce contrôle avec la CSP HTTP réelle.
