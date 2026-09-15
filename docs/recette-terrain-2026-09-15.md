# Recette terrain — 15 septembre 2026

## État

**Isolation HTTP : validée pour le périmètre ci-dessous. Recette physique : en attente des manipulations et observations de l’utilisateur.** Une émulation de téléphone ou un test SQL ne vaut pas une validation sur iPhone/iPad.

Contrôle HTTP terminé à 08:18:25 UTC. Référence de l’exécution : `5a95df68-527f-48bf-a6da-fa12c8a09dcf`. Dépôt VPS : `b6604a4f5da7ed1e74fe0382a13ce2b054b229ad`. Image applicative : `sha256:ceaf76a7e786e99dda843cc2945d8b7b9855a577a55c2c918f9d0f8e3fa5d323` (application du lot 31 ; lot 32 documentaire et outils).

## Accès réels entre deux entreprises

Deux entreprises fictives temporaires A/B ont chacune reçu un compte administrateur, un chantier, une NC fictive sans suivi correctif et un petit fichier PDF synthétique privé. Les requêtes ont ciblé les services de production GoTrue, PostgREST, Storage et l’API du SaaS.

Les comptes ont utilisé une authentification par mot de passe, puis un véritable enrôlement et une vérification TOTP. Les jetons ont été émis par GoTrue ; aucun JWT n’a été fabriqué. Les contrôles d’accès Supabase ont utilisé la clé publique et le jeton de l’utilisateur concerné. Le rôle serveur a servi uniquement à préparer et nettoyer les données de cette exécution. L’API Next.js a reçu les cookies de ces sessions réelles.

Chaque ligne du tableau a été vérifiée dans les deux sens, A vers B et B vers A : **15 contrôles par compte, soit 30 réussites**.

| Contrôle par compte | Résultat observé |
| --- | --- |
| Connexion et vérification TOTP | Jetons du bon compte, niveaux `aal1` puis `aal2` |
| Lecture des entreprises | HTTP 200, uniquement l’entreprise propre parmi les deux identifiants testés |
| Lecture des profils | HTTP 200, uniquement le profil propre parmi les deux identifiants testés |
| Lecture des chantiers | HTTP 200, uniquement le chantier propre parmi les deux identifiants testés |
| Lecture des NC | HTTP 200, uniquement la NC propre parmi les deux identifiants testés |
| Modification du chantier étranger | HTTP 200, aucune ligne modifiée |
| Affectation au chantier étranger | HTTP 403 |
| Lecture du fichier propre | HTTP 200, octets identiques au fichier synthétique |
| Lecture du fichier étranger | HTTP 400, aucun contenu du fichier servi |
| Dépôt dans le chantier étranger | HTTP 400 |
| `GET /api/ecarts/{id}/statut`, NC propre | HTTP 200, identifiant attendu |
| Même API, NC étrangère | HTTP 404 |
| Ancien jeton `aal1` après activation MFA, chantier propre | HTTP 200, aucune ligne visible |
| Ancien jeton `aal1`, fichier propre | HTTP 400 |
| Ancien jeton `aal1`, API propre | HTTP 403, code `MFA_REQUIRED` |

Les données de ces deux entreprises, leurs comptes Auth et leurs fichiers ont été supprimés à la fin du test. Une lecture privilégiée distincte a ensuite confirmé l’absence des huit lignes principales, des deux utilisateurs Auth et des quatre chemins Storage (deux fichiers et deux tentatives de dépôt refusées). Aucun suivi correctif, email, rapport de visite ou sauvegarde de fichier métier n’a été produit par cette exécution. Les journaux techniques des services peuvent conserver la trace normale des opérations.

**Limites :** ce contrôle connecté couvre deux administrateurs de sociétés fictives, les quatre tables mentionnées, les documents du bucket `rapports` et une API de consultation. Il ne remplace pas la matrice SQL existante des rôles inspecteur/invité, des autres tables et des RPC. Il ne valide pas à lui seul les pièces correctives, tous les écrans, le changement de compte sur appareil physique ou la résistance à toutes les attaques.

## Parcours physique à réaliser

Une visite en brouillon a été préparée dans le chantier **RECETTE MOBILE — 15 septembre 2026**, avec le point **Test1**, dans l’entreprise de l’utilisateur. Elle est distincte des fixtures HTTP supprimées. L’utilisateur a indiqué disposer d’un iPhone ou d’un iPad ; le modèle, la version iOS/iPadOS et le mode Safari/application installée ne sont pas encore confirmés.

Au relevé serveur de 08:22 UTC, cette visite est **en cours** et contient une réponse « Non conforme », sans remarque ni photo (horodatage de la réponse : 08:13:16 UTC). Ce relevé constitue un point de comparaison ; il ne prouve ni l’appareil utilisé, ni une coupure réseau, ni une synchronisation après coupure. Une confirmation de l’utilisateur est attendue avant de poursuivre le scénario physique.

| Étape | Action et preuve attendue | État |
| --- | --- | --- |
| Préchargement | Ouvrir la visite avec le réseau, sélectionner Test1 et commencer le contrôle ; vérifier la lisibilité et les commandes tactiles | À confirmer sur appareil |
| Coupure | Activer le mode avion et désactiver explicitement le Wi-Fi ; conserver la page chargée | À réaliser |
| Saisie locale | Choisir « Remarques », saisir un texte de recette unique et prendre une photo d’un objet neutre ; attendre la confirmation d’enregistrement local | À réaliser |
| Contrôle hors ligne | Vérifier que la saisie reste visible et que la réponse n’a pas encore atteint le serveur | À réaliser |
| Reprise | Réactiver le réseau ; attendre la synchronisation, contrôler côté serveur une seule réponse avec le texte exact et une photo lisible | À réaliser |
| Réouverture | Recharger avec le réseau puis vérifier la conservation de la réponse et de la photo, sans doublon | À réaliser |
| Tablette / second contexte | Répéter sur l’autre appareil si disponible ; tester séparément le mode installé si utilisé sur le terrain | À réaliser selon disponibilité |

Ne pas clôturer cette visite ni envoyer un rapport pendant la recette. Relever l’heure, le navigateur, les messages affichés et toute anomalie. Les observations rapportées par l’utilisateur et les vérifications serveur doivent être identifiées séparément dans le procès-verbal final. Après la recette, archiver le chantier fictif selon le parcours normal.

Le démarrage à froid sans réseau n’est pas promis par le lot 31. La fermeture hors ligne, la reprise d’un brouillon correctif avec fichier et les conflits doivent faire l’objet de scénarios distincts si ces parcours sont utilisés sur le terrain ; ne pas les déclarer couverts par la seule synchronisation d’une réponse de visite.

## Points indépendants restant ouverts

La restauration dans un nouveau projet Supabase facturé et le transfert chiffré des fichiers privés vers le VPS restent en attente des autorisations explicites déjà demandées. La recette HTTP ci-dessus ne vaut pas restauration de sauvegarde et ne déclenche aucune de ces opérations.
