# Fonctionnalités — Securionis Chantiers

> Dernière mise à jour : 2026-09-14 (huitième lot de corrections de sécurité)

## Sécurité des sessions et des rapports

Le lot du 13 septembre 2026 couvre le MFA (S01), les références de rapports (S02), les images PDF (S03), la suppression d’une visite (S04), la conservation de la file hors ligne (partie de S07) et la compatibilité de l’export ZIP (A02).

- **Session complète** : toute API appelle `requireApiUser` avant les droits métier ou les services privilégiés. Un compte avec facteur vérifié doit présenter `aal2`. Un compte sans facteur conserve le parcours existant d’enrôlement. Les erreurs Auth donnent 401, le second facteur manquant 403 avec `MFA_REQUIRED`, et une vérification indisponible 503. Les pages serveur utilisent la même décision.
- **Base et stockage** : `session_mfa_valide()` relit les facteurs vérifiés du compte courant. La migration 055 ajoute une politique restrictive à chaque table RLS du schéma public et à `storage.objects`. Une nouvelle table doit recevoir cette même politique. Les règles métier restent nécessaires ; le contrôle MFA n’accorde pas de nouveau droit.
- **Références de rapports** : la migration 056 interdit aux clients de définir ou de modifier `visites.rapport_url`, ainsi que de déplacer une visite vers un autre chantier. Le serveur génère les nouveaux fichiers sous `<chantier>/visites/<UUID complet>/rapport.pdf`. Les anciens chemins sont lus seulement s’ils correspondent au chantier, à la date et à l’identifiant attendu. Une référence incohérente demande une nouvelle génération.
- **Lecture et envoi** : la page de rapport, l’envoi email et l’export utilisent les droits Storage de l’utilisateur. Le stockage privé n’est plus signé ou téléchargé avec `service_role` depuis une référence libre. Le ZIP accepte anciens et nouveaux chemins et contient un manifeste des éléments inclus et refusés.
- **Images PDF** : photos et logos proviennent uniquement des buckets du projet configuré en HTTPS. Le SDK télécharge avec les droits de l’utilisateur et sans redirection ; le moteur PDF reçoit des données PNG/JPEG en mémoire. Les limites sont 10 Mo par image, 40 Mo au total et 200 images, avec délai de 15 secondes par téléchargement. Une image interdite ou inaccessible interrompt la génération, sans produire silencieusement un rapport incomplet.
- **Suppression** : `supprimer_visite_brouillon` vérifie MFA, rôle ou rattachement actuel, puis verrouille et supprime les lignes dans une transaction. Être l’auteur historique ne suffit pas après retrait du chantier. Une visite terminée est refusée. Le serveur nettoie ensuite les photos et le seul chemin de rapport dérivé de l’UUID complet ; un ancien fichier ambigu est conservé et journalisé pour revue séparée.
- **Hors ligne** : une lecture en erreur, une visite invisible ou un conflit plus récent côté serveur conserve les éléments en attente. Aucune absence de résultat RLS ne prouve une suppression. Le service worker passe à v8 pour renouveler les assets. Une interface de résolution des conflits et l’isolation du cache par compte restent à réaliser.

### Vérifications du lot

`npm run test:security` teste les gardes des 18 routes, les références de fichiers, les refus réseau, les limites de flux, le SDK Storage réel avec transport simulé, le rendu PDF sans requête réseau et la conservation des données hors ligne. `tests/security-db.sql` s’exécute uniquement dans une base PostgreSQL vide et jetable : fixture de rôles et tables, application réelle et réapplication des migrations 055/056, droits MFA, références protégées et suppression transactionnelle. Il ne simule pas le protocole GoTrue ni le service HTTP Storage.

Validation du 13 septembre : 9 tests Node réussis, contrôle TypeScript et build local Webpack réussis ; scénario SQL PostgreSQL 17 réussi. Sur Supabase, les 94 références historiques correspondent au format attendu. Les migrations 055 et 056 sont appliquées et enregistrées sous `20260913160055` et `20260913160056` : 24 politiques MFA restrictives et le trigger de protection sont actifs. La simulation transactionnelle sur les données réelles confirme zéro chantier, visite ou objet visible pour le compte MFA en `aal1`, et les accès conservés en `aal2`. Aucun enregistrement métier n’a été supprimé pendant ces vérifications.

À la fin du lot 1, les rapports restaient régénérables sous le même chemin : ce lot n’instaure pas l’immutabilité documentaire de S06. Il ne clôture pas l’isolation multi-entreprise, la protection du cache entre comptes, les réglages GitHub ou l’ensemble des autres constats du rapport d’audit.

## Bibliothèque privée et versions des rapports — lot 2

- La migration 057 applique une restriction de lecture sur le préfixe `base-documentaire` du bucket `rapports`, y compris en présence d’anciennes règles permissives. Les invités ne voient plus les fichiers de la bibliothèque ; inspecteurs et administrateurs les conservent. Les pièces de checklist sous `points-controle` restent accessibles selon le parcours de démonstration existant.
- Les clients Supabase, y compris un administrateur connecté, ne peuvent plus insérer, remplacer, déplacer ou supprimer un PDF de visite. Les dossiers de documents, logos, bibliothèque et comparaisons conservent leurs politiques métier. Le compte serveur reste un privilège d’exploitation à protéger.
- Chaque génération de PDF de visite utilise un UUID neuf sous `<chantier>/visites/<visite>/versions/<version>.pdf`, avec `upsert: false`. Une nouvelle génération exige un motif de 5 à 1 000 caractères. Le fichier porte sa référence de version. La signature graphique commune est retirée des nouveaux PDF et du répertoire public ; les copies déjà distribuées et l’historique Git ne peuvent pas être rappelés par ce changement.
- La migration 058 crée `rapport_versions`. Une procédure réservée au serveur recontrôle l’affectation actuelle et le rôle, verrouille la visite, compare la référence attendue, puis inscrit l’archive et la nouvelle référence dans une transaction. Chaque nouvelle archive contient les données utilisées par le générateur, le SHA-256 exact du PDF, l’auteur, la date serveur et le motif. Une publication concurrente renvoie 409 ; une réponse incertaine conserve le fichier pour éviter d’effacer une publication réussie.
- L’historique est en ajout seul : UPDATE/DELETE des lignes sont interdits et les clients n’ont pas INSERT. Sa lecture suit celle de la visite et le MFA. Les 50 dernières versions sont consultables depuis la page du rapport, avec leur empreinte. Les références historiques valides sont reprises sans inventer leur auteur, leur date de génération ou une empreinte non calculée.
- L’email contient la version sélectionnée à l’écran. Si la référence courante a changé avant la demande, l’envoi est refusé avec 409. Le journal conserve la référence envoyée. Publier une nouvelle version remet son état « email envoyé » à faux ; un envoi d’une ancienne version déjà engagé ne peut pas marquer la nouvelle comme envoyée.
- Le PDF prend l’entreprise de l’inspecteur de la visite, au lieu de la première entreprise retournée. Une lecture métier indisponible bloque la génération pour éviter un rapport silencieusement incomplet.

### Vérification et limites

Les tests Node couvrent les chemins, l’absence d’écrasement, le calcul de l’empreinte, le conflit de publication, le motif, l’affectation actuelle, les lectures en erreur et le refus d’envoyer une autre version. `tests/security-db-versions.sql` reprend le lot précédent puis applique les vraies politiques Storage et les migrations 057/058 sur PostgreSQL jetable : invité/inspecteur/admin, déplacements, historique, réapplication et publication. GitHub Actions exécute désormais cette suite SQL avec PostgreSQL 17. Aucun email réel n’est envoyé par ces tests.

Ce lot traite l’accès Storage de S05 et une partie de S06. Il ne clôture pas S06 : les constats d’une visite terminée ne sont pas encore figés par une clôture atomique, les images sources peuvent évoluer et le parcours d’avenant validé reste à construire. L’empreinte d’un PDF permet de vérifier ses octets ; elle ne constitue pas une signature électronique du validateur. À la fin du lot 2, le modèle multi-entreprise S09 et l’isolation locale S08 restaient à traiter (voir le lot 3 pour S08). Les contrôles SQL ne remplacent pas une recette HTTP Storage avec des comptes de test distincts.

Validation du lot 2 le 13 septembre : 12 tests Node et la suite SQL PostgreSQL 17 réussis, TypeScript et lint sans erreur. La simulation sur Supabase confirme 0 fichier de bibliothèque pour l’invité, 5 pièces de checklist conservées, 76 fichiers pour l’inspecteur et 94 rapports historiques repris. Les migrations sont enregistrées sous `20260913170057` et `20260913170058`.

### 21. Synchronisation atomique des réponses (2026-09-14)

La migration **060** et le client hors ligne utilisent `synchroniser_reponse` à la place d’un upsert direct. Chaque écriture renouvelle une révision UUID et l’horodatage côté serveur. La procédure verrouille la visite, vérifie le MFA et l’affectation actuelle (ou le rôle administrateur), puis compare la révision observée par l’envoi. Deux créations concurrentes d’une même réponse ou deux modifications de la même révision ne peuvent plus s’écraser : la seconde reçoit un conflit `40001`. Le passage du brouillon à « en cours » appartient à la même transaction.

Les rôles `authenticated`, `anon` et `service_role` ne peuvent plus écrire directement dans `reponses`. La suppression transactionnelle d’un brouillon et les protections de clôture restent actives. La migration ajoute des métadonnées techniques aux réponses existantes, sans changer leurs constats, leurs dates historiques ou leurs références de photos. Une maintenance privilégiée renouvelle aussi la révision et invalide le reçu précédent.

Un envoi porte l’UUID de sa révision locale. Si son dernier accusé a été perdu, le serveur reconnaît le même auteur et le même contenu, sans réécriture. Un UUID réutilisé avec un contenu différent est refusé. Le client ne retire une saisie et ses photos qu’après un accusé correspondant à cet UUID et à la révision locale encore en attente. Un refus ou une réponse réseau incohérente conserve les données locales. Seul le dernier reçu par réponse est conservé ; ce mécanisme ne constitue pas un journal complet des opérations.

**Limite S07 encore ouverte :** la révision comparée est celle lue au début de la synchronisation, pas celle affichée avant une ancienne saisie hors ligne. Le contrôle préalable des dates dépend encore de l’horloge de l’appareil. Une modification distante antérieure à la lecture de synchronisation peut donc encore être écrasée si ce contrôle chronologique la laisse passer. Il reste à conserver une version de départ fiable dans IndexedDB, gérer les éditions successives et proposer une résolution explicite des conflits. Ce lot ferme la course entre lecture et écriture, sans déclarer S07 entièrement résolu. S09 (isolation serveur par entreprise) et les limites S06 sur les photos sources, le référentiel et les avenants restent ouverts.

**Validation et déploiement :** tests Node de conservation de la file, refus SQL, idempotence, rollback et concurrence réelle (création et modification). Exécuter les suites SQL de clôture et leur concurrence avant `security-db-sync.sql`, puis `security-db-sync-concurrency.sh`, uniquement sur PostgreSQL jetable. Construire l’image candidate, appliquer 060 et enregistrer `20260914130060` dans le suivi Supabase avant la bascule du conteneur. Recharger les anciens onglets : leur écriture directe échoue sans supprimer leur file locale. Conserver l’image précédente ; un retour applicatif doit conserver les protections SQL et nécessite une correction compatible pour reprendre les envois.

## 22. Version de départ des saisies hors ligne (2026-09-14)

Le lot 061 complète le contrôle atomique : la page charge la révision serveur avec la réponse, et chaque item conserve cette origine avec les valeurs affichées. IndexedDB mémorise cette base dès la saisie, indépendamment de l’horloge de l’appareil. `null` correspond à une absence de réponse observée ; une base manquante (`undefined`, anciennes files) bloque l’envoi et conserve la saisie. Une erreur de lecture serveur empêche d’ouvrir un formulaire vide par défaut.

Les modifications successives d’un formulaire héritent de leur base locale et de la chaîne de leurs envois précédents. Un accusé reçu en retard peut avancer la base d’un descendant, sans supprimer son contenu ; un accusé plus ancien ne peut pas la ramener en arrière. Le dernier envoi ancêtre reconnu côté serveur peut également permettre la reprise après un accusé perdu. Aucune autre modification distante ne fait avancer automatiquement cette base. Les reçus déjà synchronisés restent dans le stockage du compte jusqu’à la purge des lectures à la déconnexion.

Si deux formulaires tentent d’écrire sur la même réponse sans avoir chargé la même saisie locale, le second conserve un brouillon de récupération séparé. La dernière saisie de chaque formulaire est conservée par point. Ces brouillons comptent dans les éléments en attente et empêchent la clôture de leur visite. Les photos nécessaires à ces copies restent conservées. Le bandeau propose **Exporter mes saisies conservées** : un fichier JSON contenant les réponses, les brouillons concurrents et les octets des photos, créé uniquement sur l’appareil, sans envoi réseau ni suppression locale.

La structure de la base locale passe à la version 2 en ajoutant le magasin de récupération. Les anciennes données du compte sont conservées ; l’ancienne base sans propriétaire reste isolée. La migration **061**, enregistrée sous `20260914140061`, ferme l’ancienne RPC aux comptes connectés et fournit `synchroniser_reponse_v2`, en réutilisant les contrôles atomiques/MFA/affectation de 060. Recharger les anciens onglets après livraison. Ne jamais rejouer 060 après 061, car cela réouvrirait l’ancienne entrée.

**Limites restantes :** le refus des écrasements est actif, mais l’interface pour comparer, fusionner ou abandonner explicitement un conflit et réimporter les copies reste à développer. Les anciennes files sans origine nécessitent cette récupération ; leur base n’est pas inventée à la reconnexion. Un retour à une image antérieure ne rétablit pas l’envoi via l’ancienne RPC. S09 (isolation serveur par entreprise) et les limites S06 restent ouverts.

## 23. Suppression des réponses « Pas nécessaire » demandée par le propriétaire

Le 14 septembre 2026, l’inventaire n’a trouvé aucune non-conformité portant les mentions « Pas nécessaire » ou « Non nécessaire », ni aucun écart lié à une réponse de cette valeur. Le propriétaire a confirmé explicitement la suppression des **91 réponses `pas_necessaire`**, présentes dans des visites clôturées.

L’opération ponctuelle, distincte des migrations automatiques, est documentée dans `scripts/maintenance/20260914-supprimer-reponses-non-necessaires.sql`. Elle contrôle le nombre, l’empreinte SHA-256 des lignes et leurs dépendances. Une sauvegarde complète est conservée dans le schéma non exposé `maintenance_privee`, table `reponses_non_necessaires_20260914`, avec RLS et permissions API révoquées. L’exception au trigger de clôture reste contenue dans la transaction sous verrou exclusif : le trigger est rétabli avant commit et tout contrôle échoué annule l’opération. Aucun accès concurrent ne bénéficie de l’exception.

Résultat vérifié : **0 réponse `pas_necessaire` restante, 122 autres réponses inchangées, 95 visites et 83 écarts conservés**. La référence de photo liée à l’une des réponses est sauvegardée ; aucun fichier Storage ni PDF archivé n’a été supprimé ou réécrit. Les PDF archivés gardent leur contenu historique ; l’affichage et les nouvelles éditions utilisent les données actives. Une restauration éventuelle doit être réalisée par maintenance contrôlée à partir de la sauvegarde, après autorisation du propriétaire, sans rouvrir de droits API. Le script refuse un second passage ou une sélection différente.

Validation : tests du suivi des bases et des accusés, conservation des brouillons, export des octets, fermeture de l’ancienne RPC, concurrence SQL et tests du script de maintenance sur PostgreSQL jetable (`security-db-origin.sql`, `security-db-maintenance.sh`, après les suites 055–060).

## Déploiement du lot 2

Appliquer 057 et 058 avant la bascule du code, enregistrer les migrations, puis construire l’image, exécuter les tests et déployer le commit publié. Recharger les anciens onglets pour les nouvelles demandes de motif et de version email (service worker v9). Conserver l’image précédente, mais après publication d’un chemin `/versions/`, un retour à un code qui ne reconnaît pas ce format exige un correctif compatible : ne pas supprimer les archives ni rouvrir les politiques pour revenir en arrière. Les fichiers téléversés sans publication confirmée doivent être rapprochés de `rapport_versions` avant tout nettoyage.

## Isolation locale et synchronisation — lot 3

Ce lot traite la séparation locale S08 et renforce la conservation des saisies S07. Il ne modifie aucune politique Supabase et ne nécessite aucune migration SQL.

- **Périmètre obligatoire** : les réponses, les blobs photo et le cache de lecture utilisent une base IndexedDB par UUID de compte et UUID d’entreprise (ou absence d’entreprise explicite). Les sélections de thèmes et de points en localStorage portent le même périmètre. Une opération n’accepte jamais implicitement le « compte courant ». Une session terminée ne peut plus lancer de lecture, d’écriture ou de synchronisation. Une écriture locale déjà acceptée peut finir dans sa base d’origine.
- **Écran et réseau** : le contenu privé ne s’affiche qu’après concordance entre la session du navigateur et l’identité du layout serveur. Changement de compte, déconnexion et départ de page masquent ce contenu et interrompent le périmètre. Un verrou local prévient les autres onglets ; un retour depuis le cache de navigation force le rechargement. Les envois utilisent un JWT capturé, vérifié par Auth, puis contrôlent le MFA et l’entreprise actuelle. Les requêtes n’empruntent pas le jeton d’un compte connecté pendant l’attente et sont annulées à l’arrêt du périmètre.
- **Saisie et accusés** : chaque changement de réponse est écrit immédiatement dans IndexedDB ; seul le réseau est temporisé. Une révision locale unique empêche l’accusé d’un ancien envoi d’effacer une frappe plus récente. L’état « sauvegardé hors ligne » n’est affiché qu’après réussite de l’écriture locale. La reprise de la checklist recharge les réponses en attente du même périmètre avant de monter les champs.
- **Photos** : captures et annotations sont d’abord conservées comme blobs locaux, même en ligne. Le synchroniseur envoie le fichier avant la réponse et n’efface sa copie qu’après l’accusé de cette réponse, ou après vérification qu’une réponse serveur le référence déjà. Un fichier déjà présent est comparé octet par octet avant acceptation. Conflit, visite invisible/terminée, erreur réseau ou nouvelle révision conservent les données. Les aperçus locaux sont reconstitués à la reprise ; les contrôles du point attendent cette reprise avant d’accepter une modification, pour éviter qu’une saisie trop rapide écrase ses références photo ; les URL blob sont libérées au démontage. Une suppression demandée dans l’interface retire la référence et, le cas échéant, la copie locale. Les originaux distants sont conservés pour les versions antérieures des rapports ; leur nettoyage nécessite une procédure distincte.
- **Validation** : avant lecture des réponses puis clôture, la visite attend les écritures locales et leur synchronisation. Une réponse ou photo restante pour cette visite bloque la validation avec un message explicite. Cela ne constitue pas encore une clôture atomique côté base.
- **Déconnexion** : un avertissement signale les éléments en attente. Les réponses et photos enregistrées restent sur l’appareil pour le même compte et la même entreprise ; le cache de lecture est purgé. La révocation distante est tentée pendant au plus cinq secondes ; les cookies Auth de ce projet sont effacés localement même en cas d’échec, puis une navigation complète ferme le contexte mémoire. L’écran de connexion indique si la révocation distante n’a pas été confirmée. Le verrou n’est levé qu’après une authentification réussie.
- **Service worker v10** : seul le code statique Next.js et une courte liste de ressources publiques de l’origine sont mis en cache. Aucun HTML de page authentifiée, flux RSC, appel API, média privé ou objet Supabase n’est conservé par ce cache. L’activation retire les anciens caches Securionis. Hors ligne, une nouvelle navigation montre une page neutre 503 ; une visite déjà chargée peut continuer à être renseignée. L’ouverture à froid d’une visite hors ligne n’est pas proposée.
- **Ancien stockage** : la base historique `securionis-offline` ne contient pas de propriétaire vérifiable. Elle est conservée à part, sans lecture de son contenu, attribution automatique, synchronisation ni purge. Un bandeau signale son existence ; une récupération éventuelle demande une procédure d’identification du propriétaire. Les anciennes préférences non rattachées ne sont plus lues.

### Vérification et limites du lot 3

Les 24 tests Node incluent douze scénarios supplémentaires : séparation utilisateur/entreprise, changement de session pendant une écriture, accusé de révision, conservation et expiration, ancienne base, JWT capturé avec le vrai SDK et transport fictif, contrôles MFA/profil, photos en échec/doublon, caches du service worker et déconnexion réseau en erreur. IndexedDB est testé avec `fake-indexeddb` ; ces tests ne sollicitent aucun compte réel et n’envoient aucun email. TypeScript, lint (18 avertissements préexistants, aucune erreur) et build local Webpack passent.

Recette navigateur locale le 13 septembre : composant `OfflineProvider` réel sous React StrictMode, moteur IndexedDB du navigateur et événements Auth fictifs. A enregistre une réponse et une photo ; un changement de session vers B masque immédiatement l’écran A ; B lit une file vide ; le retour à A restitue les deux éléments. Le verrouillage dans un onglet verrouille également le second. Cette recette ne remplace pas une campagne avec comptes Supabase distincts, reconnexions mobiles et coupures réseau physiques.

Le chiffrement au repos de l’appareil n’est pas ajouté : un utilisateur ayant accès au profil du navigateur ou aux outils de développement peut inspecter son stockage. L’ancienne file reste à récupérer manuellement si elle contient des saisies utiles. La résolution guidée des conflits, la comparaison atomique des versions de réponses côté serveur, la clôture transactionnelle S06 et l’isolation multi-entreprise serveur S09 restent ouvertes. Une réponse peut encore évoluer côté serveur entre la lecture de conflit et l’écriture ; ce lot ne prétend pas résoudre cette concurrence. Les saisies qui n’ont pas obtenu de confirmation locale (stockage refusé, photo encore en préparation) ne sont pas garanties après fermeture.

### Déploiement du lot 3

Publier le commit testé, vérifier GitHub Actions, conserver l’image `044cea2` pour retour arrière, puis construire et basculer le conteneur sans `docker compose down`. Vérifier la santé, la page de connexion et le service worker v10, puis recharger l’application. Tous les anciens onglets doivent être rechargés pour remplacer le code déjà chargé en mémoire. Ne supprimer aucune base locale lors du déploiement ou d’un retour arrière ; l’ancien code ne sait pas relire les files v2. Un retour arrière exige donc une nouvelle mise à niveau avant de reprendre ces files.

## Clôture transactionnelle et gel des constats — lot 4

La migration 059 et le nouveau parcours de validation corrigent la clôture en deux requêtes séparées. Le lot traite la clôture atomique de S06 et la concurrence entre clôture et modification d’un constat. Il ne remplace pas le travail restant sur les conflits de réponses hors ligne S07.

- **Préparation contrôlée** : `preparer_cloture_visite` vérifie le MFA, le profil et le rattachement actuel (ou le rôle administrateur). L’auteur retiré du chantier ne peut plus valider. La procédure verrouille la visite et les intitulés de ses points, retourne les non-conformités et une empreinte SHA-256 des données serveur. Une visite vide est refusée.
- **Tout ou rien** : `cloturer_visite` recontrôle les mêmes droits et compare l’empreinte sous verrou. Elle exige exactement une entrée par réponse non conforme, sans oubli, doublon ni réponse étrangère. Les descriptions viennent des constats serveur ; seuls les délais et les renseignements de visite sont fournis par le formulaire. Les non-conformités et le statut terminé sont inscrits dans la même transaction. Une erreur à la dernière étape annule également leur création. Une NC déjà présente dans une visite ouverte est réutilisée en conservant son statut de suivi ; les doublons et incohérences antérieurs entraînent un refus explicite, sans suppression automatique.
- **Comparaison à la validation** : une réponse, un intitulé, les données de visite ou une NC modifiés depuis la préparation entraînent un conflit SQL `40001`. L’utilisateur reprend la validation des constats actuels. Les triggers de réponses et de NC utilisent le verrou de la visite : une modification concurrente termine avant la comparaison, ou est refusée après la clôture. Les rattachements des réponses et des NC deviennent immuables.
- **Traçabilité et relance** : la date serveur, l’UUID du validateur, l’UUID de l’opération et l’empreinte de sa demande sont inscrits sur la visite. Une relance strictement identique par le même acteur renvoie la réussite déjà enregistrée. Un UUID réutilisé avec un contenu différent est refusé. Après une réponse réseau perdue, le formulaire conserve la même demande en mémoire, bloque la modification des champs et permet sa relance. Un rechargement consulte l’état serveur de la visite ; une visite déjà terminée ouvre son rapport.
- **Constats figés** : après clôture, les réponses ne peuvent être ajoutées, modifiées, déplacées ou supprimées. Les renseignements de visite, les descriptions et les délais des NC sont figés, y compris pour un client administrateur et pour les écritures métier du service. Une visite terminée ne peut être rouverte ou supprimée. Le statut de correction des NC, son auteur et sa date peuvent toujours évoluer. La publication contrôlée des PDF et le suivi des emails restent autorisés. Les NC issues de plans sans réponse de checklist conservent leur fonctionnement.
- **Saisie locale** : la validation attend aussi les préparations photo déjà engagées, puis les écritures et la synchronisation de cette visite. Les champs sont désactivés pendant la préparation des délais et tant que l’issue d’une clôture reste incertaine. Les réponses et photos non envoyées restent conservées ; aucune file n’est purgée pour forcer une validation.
- **Historique** : les visites déjà terminées sont protégées sans inventer de validateur ni de date de clôture. Le précontrôle de production du 14 septembre a relevé 95 visites terminées, aucun doublon de NC par réponse et les colonnes attendues. Aucune visite métier n’a été clôturée pour les tests.

### Vérifications du lot 4

30 tests Node passent, dont six scénarios de clôture : attente d’une préparation photo, file non envoyée, préparation invalide, distinction entre refus SQL et issue réseau incertaine, relance de la même demande et échec de préparation photo. TypeScript, lint (aucune erreur, 18 avertissements préexistants) et compilation locale Webpack passent.

`tests/security-db-cloture.sql` reprend les migrations et tests des lots précédents, applique et réapplique 059 dans PostgreSQL 17 jetable, puis vérifie les droits, le MFA, les refus de clôture directe, les listes de NC, les conflits, le rollback d’une panne tardive, l’idempotence, le gel des données, le suivi des corrections et la suppression d’un brouillon. `tests/security-db-concurrency.sh` ouvre réellement deux sessions : clôture avant écriture, puis écriture avant clôture ; les verrous, refus et absence d’écriture partielle sont contrôlés. GitHub Actions exécute ces deux suites.

Recette navigateur locale : vrai formulaire React sous StrictMode, transport et données fictifs. Après préparation du délai, une perte de réponse réseau laisse les champs figés ; le bouton de validation renvoie exactement le même UUID et le même contenu puis ouvre le rapport après confirmation. Ce contrôle ne remplace pas un test de bout en bout avec plusieurs comptes Supabase sur des appareils mobiles.

### Limites et déploiement du lot 4

S06 reste partiel : les octets des photos sources et le référentiel complet des points ne sont pas archivés à la clôture, et le parcours d’avenant validé reste à construire. L’empreinte de comparaison des constats n’est pas une signature électronique. S07 conserve son conflit côté client entre deux réponses pendant une visite ouverte ; une comparaison atomique des révisions serveur et une interface de résolution restent nécessaires. S09 (isolation multi-entreprise serveur) reste ouvert.

Appliquer 059 et l’enregistrer sous `20260914120059` dans le suivi Supabase avant de basculer le code testé. La migration ne nécessite aucun effacement ni conversion de saisies locales. Les anciens onglets ne pourront plus terminer une visite par UPDATE direct et doivent être rechargés. Conserver l’image `d2cc583` pour retour arrière technique, ainsi que toutes les files locales. Après migration, l’ancien formulaire de clôture est incompatible : en cas de retour de conteneur, livrer un correctif compatible avec la procédure, sans désactiver les protections en base.

## 1. Annotation des photos

**Fichiers** : `src/components/visite/photo-annotator.tsx`, `photo-capture.tsx`, `src/lib/utils/canvas-annotations.ts`

Éditeur plein écran Canvas HTML5 intégré au flux de capture photo.

- **4 outils** : Flèche, Cercle, Texte, Dessin libre
- **5 couleurs** : Rouge, Vert, Navy, Jaune, Blanc
- **3 épaisseurs** de trait
- Undo (annulation dernière annotation)
- Touch events pour tablette sur chantier
- Export en pleine résolution (annotations rendues à l'échelle originale via `renderAnnotations(ctx, annotations, { scale })`)
- S'ouvre automatiquement après chaque prise de photo
- Ré-annotation possible sur photos déjà uploadées (hover → icône crayon)

**Architecture interne (refacto 2026-05-10)** :
- Fonction de rendu pure `renderAnnotations()` dans `src/lib/utils/canvas-annotations.ts`, mutualisée entre l'affichage écran et l'export haute résolution.
- Machine d'état `useReducer` à 3 phases (`idle` / `drawing` / `placing-text`) avec 6 actions typées (`pointer-down/move/up`, `submit-text`, `cancel-text`, `undo`).

## 2. Export Excel (.xlsx)

**Fichiers** : `src/app/api/export/xlsx/route.ts`

API `GET /api/export/xlsx` avec 2 modes :

### Export global (`?scope=all`)
- Feuille **Chantiers** : tous les chantiers avec infos complètes
- Feuille **Visites** : toutes les visites avec inspecteur, statut, date
- Feuille **Écarts NC** : toutes les NC avec chantier, description, statut, délai
- Feuille **Statistiques** : KPIs (chantiers actifs, total visites, NC ouvertes/corrigées, taux de conformité)

### Export par chantier (`?scope=chantier&chantierId=xxx`)
- Feuille **Chantier** : fiche info
- Feuille **Visites** : visites du chantier avec nb NC par visite
- Feuille **Écarts NC** : NC du chantier
- Feuille **Réponses détaillées** : chaque point de contrôle avec valeur, remarque, base légale

Boutons d'export sur le dashboard et la page détail chantier.

## 3. Comparaison visite N vs N-1

**Fichiers** : `src/app/api/visites/compare/route.ts`, `src/components/visite/visite-compare.tsx`

Compare les réponses de 2 visites par point de contrôle.

- **Classifications** : Corrigée, Persistante, Nouvelle NC, Améliorée, Identique
- Auto-sélection des 2 visites les plus récentes
- 5 cartes résumé colorées
- Filtres par onglet (Tous, Nouvelles, Persistantes, Corrigées)
- Vue tableau responsive (grille desktop / stack mobile)
- Intégré dans la page détail chantier entre timeline et NC

## 4. Analyse IA des photos (Claude Vision)

**Fichiers** : `src/app/api/photos/analyze/route.ts`, `src/components/visite/photo-ai-analysis.tsx`

Détection automatique de dangers via Claude Sonnet (vision).

### Détections
- **Équipements manquants** : casques, harnais, garde-corps, filets, balisage
- **Zones à risque** : travail en hauteur, échafaudage instable, câbles exposés
- **Non-conformités visuelles** : normes suisses (SUVA, OTConst, SIA)

### Interface
- Bouton "Analyse IA" visible dès qu'une photo est uploadée
- Dangers affichés avec sévérité (critique/majeur/mineur) et icônes
- **Remarque suggérée** : clic pour l'appliquer au champ remarque
- **Suggestion conformité** : clic pour marquer conforme/non-conforme
- Indicateur de confiance en %

### Sécurité
- Clé API dans `.env.local` (gitignored), accès serveur uniquement via `requireServer()`
- Authentification vérifiée avant chaque appel

## 5. Assistant IA juridique

**Fichiers** : `src/app/api/assistant/legal/route.ts`, `src/components/visite/legal-assistant.tsx`

Copilote de terrain pour les questions juridiques pendant l'inspection.

### Expertise
- Ordonnance sur les travaux de construction (OTConst, RS 832.311.141)
- Ordonnance sur la prévention des accidents (OPA, RS 832.30)
- Loi sur le travail (LTr, RS 822.11)
- Directives SUVA (feuillets, listes de contrôle)
- Normes SIA (SIA 118, SIA 260, etc.)
- RPAC et réglementations cantonales
- Code des obligations (CO)
- Ordonnance sur les installations électriques à basse tension (OIBT)

### Interface
- Bouton "Assistant juridique" sur chaque point de contrôle
- **4 questions rapides** pré-définies (réglementation, critères, formulation NC, délais)
- Interface chat avec historique de conversation
- Rendu markdown (références légales en gras)
- Bouton **"Copier dans la remarque"** sur chaque réponse
- Contexte automatique : point de contrôle, critère et base légale envoyés à l'IA

## 6. Gestion documentaire par chantier

**Fichiers** : `supabase/migrations/016_create_documents.sql`, `src/components/chantier/document-manager.tsx`

Centralisation de tous les documents liés à un chantier.

### Catégories
- Permis de construire
- Plans
- Rapport ECA
- Autorisation travaux dangereux
- Certificat entreprise
- Autre

### Fonctionnalités
- **Upload** : formulaire avec nom, catégorie, description, sélection fichier (PDF, Word, Excel, Image, DWG)
- **Versionnement** : bouton "Nouvelle version" → remplace le fichier, incrémente le numéro (badge v2, v3...)
- **Filtres** par catégorie avec compteur
- **Téléchargement** direct
- **Suppression** avec confirmation
- Affichage : icône par catégorie, taille fichier, date, badge version

### Base de données
- Table `documents` : id, chantier_id (FK CASCADE), nom, categorie, description, fichier_url, fichier_nom, fichier_taille, version, uploaded_by
- Index sur chantier_id et categorie
- RLS activé

### Intégration
- Section "Documents" sur la page détail chantier, entre les informations et les destinataires

## 7. Inscription et gestion des mots de passe

**Fichiers** : `src/app/(auth)/register/page.tsx`, `forgot-password/page.tsx`, `reset-password/page.tsx`

### Inscription (`/register`)
- Champs : Nom complet, Email, Mot de passe, Confirmation mot de passe
- Validation : min 6 caractères, mots de passe identiques, email unique
- Crée l'utilisateur dans Supabase Auth + profil avec rôle `inspecteur`
- Si confirmation email requise → écran "Vérifiez votre email"
- Sinon → redirection directe vers le dashboard

### Mot de passe oublié (`/forgot-password`)
- Saisie de l'email
- Envoi d'un lien de réinitialisation via Supabase Auth
- Écran de confirmation avec instructions (vérifier spam)

### Réinitialisation (`/reset-password`)
- S'ouvre automatiquement via le lien reçu par email
- Détection de la session `PASSWORD_RECOVERY` de Supabase
- Formulaire : nouveau mot de passe + confirmation
- Redirection vers le dashboard après changement
- Gestion lien expiré avec proposition de renvoyer

### Liens sur la page login
- "Mot de passe oublié ?" à côté du label mot de passe
- "Créer un compte" en bas du formulaire

### Middleware auth
- Routes publiques autorisées : `/login`, `/register`, `/forgot-password`, `/reset-password`, `/auth`
- Navigation via `window.location.href` (navigation complète, pas de SPA routing)

## 8. Design responsive

**Fichiers** : navigation, dashboard, chantiers, pages auth, comparaison visites

### Navigation (`nav.tsx`)
- **Mobile** : menu hamburger avec icônes Material Symbols, liens empilés, section utilisateur séparée
- **Desktop** : navigation horizontale classique
- Breakpoint : `md:` (768px)

### Dashboard
- KPI : grille 1 colonne (mobile) → 2 colonnes (sm) → 4 colonnes (lg)
- Boutons : full-width sur mobile, auto-width sur desktop
- Headers : empilés verticalement sur mobile

### Pages chantiers
- Header : flex-col mobile, flex-row desktop
- Grille infos : 1 colonne mobile → 2 colonnes desktop
- Boutons "Nouveau" / "Nouvelle visite" : full-width mobile

### Pages authentification
- Padding adaptatif : `p-5` mobile, `p-8` desktop
- Formulaires full-width avec max-w-md centré

### Comparaison visites
- Grille résumé : 2 → 3 → 5 colonnes selon la taille
- Tableau : stack vertical mobile, grille desktop

## 9. Refonte points de contrôle — Catégories / Thèmes (2026-03-24)

**Fichiers** : migrations 017-018, `src/app/(dashboard)/admin/points-controle/page.tsx`, `src/components/admin/point-controle-form.tsx`, `nouvelle-visite-form.tsx`, `checklist-form.tsx`, `checklist-item.tsx`, `theme-adder.tsx`

### Nouvelle hiérarchie
- **128 catégories** (Accès & Sols, Échafaudages, Électricité, Fouilles, Toitures, etc.)
- **530 thèmes** par catégorie
- **568 points de contrôle** importés depuis Excel SUVA

### Flux nouvelle visite
1. Sélection de **catégories** (cases à cocher multiples + recherche)
2. Sélection de **thèmes** (filtrés par catégories + tout cocher/décocher)
3. Démarrage de la visite avec les thèmes sélectionnés

### Ajout en cours de visite
- Bouton **"+ Catégories / Thèmes"** dans la barre sticky de la checklist
- Panneau intégré pour ajouter des catégories/thèmes supplémentaires
- Les nouveaux points sont chargés sans perdre les réponses déjà saisies

### Administration
- Navigation par famille → catégorie → thème → statut + recherche full-text (cf. section 15)
- Activer/désactiver tout point de contrôle
- Modifier les points existants (intitulé, explications, base légale, critère)
- Créer un **nouveau thème** directement dans le formulaire
- Upload jusqu'à **5 documents PDF** réglementaires par point (disponible dès la création)

### Base de données
- Table `themes` (id, categorie_id, libelle, actif)
- Table `point_controle_documents` (id, point_controle_id, nom, fichier_url, fichier_nom, fichier_taille, ordre)
- Colonnes ajoutées sur `points_controle` : theme_id, explications

### Pendant la visite
- Points filtrés par thèmes sélectionnés
- Affichage des explications sur chaque point
- Liens vers les documents PDF réglementaires attachés
- Flux de vérification inchangé (conforme / non-conforme / pas nécessaire)

## 10. Archivage des chantiers (2026-03-25)

**Fichiers** : migration 019, `src/components/chantier/archive-toggle-button.tsx`, `src/app/(dashboard)/chantiers/archives/page.tsx`

### Fonctionnement
- Badge **"Actif"** (vert) ou **"Archivé"** (ambre) sur la fiche chantier
- Bouton **Archiver** / **Restaurer** sur la fiche chantier (avec confirmation)
- Chantiers archivés exclus de la liste active et du dashboard
- Bouton "Nouvelle visite" masqué sur les chantiers archivés

### Page archives (`/chantiers/archives`)
- Liste des chantiers archivés avec date d'archivage
- Consultation des visites et rapports toujours possible
- Accessible depuis le dashboard et la page chantiers

### Base de données
- Colonnes ajoutées : `archived boolean DEFAULT false`, `archived_at timestamptz`

## 11. Améliorations PDF et IA (2026-03-25)

### Rapport PDF
- Photos affichées en images (120x90px) au lieu de texte
- Remarques formatées : retours à la ligne, puces, texte brut (pas de markdown)
- Logo agrandi (60px hauteur, 210px max largeur)
- Délai et statut affichés directement sous chaque constatation
- Suppression du tableau "Historique des non-conformités" et section "Délai(s)"

### IA — Texte en français accentué
- Prompts de l'analyse photo et de l'assistant juridique imposent le français avec accents
- Fonction `stripMarkdown()` nettoie tout formatage markdown des réponses IA
- Le bouton "Copier dans la remarque" de l'assistant juridique résume le texte en 2-3 phrases via l'IA

## 12. Notifications push PWA (2026-05-11) — **retirées le 2026-08-29**

> Sous-système retiré avec Stripe (aucun usage : 1 abonnement de test, aucun déclencheur métier). Les routes, le hook, `lib/push.ts`, les handlers du Service Worker et les clés VAPID n'existent plus ; la table `push_subscriptions` est conservée. Le texte ci-dessous décrit l'état d'avant le retrait, à titre d'historique.

**Fichiers** : `src/lib/push.ts`, `src/app/api/push/subscribe/route.ts`, `src/app/api/push/test/route.ts`, `src/hooks/use-push-notifications.ts`, `src/components/ui/push-notifications-card.tsx`, `public/sw.js`, `supabase/migrations/034_push_subscriptions.sql`

Infrastructure Web Push complète :
- Opt-in utilisateur depuis `/dashboard/notifications` (toggle « Activer les notifications »)
- Test d'envoi de notification à soi-même
- Stockage des subscriptions dans `push_subscriptions` (RLS user-scoped)
- Cleanup automatique des subscriptions expirées (404/410) au prochain envoi
- Helper `sendPushToUser(userId, {title, body, url, tag})` côté serveur
- Service Worker étendu avec handlers `push` et `notificationclick` (focus la fenêtre existante si possible, sinon ouvre une nouvelle)

**Configuration requise** : générer une paire de clés VAPID (`npx web-push generate-vapid-keys`) et renseigner `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` dans `.env`.

**À venir** : triggers métier (notifier inspecteur lors d'un envoi de rapport reçu par les destinataires, lors de la création d'une NC critique, etc.).

## 13. Sélection des destinataires avant envoi du rapport (2026-05-11)

**Fichiers** : `src/app/(dashboard)/chantiers/[id]/visites/[visiteId]/rapport/rapport-actions.tsx`, `src/app/(dashboard)/chantiers/[id]/visites/[visiteId]/rapport/email-history.tsx`, `src/app/api/visites/[id]/email/route.ts`

Avant d'envoyer le PDF du rapport par email, l'inspecteur ouvre une modal listant tous les destinataires du chantier et **coche/décoche** ceux qui doivent recevoir l'envoi courant. Les choix ne sont **pas mémorisés** entre 2 envois (tous re-cochés par défaut à chaque ouverture).

- Compteur dynamique « N sélectionnés »
- Boutons « Tout cocher » / « Tout décocher »
- Bouton « Envoyer (N) » désactivé si 0 sélectionné
- **Email ad-hoc** : champ « Ajouter un email ponctuel » qui ajoute un destinataire hors liste chantier (pill ambre, validation format + dedup)
- Filtrage **côté serveur** sur les destinataires liés au chantier (anti-injection : impossible d'envoyer à un destinataire arbitraire)
- Rétro-compatibilité : si l'API est appelée sans corps, le comportement historique (envoi à tous) est conservé
- Audit log (`send_rapport_email`) conserve la liste exacte des emails envoyés
- **Historique d'envoi** affiché sur la même page (lecture des `audit_logs` via service client, autorisation déjà vérifiée par accès à la page)

## 14. Améliorations UX

- Champ remarque auto-extensible (s'agrandit avec le contenu)
- Fonts Google (Inter + Material Symbols) restaurées dans le layout
- Touch targets min 44x44px sur tous les boutons et liens
- KPI du dashboard cliquables avec icônes et effet hover
- Accentuation complète de tous les textes français de l'interface

## 15. Familles et recherche full-text des points de contrôle (2026-08-27)

**Fichiers** : migrations 035-036, `src/app/(dashboard)/admin/points-controle/page.tsx`, `src/lib/utils/familles.ts`, `src/lib/utils/mots-cles.ts`, `src/components/admin/point-controle-form.tsx`, `import-excel-points.tsx`

Objectif : rendre la page d'administration exploitable malgré 487 points répartis sur 28 catégories.

### Les 12 familles
Regroupement métier des catégories, stocké dans `points_controle.famille` (contrainte CHECK) :

| Famille | Catégories regroupées | Points |
|---|---|---|
| Protections antichute | Échafaudages, Échafaudages roulants, Filets & Retenue, Protections Chutes, Échelles | 107 |
| Fouilles & Terrasse | Fouilles & Talus, Roches & Gravier, Souterrains, Coffrages | 66 |
| Engins & Levage | Engins Chantier, Grues & Levage | 51 |
| Accès & Circulation | Accès & Sols, Postes & Passages | 51 |
| Dispositions générales | Dispositions générales | 45 |
| Électricité & Énergies | Électricité, Installations & Énergie, Installations Thermiques, Laser | 42 |
| Structures & Toitures | Toitures, Éléments Préfabriqués, Arbres | 37 |
| Démolition & Désamiantage | Démolition & Désamiantage | 26 |
| EPI & Santé | Santé et EPI, Milieu de travail | 25 |
| Machines & Outils | Machines Electriques, Machines portatives | 22 |
| Produits & Incendie | Produits & Inflammables | 14 |
| Autres | Test, toute catégorie non répertoriée | 1 |

### Recherche full-text
- Colonne `mots_cles` (text[]) : mots-clés dérivés de l'intitulé, du thème et de la catégorie (mots ≥ 4 caractères, mots vides exclus). Permet de retrouver un point par le vocabulaire de son thème — « permis grutier » remonte le point « Cat A ou B », dont l'intitulé ne contient aucun des deux mots.
- Colonne générée `search_vector` (tsvector, index GIN) : intitulé et mots-clés en poids A, famille en B, critère/objet/base légale en C, explications en D.
- Configuration `french_unaccent` (unaccent + french_stem) : la recherche ignore les accents — « echa » et « écha » remontent les 57 mêmes points.
- Recherche par préfixe : « echa » trouve « échafaudage » dès la 4ᵉ lettre.

### Interface
- Barre de recherche en haut avec icône loupe, bouton d'effacement et indicateur de frappe ; débounce 250 ms, aucun rechargement de page.
- Filtres en cascade : **Famille** (12 options) → **Catégorie** (désactivée tant qu'aucune famille n'est choisie, limitée aux catégories de la famille) → **Thème** → **Statut**.
- Bouton « Réinitialiser les filtres ».
- Badge de famille coloré sur chaque point, masqué quand il ferait doublon avec le badge catégorie.

### Écriture
Il n'existe pas de trigger PostgreSQL : `famille` et `mots_cles` sont renseignés côté application par `familleDeCategorie()` et `genererMotsCles()`, appelés depuis le formulaire admin et l'import Excel. Tout nouveau chemin d'écriture vers `points_controle` doit faire de même.

## 16. Correction du débordement de la nav en tablette (2026-08-27)

**Fichiers** : `src/app/(dashboard)/nav.tsx`

Sur toutes les pages du dashboard, un **administrateur** faisait déborder la page de 188 px à 768 px : la bascule barre horizontale / menu déroulant était fixée à `md`, alors que ses 6 liens réclament ~1030 px avec le logo et la zone utilisateur. Les rôles `inspecteur` (2 liens) et `invité` (3 liens) n'étaient pas concernés.

Le seuil dépend désormais du nombre de liens du rôle : `xl` (1280 px) au-delà de 3 liens, `md` (768 px) sinon. Ajout de `whitespace-nowrap` sur les liens (« Points de contrôle » se cassait sur trois lignes) et d'un `gap-4` entre les zones.

> Les classes responsives sont produites par ternaire ; Tailwind scanne le source en texte brut, donc les littéraux `"xl:flex"` / `"md:flex"` doivent rester écrits en entier.

## 17. Sécurité et intégrité — lot 1 de l'audit (2026-09-03)

**Fichiers** : `supabase/migrations/051_stockage_ecriture_cloisonnee.sql`, `052_acces_visites_reponses.sql`, `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `src/app/api/visites/[id]/route.ts`, `src/app/api/visites/[id]/email/route.ts`, `src/components/chantier/document-manager.tsx`, `src/app/(dashboard)/admin/documents/hooks/use-documents.ts`, `src/components/admin/point-controle-documents-uploader.tsx`

Six corrections issues de l'audit technique du 3 septembre 2026, sans fonctionnalité nouvelle (PR #45, déployée).

### Règles d'accès (migrations 051 et 052, appliquées)
- **Stockage** : on écrit là où on est rattaché. Un inspecteur dépose et remplace sous `<son chantier>/…` (photos, rapports) et `chantiers/<son chantier>/docs/…` (documents) ; le référentiel `base-documentaire/`, `points-controle/`, `logos/` et la suppression dans `rapports` sont réservés à l'administrateur. Les trois politiques héritées en double — qui laissaient tout compte connecté remplacer un rapport ou supprimer toutes les photos — sont supprimées.
- **Visites, réponses, écarts** : un seul périmètre. Lecture pour l'inspecteur de la visite **ou** le rattaché au chantier, écriture pour le rattaché seulement. Avant, un second inspecteur rattaché voyait la visite d'un collègue sans aucune de ses réponses.

### Comportements
- **Suppression d'une visite en cours** : faite par le `service_role` après contrôle d'accès, résultat vérifié ; les écarts liés, les photos sous `<chantier>/<visite>/` et le rapport éventuel sont effacés. Auparavant la suppression ne touchait aucune ligne tout en renvoyant un succès.
- **Suppression d'un document** (chantier, base documentaire, point de contrôle) : la ligne d'abord, résultat vérifié, le fichier ensuite. Un refus s'affiche (« réservée à un administrateur »), un fichier non effacé aussi.
- **Envoi du rapport** : le marquage `email_envoye` est vérifié et journalisé s'il échoue.

### Image Docker
Trois étapes (`deps`, `builder`, `runner`), Node 22, `output: "standalone"`, utilisateur `node`, `HEALTHCHECK` sur `/login`. `.dockerignore` exclut les `.env` : les valeurs publiques (`NEXT_PUBLIC_*`) arrivent en `build args` depuis `docker-compose.yml`, les secrets seulement au conteneur en marche. Image de **342 Mo** contre 2,02 Go, bascule mesurée à 6 s.

> ⚠️ Les images construites avant le 3 septembre 2026 contenaient le `.env`. Elles sont détruites sur le VPS, mais les clés qu'elles portaient (Supabase `service_role`, Resend, Anthropic, Stripe) sont à faire tourner chez leurs fournisseurs.

## 18. Comparaison de plans PE / EXE sur tablette (2026-09-04)

**Fichiers** : `src/components/chantier/comparaison-plans.tsx`, `src/components/chantier/comparaison-annotations.tsx`

La comparaison de plans (page `/chantiers/[id]/comparaison` : superposition PE / EXE, opacités, recalage, échelle, rotation, recoloration, détection des différences, annotations, rapport) est documentée en détail dans `CLAUDE.md`. Cette section ne couvre que son comportement sur tablette, signalé en usage réel : la fenêtre de manipulation ne tenait pas dans l'écran et bougeait pendant le recalage.

- **Hauteur du visualiseur mesurée** : il prend tout ce qui reste de l'écran une fois les barres d'outils comptées, jamais moins de 380 px, et se remesure au redimensionnement, au changement d'orientation et quand les barres se replient. Auparavant `65vh` : trop petit en portrait, débordant en paysage. Le plein écran natif n'existe pas sur iPad Safari, ce mode est donc celui qui compte sur tablette.
- **La zone reste fixe sous le doigt** : `touch-action: none` et `overscroll-behavior: contain` sur toute la zone du visualiseur (OpenSeadragon ne le posait que sur son canevas, pas sur les couches SVG et étiquettes qui le recouvrent). Un recalage au doigt ne fait plus défiler la page.
- **Tracer une forme au doigt** fonctionne : la couche d'annotations porte `touch-action: none`, sans quoi le navigateur prenait le tracé pour un défilement et annulait les événements pointeur.
- Plein écran en `100dvh` plutôt que `100vh` (barre d'adresse mobile non comptée).

> Non éprouvé dans le navigateur d'automatisation, où le visualiseur ne se charge pas : `tsc` et ESLint verts, premier usage réel sur tablette à confirmer.

## 19. Accès aux comptes et envoi de documents (2026-09-04)

**Fichiers** : `src/app/api/documents/email/route.ts`, `src/app/api/admin/create-user/route.ts`, `src/app/(auth)/login/page.tsx`, `src/lib/supabase/middleware.ts`, `supabase/migrations/053_inscription_publique_fermee.sql`

Deux constats de l'audit de sécurité, corrigés le jour même. Le détail des
mécanismes est dans `CLAUDE.md` ; voici ce qui change pour l'utilisateur.

### L'inscription libre est fermée

Il n'y a plus de page d'inscription. **Les comptes sont créés par un
administrateur** depuis `/admin/utilisateurs`, qui choisit le rôle à la
création. La page de connexion le dit, et `/register` redirige vers `/login`.

Un compte créé ainsi est utilisable immédiatement, sans étape de confirmation
par email. Le mot de passe suit la règle unique du projet : 8 caractères
minimum, une majuscule, une minuscule et un chiffre.

> La fermeture tient à **deux niveaux** : le réglage « Allow new users to sign
> up » de Supabase répond `422 signup_disabled`, et un déclencheur de contrainte
> en base refuse tout compte qui ne porte pas le marqueur posé par la route
> d'administration. Le second tient même si le premier était réactivé.

⚠️ **Conséquence côté console Supabase** : « Add user » et « Invite » y
échouent, la console ne posant pas ce marqueur. La procédure de secours est
documentée en tête de la migration 053.

### Le second facteur d'authentification (2026-09-04)

**Fichiers** : `src/app/(dashboard)/compte/securite/page.tsx`, `src/components/compte/{gestion-mfa,formulaire-code-mfa}.tsx`, `src/app/(auth)/verification/`

Une page **Sécurité du compte**, accessible depuis l'icône de bouclier de la
barre de navigation, permet d'activer un second facteur : on scanne un QR code
avec une application d'authentification, puis on confirme par un premier code.
Tant que ce code n'est pas saisi, rien ne change à la connexion.

Une fois le facteur actif, la connexion demande le code juste après le mot de
passe. Une session ouverte avant l'enrôlement est renvoyée vers un écran de
vérification à sa prochaine visite.

Un bandeau invite l'administrateur qui n'a pas encore de second facteur à
l'activer — c'est une invitation, jamais un blocage.

> ⚠️ **En cas de perte du téléphone**, la reprise en main demande une
> intervention en base de données. Conserver le compte dans un gestionnaire de
> mots de passe synchronisé, ou noter la clé affichée à l'enrôlement.

### La bibliothèque documentaire suit le rôle

Le référentiel documentaire n'est plus lisible que par les rôles
**inspecteur** et **administrateur**. Un compte « invité » conserve la
checklist complète et les documents attachés aux points de contrôle, mais plus
la bibliothèque générale.

### L'envoi d'un document par email suit les limites de rôle

La route d'envoi d'un document de la base documentaire refuse désormais un
compte « invité », comme le faisaient déjà les cinq autres routes d'email et de
PDF. Elle limite en outre les envois **vers une même adresse** à cinq par
heure, tous comptes confondus.

## 20. Contrôle quotidien du serveur (2026-09-04)

**Fichiers** : `scripts/controle-durcissement.{sh,service,timer}`, `scripts/LISEZ-MOI.md`

Une minuterie systemd vérifie chaque matin seize invariants du serveur —
connexion SSH, pare-feu, `fail2ban`, droits des fichiers de secrets, santé du
conteneur, absence du fichier d'environnement dans l'image, configuration
nginx, certificat, réponse de la page de connexion — et relève les erreurs
applicatives des dernières 24 heures. Un email part uniquement en cas de dérive
ou d'erreur.

Ce contrôle existe parce qu'une régression est déjà passée inaperçue pendant
deux mois. L'installation et les pièges sont décrits dans
[scripts/LISEZ-MOI.md](../scripts/LISEZ-MOI.md).

> La supervision applicative (Sentry) reste à brancher : le code est prêt, seul
> le DSN manque. Le relevé quotidien en tient lieu en attendant.

## Déploiement

### Production
- **URL** : https://chantiers.securionis.com
- **Infrastructure** : Docker sur VPS Hostinger (31.97.36.92, hostname `srv842436`)
- **SSL** : Cloudflare Full (Strict) — certificat Let's Encrypt sur l'origine, renouvellement auto via `certbot.timer`
- **Reverse proxy** : Nginx (80 + 443 → `127.0.0.1:3000`, le port 80 restant ouvert pour les challenges ACME ; `client_max_body_size 25m`, buffers proxy 32k)
- **Réseau** : UFW en deny incoming ; 80/443 restreints aux plages IP Cloudflare, Docker bindé sur `127.0.0.1:3000`
- **Accès au serveur** : SSH par **clé uniquement**, `PermitRootLogin prohibit-password`, via `/etc/ssh/sshd_config.d/01-durcissement.conf`. ⚠️ Le numéro **01** est essentiel : `sshd` retient la *première* valeur obtenue, et `50-cloud-init.conf` remet `PasswordAuthentication yes` à chaque passage de cloud-init. Un fichier numéroté au-dessus de 50 est inerte. Vérifier avec `sshd -T`, jamais en relisant un fichier. `fail2ban` actif (jail sshd)
- **Process** : Docker Compose, image `standalone` en trois étapes sous l'utilisateur `node`, `env_file .env` pour les secrets, `build args` pour les `NEXT_PUBLIC_*`, `restart unless-stopped`, `HEALTHCHECK`

### Mise à jour
```bash
cd /app/securionis
git pull --ff-only
docker image tag securionis-app:latest securionis-app:rollback
docker compose build
docker compose up -d --wait
```
- **Ne pas faire `docker compose down` avant le build** : l'ancien conteneur continue de servir pendant la construction, `up -d` ne fait que la bascule (mesurée à 5–6 s, contre ~2 min avec un `down` préalable).
- Conserver l’image `securionis-app:rollback` et le SHA précédent jusqu’à validation. Ne pas purger automatiquement les images après la bascule. Nettoyer le cache de construction seulement en cas d’erreur de cache identifiée.
- Après chaque lot : mettre à jour `docs/FEATURES.md` et `CLAUDE.md`, exécuter les vérifications, commit et push GitHub, appliquer les migrations requises, déployer le VPS puis vérifier le service. Cette séquence est demandée explicitement par le propriétaire.
- Pour le lot du 13 septembre : tester puis appliquer 055 et 056 avant le nouveau conteneur, enregistrer leur version dans le suivi Supabase et vérifier les contextes `aal1`/`aal2`. Recharger les onglets après mise à jour pour bénéficier de la nouvelle synchronisation. Conserver les politiques de sécurité lors d’un éventuel retour de conteneur ; ne jamais les ouvrir pour rétablir l’interface.

> Les migrations Supabase ne sont **pas** appliquées par le `git pull` : la base est sur Supabase Cloud, il faut les passer séparément (SQL Editor ou MCP), puis les inscrire dans `supabase_migrations.schema_migrations`.

### Variables d'environnement (`.env` sur le VPS, `.env.local` en local)
Publiques, inlinées au build (à déclarer aussi dans `Dockerfile` et `docker-compose.yml` pour toute nouvelle variable) :
- `NEXT_PUBLIC_SUPABASE_URL` — URL du projet Supabase
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Clé publique Supabase
- `NEXT_PUBLIC_APP_URL` — URL publique de l'application
- `NEXT_PUBLIC_APP_ENV` — `production` en production
- `NEXT_PUBLIC_SENTRY_DSN` — DSN Sentry côté client (vide = Sentry inactif)

> **Clés Supabase** : le projet utilise les clés **modernes**
> (`sb_publishable_…` côté client, `sb_secret_…` côté serveur). Les clés JWT
> héritées `anon` et `service_role` sont **désactivées** depuis le 4 septembre
> 2026 et refusées en 401. Une clé secrète se renouvelle seule, sans toucher au
> secret JWT et donc sans déconnecter personne : créer la nouvelle, l'installer,
> vérifier, puis révoquer l'ancienne.

Secrets, fournis au conteneur en marche uniquement :
- `SUPABASE_SERVICE_ROLE_KEY` — Clé service (serveur uniquement)
- `RESEND_API_KEY` / `RESEND_FROM_EMAIL` — Envoi d'emails (expéditeur sur le domaine racine vérifié)
- `ANTHROPIC_API_KEY` — Analyse IA photos + Assistant juridique
- `SENTRY_DSN` — DSN Sentry côté serveur (vide = Sentry inactif)

## 24. Isolation serveur des entreprises — lot 7 (migration 062)

Chaque administrateur agit dans son entreprise. Les chantiers, catégories, thèmes, points de contrôle, documents de bibliothèque et journaux d’audit portent un `entreprise_id`. Les autres données héritent du périmètre de leur parent. Les politiques **restrictives** s’ajoutent aux permissions métier existantes : connaître un UUID ou être administrateur ne permet plus de lire, modifier ou supprimer une donnée d’une autre entreprise. Les phases standard restent communes et en lecture seule.

Les triggers vérifient aussi les relations : créateur et inspecteur de chantier, auteur de visite, catégories sélectionnées, point de réponse, pièces de bibliothèque, plans de comparaison et liens de NC doivent appartenir à la même entreprise. Une comparaison exige des plans du même chantier. L’entreprise et l’identité des objets ne peuvent pas être transférées. Un profil nouvellement créé sans entreprise peut être rattaché une première fois par le serveur ; aucun transfert ultérieur n’est autorisé, même via l’API d’administration. Les procédures privilégiées de clôture, synchronisation, suppression et publication de rapport vérifient leur entreprise indépendamment de la RLS.

Les nouveaux fichiers de bibliothèque, pièces réglementaires et logos utilisent respectivement `base-documentaire/<entreprise>/…`, `points-controle/<entreprise>/<point>/…` et `logos/<entreprise>/…`. Les autres fichiers conservent le chantier dans leur chemin. Les références entrantes de fichiers et de photos sont vérifiées en base. Les anciens chemins de bibliothèque sont attribués à l’entreprise historique dans une table interne non exposée ; ils restent lisibles selon les droits métier, mais ne sont plus créés ni écrasés par les clients. Les nouveaux logos sont envoyés sous un nom neuf avec validation PNG/JPEG et taille maximale de 5 Mo. La configuration charge uniquement l’entreprise du compte et vérifie qu’une ligne a réellement été modifiée.

**Reprise historique :** la première application exige une entreprise unique et refuse toute ambiguïté ou relation incohérente. L’inventaire préalable a identifié une entreprise, trois profils et douze chantiers, ainsi que 28 catégories, 450 thèmes, 487 points et 76 documents de bibliothèque. L’ajout des métadonnées n’altère pas les réponses ni les visites clôturées, et ne réécrit aucun PDF. La sauvegarde privée des 91 réponses supprimées reste indépendante. Les futures entreprises reçoivent leur propre catalogue : le clonage commercial/onboarding du référentiel n’est pas ajouté par cette migration.

**Validation :** `tests/security-db-tenant.sql` reconstruit le schéma applicatif avec les migrations réelles, hors imports de catalogue, dans une base dédiée jetable. Il vérifie deux entreprises, les rôles administrateur/inspecteur/invité, un compte sans entreprise, les clés étrangères forgées, les accès Storage, les RPC privilégiées, le MFA et la réapplication de 062. Les tests Node couvrent le refus d’accès d’un administrateur à un chantier invisible et les préfixes d’upload. Ce scénario SQL ne remplace pas la recette finale GoTrue/HTTP Storage sur des comptes de test séparés.

**Livraison :** construire et vérifier l’image candidate, appliquer 062 avant la bascule, enregistrer `20260914150062`, puis déployer le commit GitHub. Recharger les onglets pour les nouveaux chemins d’upload. Conserver une image de retour arrière ; les migrations restent en place et une ancienne interface d’upload nécessiterait une correction compatible. Les conflits guidés S07, les photos/référentiels archivés et avenants S06, puis le durcissement et la recette finale constituent les étapes suivantes demandées.

### Livraison de l’isolation

Le lot 7 a été fusionné par la PR **66**, source `5d5257e`, puis déployé sur `main` au commit **`18e8f38`**. Les CI de la PR et de main ont réussi. La migration 062 est enregistrée dans Supabase ; 23 politiques `entreprise_requise` restrictives et 82 attributions de fichiers historiques ont été vérifiées. Les 12 chantiers, 95 visites, 122 réponses, 83 écarts et la sauvegarde privée de 91 lignes sont conservés. Le conteneur est sain, exécuté comme `node`, exposé uniquement sur `127.0.0.1:3000` ; login, tableau de bord et configuration de l’entreprise fonctionnent. L’image précédente est conservée sous `securionis-app:rollback-9e56206-20260914`.

## 25. Résolution guidée et reprise des sauvegardes — lot 8

La page **Saisies conservées** (`/compte/saisies`), accessible depuis le bandeau et le pied de page, regroupe les brouillons par constat. Elle compare les valeurs locales, les remarques et les photos à la réponse serveur visible dans la même entreprise. L’utilisateur peut conserver la version serveur, sélectionner un brouillon ou fusionner explicitement le constat, la remarque et les photos (10 maximum). Les lectures impossibles ne sont jamais interprétées comme une absence de réponse.

Avant un choix, le serveur est relu et toutes les révisions locales observées sont comparées dans une transaction IndexedDB. Un changement concurrent impose une nouvelle comparaison. Le choix enregistre une nouvelle opération avec la révision serveur effectivement observée, puis utilise la CAS existante de `synchroniser_reponse_v2`. Même conserver le contenu serveur sur une visite ouverte passe par cette comparaison atomique : une écriture concurrente reste détectable. Une erreur réseau ou un conflit conserve le choix dans la file. Les anciens accusés ne peuvent pas acquitter cette nouvelle opération.

La base locale passe à la **version 3**, en ajoutant `saved_resolutions`. Chaque résolution conserve les brouillons précédents et les octets des photos disponibles dans une copie créée dans la même transaction que le choix. Ces copies ne bloquent pas la clôture, ne sont pas purgées à la déconnexion, et peuvent être exportées ou reprises. Les photos sans saisie active peuvent aussi être classées dans une copie, après vérification de leurs références actuelles. Classer un brouillon n’efface aucune réponse serveur et n’annule pas un envoi déjà arrivé au serveur. Sur une visite clôturée, aucun choix local ne peut réécrire les constats : les copies restent disponibles pour un futur avenant.

L’export JSON **v2** inclut les copies avec leurs photos ; l’import accepte les formats v1 et v2, seulement pour le même compte et la même entreprise. Il vérifie la structure, les UUID, les valeurs, les signatures JPEG/PNG et les tailles (fichier de 100 Mo maximum, 75 Mo de photos décodées au total, 10 Mo par photo, 3 000 saisies et 1 000 photos maximum). Les photos actives importées reçoivent des chemins neufs et les références sont réécrites ensemble ; aucune photo existante n’est écrasée. Les saisies entrent dans des brouillons de récupération distincts, sans base présumée, et demandent une comparaison avant l’envoi. Les copies déjà archivées restent archivées. Le rejeu du même fichier est idempotent.

**Validation :** 56 tests Node, TypeScript et build Webpack réussis ; lint sans erreur avec les 18 avertissements préexistants. Les nouveaux tests vérifient les frappes concurrentes, accusés retardés, CAS en échec, lectures indisponibles, visites clôturées, préservation des octets, changement de compte et rejeu d’importation. La recette navigateur sur données fictives vérifie le refus d’un choix devenu périmé, la fusion explicite, la conservation des deux brouillons et leur reprise sans envoi automatique. Aucun constat réel n’a été modifié pour cette recette.

**Livraison et limites :** aucune migration Supabase nouvelle n’est nécessaire. Recharger les anciens onglets après mise à jour : une ancienne application qui ouvre IndexedDB en version 2 ne peut plus ouvrir une base déjà migrée en version 3. Conserver les migrations 055–062 et corriger en avant en cas de retour applicatif. Les copies sont locales, sans garantie contre l’effacement du profil navigateur ou une panne de l’appareil ; l’export permet une sauvegarde externe. L’ancienne base sans propriétaire reste isolée et n’est pas réattribuée par l’import. L’archivage serveur des sources et le parcours d’avenants constituent l’étape suivante.

### Livraison de la résolution des conflits

Le lot 8 est fusionné par la PR **67** (source `aa6d7cf`), puis déployé au commit main **`41c9dce`**. CI PR et main réussies ; image `409cd3d94259…`, conteneur sain, utilisateur `node`, port local `127.0.0.1:3000`, fichiers d’environnement absents de l’image. Tableau de bord et page Saisies conservées vérifiés dans la session réelle, sans modification des constats. Retour arrière applicatif conservé sous `securionis-app:rollback-18e8f38-20260914`.

## 26. Sources archivées des visites — lot 9 (migration 063)

La clôture exige désormais la copie complète des sources. Le périmètre comprend la visite, son chantier, l’inspecteur et l’entreprise, les destinataires, les réponses avec les points/thèmes/catégories complets, les écarts du chantier présents à la validation, les documents attachés aux points et les pièces de bibliothèque liées. Un SELECT commun produit l’instantané en base ; son empreinte remplace la comparaison limitée aux libellés. Un changement de contexte ou de référentiel pendant la validation impose une nouvelle préparation.

Le serveur, après Auth + MFA, prépare des copies neuves des photos, du logo et des pièces réglementaires avec le client utilisateur pour la lecture. Il refuse les références hors projet, fichiers inaccessibles, types incompatibles ou dépassements : 10 Mo par image PNG/JPEG, 50 Mo par document PDF/PNG/JPEG, 100 Mo et 300 fichiers au total. Copies et exports ZIP sont limités chacun à cinq opérations par heure et par compte ; une panne du comptage bloque l’opération. Chaque copie porte son SHA-256, sa taille et son type. Les écritures privilégiées utilisent des chemins réservés et ne remplacent aucun objet. Un manifeste incomplet ou une modification des sources avant son enregistrement interdit la préparation.

La préparation privée active aussi la RLS, sans politique cliente, en plus de l’absence de privilèges sur son schéma et sa table. Elle est liée à la visite, à l’acteur, à l’UUID de clôture et à l’empreinte des sources. La procédure existante conserve sa comparaison et son rejeu, mais exige cette préparation. Elle ajoute les renseignements finaux, les NC/délais et les métadonnées de clôture puis insère l’archive **dans la transaction qui termine la visite**. Une panne laisse la même demande récupérable ; un refus confirmé de préparation permet de reprendre la validation. Aucun indicateur de session falsifiable ne permet de contourner cette règle. Les invités ne peuvent pas valider une clôture.

`visite_archives` est en ajout seul, privée par RLS/MFA/entreprise et accessible aux inspecteurs et administrateurs autorisés à la visite. Le JSON canonique conservé permet de recalculer exactement le SHA-256 depuis ses octets UTF-8. Les copies photos se trouvent dans `<chantier>/archives/<visite>/<opération>/…`, les annexes et logos dans `<chantier>/visites/<visite>/sources/<opération>/…`. Les clients ne peuvent pas les créer, remplacer ou supprimer. Les copies de pièces réglementaires restent interdites aux invités ; elles ne contournent pas les droits de la bibliothèque. Les photos originales situées dans une visite terminée, ou référencées par ses réponses, sont protégées des mutations clientes.

Sur le rapport, **Sources de la visite** affiche le mode, la date, l’empreinte, le manifeste et un export ZIP portable contenant les fichiers. L’export vérifie chaque taille et chaque empreinte avant de rendre le ZIP. Le moteur PDF utilise le contexte et les copies de cette archive, et vérifie aussi les empreintes des images. Une nouvelle publication exige en base l’identifiant et l’empreinte d’une archive de la même visite. Le suivi actuel des corrections reste visible dans l’application ; il ne réécrit pas les constats archivés.

**Anciennes visites :** aucun état passé n’est inventé. Le bouton **Archiver les sources actuelles** crée une unique `reprise_historique`, datée à la copie, depuis les sources alors disponibles. Cette distinction figure dans l’interface, l’export et les nouveaux PDF. Les PDF déjà publiés ne sont ni modifiés ni supprimés. Une archive manquante ou un fichier absent bloque seulement la nouvelle génération ; les versions antérieures restent consultables. Il n’y a pas de reprise automatique en masse des 95 visites. Les avenants constituent le prochain lot.

**Validation :** 64 tests Node réussis. `security-db-archives.sql`, après le schéma complet à deux entreprises, vérifie les refus d’accès, le manifeste incomplet, un référentiel changé, la clôture avec photo/NC/délai, le rejeu, l’immuabilité, la reprise historique, les invités et le MFA. Les tests Node couvrent la copie, les octets falsifiés, les fichiers absents, le conflit final, l’export ZIP et le moteur PDF. La recette navigateur utilise le composant réel avec données fictives et couvre échec puis reprise. TypeScript/build et lint sans erreur sont requis avant livraison.

**Déploiement et exploitation :** appliquer 063 et enregistrer `20260914180063` avant de basculer l’image validée ; recharger les anciennes pages de visite. La migration ne clôture aucune visite existante. Une ancienne image ne pourra plus clôturer ni publier sans préparation d’archive : corriger en avant plutôt que retirer ces garanties. Les copies non publiées après panne ne sont jamais supprimées automatiquement, car une réponse réseau perdue peut cacher un commit. Leur inventaire et une politique de rétention restent des opérations d’exploitation séparées. Les empreintes détectent l’altération ; elles ne remplacent pas une sauvegarde externe avec test de restauration ni un horodatage certifié.

### Livraison des archives

Les PR **68** et **69** ont livré le lot 9, avec RLS explicite aussi sur la préparation privée. La migration `20260914180063` est appliquée et `main` **`324b803`** est déployé ; CI des PR et de main réussies. Le conteneur utilise l’image `32fa1d2edd57…`, reste sain sous `node` et écoute seulement sur localhost. L’image précédente est conservée sous `securionis-app:rollback-41c9dce-20260914`.

Une reprise historique réelle, identifiée par **`175bc87f-c5ff-4eab-855c-66c7a4a5192f`**, a été validée le 14 septembre. Le JSON canonique et les quatre fichiers (3 549 344 octets) ont été vérifiés par empreintes. Le ZIP téléchargé depuis la session utilisateur a également été rouvert et contrôlé. Aucun PDF n’a été réédité ou envoyé pour ce test. Les compteurs métier ont évolué pendant le travail du fait d’une nouvelle visite ; après migration ils étaient de 96 visites, 126 réponses et 86 écarts, avec les 91 lignes de sauvegarde toujours conservées.

## 27. Avenants après clôture — lot 10 (migration 064)

Le rapport propose un historique d’avenants et une rédaction avec **objet**, **motif** et **complément ou rectification**. La prévisualisation présente le texte avant **Valider et figer l’avenant**. L’avenant cite la visite, le rapport choisi, son archive et l’avenant précédent. Une archive des sources et un PDF de rapport existant sont requis. Les constats clôturés, les NC d’origine et les anciennes versions ne sont jamais réouverts ou réécrits. Une rectification ultérieure est un nouvel avenant explicite. Le suivi opérationnel des NC reste une action distincte.

Les brouillons et demandes en attente sont conservés localement, séparés par compte, entreprise et visite. Avant le premier envoi, l’UUID et le contenu exact sont enregistrés. Après une réponse incertaine, seul ce même envoi peut être repris. Le rejeu d’une publication réussie retrouve son numéro avant toute nouvelle génération de PDF. Un conflit confirmé conserve le texte et demande une relecture avec un nouvel identifiant. Reprendre une copie déjà éditable crée une copie indépendante ; aucune copie n’est purgée automatiquement. L’export individuel JSON permet de conserver le texte hors du navigateur ; ces brouillons d’avenants restent distincts des sauvegardes de réponses de `/compte/saisies`.

`visite_avenants` est en ajout seul avec RLS restrictive entreprise et MFA. La préparation vérifie le rôle inspecteur/administrateur et l’affectation actuelle. La publication privilégiée les revérifie sous verrou de visite, avec l’archive, le rapport, l’auteur, la numérotation et le précédent observé. Une publication concurrente est refusée. L’avenant et son journal d’audit sont inscrits atomiquement. Le PDF reçoit un chemin neuf `…/visites/<visite>/avenants/<opération>/<sha256>.pdf`, inaccessible aux écritures clientes. Les coupures ne provoquent aucun effacement automatique de fichier. Les téléchargements vérifient le chemin, le type et le SHA-256.

Objet : 5–200 caractères ; motif : 5–1 000 ; contenu : 20–20 000. La génération est limitée à dix avenants par heure et par compte, avec refus si le quota est indisponible. L’horodatage du PDF est celui de la préparation serveur validée, acceptée pour publication pendant quinze minutes. L’horodatage d’insertion est conservé séparément. Cette traçabilité applicative ne constitue pas une signature électronique qualifiée.

L’envoi d’un rapport affiche le nombre d’avenants joints et transmet la liste relue. L’API refuse une liste périmée, vérifie chaque PDF d’avenant et joint l’historique complet au rapport. Le cumul des pièces est limité à 25 Mo. Après l’envoi, une procédure sous verrou marque uniquement le dossier dont le rapport et le dernier avenant correspondent encore aux pièces transmises ; un nouvel avenant repasse le dossier à transmettre. Les identifiants réellement envoyés figurent dans le journal. La recette utilise un service d’email simulé et n’envoie aucun message réel.

**Validation :** 72 tests Node, TypeScript/build et lint sans erreur. `security-db-avenants.sql` vérifie la publication unique, le rejeu, le précédent concurrent, les frontières d’entreprise/MFA, l’auteur désaffecté, l’immuabilité et le marquage exact des pièces envoyées. La recette navigateur sur le composant réel couvre la perte de réponse après publication et un avenant concurrent, avec conservation du brouillon. Les PDF d’exemple d’une et quatre pages ont été rendus puis inspectés visuellement.

**Livraison :** appliquer 064 et inscrire `20260914200064`, puis basculer l’image validée en conservant celle de `324b803`. Les anciennes pages doivent être rechargées avant envoi lorsqu’un avenant existe ; elles ne peuvent pas omettre silencieusement les nouvelles pièces. Aucun avenant fictif n’est publié en production. Le durcissement transversal et la recette finale constituent l’étape suivante.


### Livraison des avenants

PR **70**, source `a4d0198`, fusion `88511f0`, migration `20260914200064`. CI réussie et VPS sain sur l’image `408df4e23703…`. Recette réelle du rapport : archive présente, historique vide et rédaction d’avenant disponible ; aucun avenant fictif ni email créé. Retour arrière `securionis-app:rollback-324b803-20260914`.

## 28. Durcissement transversal et recette finale

Les limites décrites dans les sections historiques concernent leur lot à sa date. Le présent état complète les lots 7 à 10 : séparation d’entreprise, résolution guidée des conflits, archives de sources et avenants sont livrés. Le durcissement ci-dessous constitue le lot 11.

**S10 GitHub.** `main` exige une PR, le contrôle `Type-check & build` sur une branche à jour et la résolution des discussions, y compris pour les administrateurs. Les poussées forcées et suppressions sont refusées. Aucune approbation tierce n’est inventée pour le propriétaire seul : le nombre obligatoire de reviewers reste zéro. Secret scanning, protection des poussées contenant des secrets et correctifs de sécurité Dependabot sont activés. Le scan initial a retourné zéro alerte ouverte ; cela ne prouve pas l’absence de tout secret historique.

**S11 Dépendances.** Mise à jour des dépendances compatibles, SDK Anthropic `0.91.1` et override UUID `11.1.1` pour ExcelJS. Audit npm : zéro vulnérabilité connue au contrôle du 14 septembre 2026. Le test exporte puis relit un vrai classeur Excel. La CI exécute aussi `npm audit --audit-level=moderate` ; une nouvelle alerte bloque une future livraison et doit être qualifiée.

**S12 Sessions.** Réglages Supabase enregistrés : durée maximale 8 h, absence de renouvellement 1 h, nouveaux JWT 900 s. La rotation avec détection de réutilisation reste activée (tolérance 10 s). Plusieurs appareils restent autorisés pour les inspecteurs. Ces limites sont contrôlées au renouvellement : un JWT déjà émis reste valable jusqu’à son échéance. Le navigateur verrouille la vue et interrompt le périmètre local après 30 minutes sans interaction dans un onglet ; les autres onglets reçoivent le verrou. Les brouillons sont conservés, sans chiffrement du stockage navigateur ajouté. Ce verrou d’interface n’est pas une preuve de réauthentification côté serveur.

**S13 Quotas et envois.** Toutes les anciennes routes utilisant `checkRateLimit` refusent l’opération si le compteur échoue ou ne renvoie pas exactement `true`. Les paramètres sont bornés côté serveur et la migration 065 empêche le débordement par saturation. Un email de visite exige une sélection explicite, 50 destinataires au maximum, des adresses valides et une liste encore accessible ; aucune entrée invalide n’élargit l’envoi. Une intention de transmission doit être inscrite avant l’appel au prestataire. Le résultat est corrélé par UUID ; une confirmation de journal indisponible est signalée. Une panne après l’envoi reste une issue à vérifier auprès du prestataire avant de recommencer. Ce lot ne promet pas une transaction distribuée ni un plafond monétaire global des prestataires.

**S14 CSP.** Chaque document reçoit un nonce serveur neuf, transmis à Next.js et aux scripts rendus ; rendu dynamique et `private, no-store`. Les scripts inline sans nonce, attributs d’événement et l’évaluation JavaScript sont interdits en production. La compilation WASM reste autorisée pour OpenCV. Quatre fonctions génératrices de code sont remplacées dans une copie officielle vérifiée par SHA-256 ; le nom `opencv-csp.js` évite l’ancien cache. Les fichiers et connexions Supabase sont limités à l’origine du projet. Les styles inline restent nécessaires à l’interface et ne donnent pas une permission d’exécuter du JavaScript. Une API sans session répond JSON 401.

**Recette.** Tests Node, tests SQL sur PostgreSQL 17 jetable à deux entreprises, build, TypeScript et lint. OpenCV réel testé avec génération de chaînes interdite : matrices, couleur, seuillage, ORB, CLAHE, redimensionnement, appariement et homographie. Test navigateur OpenCV sous CSP stricte réussi. Les 14 scripts de la page de connexion du build local portent le nonce attendu, sans `unsafe-eval`. Les emails de recette restent simulés. Une recette mobile physique et une restauration de sauvegarde hors production restent à organiser dans le cadre de l’exploitation.

**Livraison.** Appliquer 065 avant bascule, conserver l’image `88511f0`, vérifier le conteneur, les en-têtes réels et la CI de main. Les protections GitHub et réglages Auth sont indépendants de l’image Docker et restent actifs lors d’un retour arrière applicatif. Recharger les anciennes pages pour la sélection explicite des destinataires et la nouvelle CSP.


**Conseiller Supabase au contrôle final :** 0 erreur, 12 avertissements concernant des fonctions `SECURITY DEFINER` volontairement appelables par les utilisateurs connectés. Il s’agit de la clôture, des préparations d’archive/avenant, de la synchronisation CAS, de la suppression de brouillon et des prédicats RLS/MFA/entreprise. Leurs gardes et grants sont couverts par les tests SQL ; retirer aveuglément leur exécution casserait les contrôles métier. Les avertissements restent visibles et ne sont pas présentés comme supprimés. Les trois suggestions informatives « RLS Enabled No Policy » concernent les tables privées de sauvegarde des 91 réponses, de rattachement des anciens fichiers et de préparation des archives : l’absence de politique cliente est volontaire et ferme leur accès.

## 29. Cycle des actions correctives — premier lot

Une NC se traite depuis **Chantier → Non-conformités → Ouvrir le suivi de correction**. Le clic « Marquer conforme » est remplacé par un parcours explicite :

1. **Planifier** : responsable libre (personne ou entreprise intervenante, 2–200 caractères) et échéance calendaire. La NC passe d’ouverte à en cours de correction. La planification peut être ajustée tant que la correction n’est pas soumise.
2. **Soumettre** : preuve écrite de 20–5 000 caractères décrivant les travaux, les contrôles et leurs références. La NC devient **À vérifier**, reste active et compte dans les retards.
3. **Vérifier** : un inspecteur actuellement affecté au chantier ou un administrateur de la même entreprise saisit une conclusion de 10–5 000 caractères, puis valide la correction ou demande une reprise motivée. Une reprise retourne à l’étape de correction et conserve les anciennes preuves.

La vérification est une action distincte ; ce lot n’impose pas un second utilisateur différent du rédacteur. Le responsable désigné peut ne pas avoir de compte : sa saisie n’accorde aucun accès et ne déclenche aucun message. Les invités consultent selon leurs accès existants et ne réalisent pas ces actions. Les NC corrigées avant ce lot restent corrigées et sont explicitement signalées comme historiques, sans preuve ou validation reconstituée.

**Affichage.** La liste du chantier propose les NC actives, celles à vérifier, les échéances dépassées et les corrigées. Tri par échéance ; une date égale à aujourd’hui n’est pas en retard. Le jour de référence est celui de Suisse. Une échéance passée peut être enregistrée pour reprendre fidèlement une obligation existante. Les NC sans planification ne sont pas faussement classées dans les retards. Le détail montre l’auteur, la date, la planification, les preuves, les demandes de reprise et la validation dans un historique chronologique.

**Sécurité et cohérence.** Migration 066 : `ecart_suivis` séparé des constats figés, `ecart_evenements` en ajout seul. RLS entreprise/MFA et accès au chantier, aucune écriture directe cliente ou service sur ces deux tables. `avancer_cycle_ecart` vérifie l’utilisateur, son rôle, son entreprise et son affectation actuelle ; verrou visite puis NC, comparaison de révision, opération UUID idempotente. État, événement et journal d’audit sont enregistrés dans une transaction. Une panne d’audit annule tout. Un ancien UUID ne peut servir à une autre demande. Le changement direct du statut via PostgREST est bloqué, y compris depuis l’ancienne interface. Les constats, réponses et rapports archivés restent figés ; une correction ne réécrit pas un PDF existant et n’invente pas un avenant. La présence d’un suivi empêche de supprimer la NC et son historique par une suppression directe du parent.

**Erreurs et connexion.** Le premier lot nécessite une connexion. Le formulaire reste en mémoire dans la page : aucun mode hors ligne ni conservation après fermeture de page n’est promis. Une réponse incertaine verrouille la demande et permet de renvoyer exactement le même UUID et les mêmes champs ; une réponse tardive ne crée pas de doublon. Un conflit impose une relecture, affiche le suivi actualisé et conserve les textes saisis. Aucun écrasement silencieux. Les appels sont liés au compte et à l’entreprise observés. L’API borne le corps pendant sa lecture à 24 000 octets et applique un quota de 60 tentatives par heure et utilisateur, fermé en cas de panne ; le quota HTTP ne constitue pas une limite globale des appels directs à la RPC.

**Recette.** Tests de validation/API et tests SQL sur PostgreSQL 17 jetable : transitions, preuves, état historique, changement direct interdit, rejeu ancien, concurrence réelle, droits administrateur/inspecteur/invité, autre entreprise, MFA, préservation du constat clôturé et annulation sur panne du journal. Recette navigateur du composant réel avec services simulés : perte de réponse après enregistrement, reprise sans doublon, soumission, demande de reprise et conflit avec brouillon conservé. Aucun suivi fictif ni email de recette n’est créé en production.

**Livraison.** Appliquer `066_cycle_actions_correctives.sql` et inscrire `20260914230066` avant la bascule de l’image. La migration n’altère aucun statut existant. Préserver l’image précédente et vérifier l’accès au suivi après déploiement. Un retour à l’ancienne image conserve l’intégrité des données mais son ancien bouton de correction reste refusé par la base : ne pas retirer cette protection pour faire fonctionner un ancien client. Recharger les pages ouvertes avant le déploiement.

**Suites identifiées.** Pièces jointes et photos de preuve conservées avec empreinte, délégation à un intervenant authentifié, règle configurable de validation par une autre personne, rappels configurables, tableau transversal multi-chantiers et export d’un dossier de correction. Ces fonctions ne sont pas comprises dans ce premier lot ; aucun rappel automatique n’est activé.

## 30. Pièces et photos de preuve des corrections

Le cycle accepte **jusqu’à cinq pièces facultatives par soumission**, en PDF, JPEG ou PNG, de 1 octet à 5 Mo chacune. La preuve écrite reste obligatoire. Après la planification, l’inspecteur choisit ses fichiers, confirme leur envoi, puis soumet la correction. Un fichier sélectionné mais non confirmé bloque cette soumission jusqu’à son envoi ou son retrait de la sélection. Les photos soumises disposent d’un aperçu ; les pièces sont téléchargeables dans la dernière preuve et dans l’événement historique correspondant.

**Conservation.** La migration 067 crée le bucket privé `ecart-preuves` et `ecart_pieces`. Chaque objet porte un chemin neuf comprenant entreprise, NC, UUID de dépôt et SHA-256. Le serveur détecte le format à partir de la signature binaire, borne les octets pendant leur lecture et calcule l’empreinte. Aucun écrasement n’est autorisé. Le téléchargement vérifie à nouveau chemin, taille et empreinte avant de servir les octets. Les PDF sont proposés en téléchargement ; seuls JPEG/PNG peuvent être affichés dans la page, avec type explicite, `nosniff` et absence de cache privé. Ce contrôle d’intégrité ne constitue ni une analyse antivirus ni une attestation de la réalité des travaux photographiés.

**Droits.** Une préparation non soumise n’est visible que par son déposant, dans le périmètre de la NC. Après soumission, elle suit les accès existants au constat, avec les gardes entreprise et MFA. Les invités restent en consultation. Les fichiers Storage ne sont pas directement accessibles aux clients : l’API vérifie la ligne avec le client utilisateur, puis télécharge les octets avec le client serveur. Le dépôt exige un inspecteur actuellement affecté ou un administrateur de la même entreprise, un suivi en cours de correction et sa révision exacte. Ces droits sont revérifiés en base lors de l’enregistrement. Limite HTTP : 20 tentatives de dépôt par heure et utilisateur, fermée si le compteur est indisponible.

**Soumission atomique.** `avancer_cycle_ecart_v2` inclut la sélection exacte d’UUID de pièces dans la demande idempotente. Les pièces doivent appartenir au déposant, à la même NC et à la révision préparée. État du cycle, association des pièces, événement et journal sont enregistrés ensemble. Une panne annule l’ensemble. La référence `soumission_id` distingue la dernière preuve des preuves antérieures ; une demande de reprise conserve l’historique et une nouvelle soumission ne récupère pas silencieusement ses anciennes pièces. L’ancienne RPC textuelle reste compatible avec les demandes sans fichier et leurs UUID existants.

**Reprise.** Une réponse perdue après dépôt permet de renvoyer le même fichier sous le même UUID ; un objet déjà présent est relu et comparé avant confirmation. Après une soumission incertaine, le texte et la sélection exacte restent verrouillés jusqu’au rejeu. Si la révision a changé, retirer les anciennes sélections puis choisir à nouveau les fichiers pour la révision relue. Le retrait de la sélection ne supprime pas un objet déjà envoyé. Les objets restés sans soumission demeurent privés ; aucune purge automatique n’est introduite, car une réponse perdue ne prouve pas l’échec de la publication. Leur politique de conservation et leur nettoyage contrôlé constituent un travail d’exploitation restant. Les brouillons de ce cycle restent en mémoire de page, sans garantie de récupération après fermeture.

**Recette et livraison.** Tests Node des formats, limites de flux, droits avant accès privilégié, empreintes, doublons, sélection et rejeu. Tests SQL sur PostgreSQL 17 jetable : confidentialité avant/après soumission, refus inter-entreprises et MFA, rattachement unique, audit atomique, compatibilité textuelle et immuabilité. Recette navigateur avec sélection d’un vrai fichier fictif et API simulée : dépôt incertain, rejeu, soumission incertaine, historique sans doublon. Appliquer `067_pieces_preuves_corrections.sql`, inscrire `20260914235967`, puis basculer l’image après CI et conserver l’image de `672809a`. L’ancienne image ne présente pas les pièces : l’ancienne RPC refuse donc la validation ou la reprise d’une soumission qui en contient. En cas de retour arrière, remettre en service une version qui affiche ces pièces pour poursuivre leur vérification. Aucun fichier métier ni événement fictif n’est ajouté en production pour la recette.

**Suites restantes du cycle.** Rappels configurables, intervenants authentifiés, politique de second validateur, tableau transversal et export du dossier de correction. Les pièces ne modifient pas les anciens rapports de visite et ne sont pas ajoutées automatiquement à leurs emails.

## 31. Brouillons durables des corrections

Le responsable, l’échéance, le texte, les octets des fichiers sélectionnés, leur UUID et leur état de dépôt sont conservés dans IndexedDB. Le message **Brouillon conservé sur cet appareil** n’apparaît qu’après validation de la transaction locale. La base dédiée est séparée par compte et entreprise ; elle ne change pas la version des files de visites existantes. Une déconnexion ou un verrouillage interrompt les nouveaux accès, conserve les écritures déjà acceptées dans leur périmètre et ne purge pas les copies.

Après réouverture de la NC, **Copies conservées sur cet appareil → Reprendre cette copie** crée une copie indépendante. Deux onglets ne remplacent pas leurs saisies respectives. Les copies précédentes sont conservées, y compris celles contenant une ancienne demande incertaine ; rejouer cette demande retrouve son résultat via son UUID. La reprise ne transmet rien automatiquement. Si la révision serveur diffère, les actions nouvelles restent bloquées jusqu’à une comparaison explicite ; le serveur conserve son contrôle de concurrence au moment de l’envoi. Les pièces préparées pour une ancienne révision ne sont pas réaffectées silencieusement.

Avant un dépôt de fichier ou une transition, la sauvegarde locale est attendue. La demande de transition conserve son identifiant, sa révision et son contenu exact avant le premier appel réseau. Après une réponse perdue et une fermeture, **Vérifier / réessayer la même demande** renvoie ce contenu. Les textes et fichiers restent verrouillés pendant cette incertitude. Une erreur de stockage est affichée et bloque l’envoi ; la copie précédemment enregistrée demeure disponible. Les frappes rapides et les résultats d’upload sont sauvegardés dans l’ordre.

**Recette :** tests IndexedDB réels via fake-indexeddb couvrant octets, réouverture, demande exacte, copies concurrentes, comptes/entreprises distincts, verrouillage, ordre des écritures et stockage refusé. Recette navigateur sur les composants réels, avec données fictives et transport simulé : échec réseau au dépôt, rechargement et reprise du fichier, soumission dont la réponse est perdue, fermeture de l’onglet, reprise sans deuxième événement, puis blocage d’une copie périmée. Les contrôles serveur/RLS existants restent exécutés en CI.

**Limites et livraison :** ce lot assure la conservation locale après confirmation, pas un mode de démarrage totalement hors ligne : le suivi et les droits doivent être chargés pour reprendre, et toute transmission nécessite le réseau. Les copies ne sont pas chiffrées ni sauvegardées sur un autre appareil ; effacement du profil navigateur, éviction du stockage ou panne matérielle peuvent les perdre. Aucune purge automatique, aucun rappel ni message externe n’est ajouté. La recette sur appareil mobile physique, GoTrue/Storage avec deux comptes de test et la restauration d’une sauvegarde externe restent à organiser. Aucune migration Supabase nécessaire ; publier après CI, conserver l’image précédente et recharger les pages ouvertes. Une image antérieure ne sait pas lire ces copies mais ne les efface pas.

## 32. Recette connectée et préparation des sauvegardes

Le formulaire du lot 31 a été vérifié dans la session connectée : conservation locale annoncée, pièces et soumission accessibles, historique réel affiché. Aucun envoi fictif n’a été créé pour ce contrôle.

L’inventaire du 15 septembre confirme une sauvegarde physique Supabase terminée à 03:07:27 UTC. Elle ne contient pas les octets Storage. La restauration dans un nouveau projet a été préparée jusqu’au devis (10,18 USD/mois supplémentaires au contrôle), sans lancer de création ni restaurer la production.

L’outil `scripts/backup/storage.cjs` ajoute une copie chiffrée AES-256-GCM des fichiers et du manifeste, avec empreintes SHA-256, contrôle d’inventaire stable et absence d’écrasement. Une commande distincte restaure les octets dans un dossier neuf sans réseau, puis vérifie leur intégrité. Ce n’est ni une restauration automatique dans Supabase, ni un instantané coordonné base/fichiers, ni une sauvegarde externe indépendante. La destination et le transfert des données privées nécessitent une autorisation explicite ; aucune copie réelle n’est présumée réalisée par la présence de l’outil. Procédure, limites et recette : `scripts/backup/README.md`.

## 33. Recette HTTP réelle et parcours photo Safari

Le 15 septembre 2026, deux entreprises fictives et deux comptes administrateurs temporaires ont passé **30 contrôles HTTP réels** : connexion GoTrue et TOTP, accès aux lignes propres, refus inter-entreprises en lecture/écriture, accès Storage et API des NC, blocage des anciennes sessions sans second facteur après activation MFA. Les sondes utilisateur emploient la clé publique et des jetons réellement émis. Les fixtures ont été nettoyées et leur absence vérifiée séparément. Périmètre exact, statuts et limites : `docs/recette-terrain-2026-09-15.md`.

Ce contrôle complète la recette GoTrue/Storage annoncée au §31, pour deux administrateurs et le périmètre documenté. Aucun changement applicatif ni migration pour ce lot documentaire ; publier les spécifications après CI et actualiser le dépôt VPS, sans reconstruire une image identique.

**Safari :** l’utilisateur déclare avoir effectué la manipulation dans Safari. Deux visites du chantier de recette sont clôturées ; la seconde contient une réponse et une photo JPEG dont l’existence est vérifiée (HTTP 200, 795 705 octets). Son PDF a été généré sans email. Détails et distinction entre déclaration utilisateur et preuve serveur dans le procès-verbal.

**Confirmation reçue :** à la question portant sur la photo ajoutée hors ligne puis conservée après reconnexion et rechargement de Safari, l’utilisateur répond « ca fonctionne ». Le parcours photo reçoit donc un retour utilisateur positif, corroboré par la présence serveur d’une réponse et du JPEG. Les réglages réseau n’ont pas été observés directement par l’agent ; la remarque textuelle, absente, reste non testée. Cette conclusion ne valide pas le démarrage à froid, tous les appareils, ni tous les scénarios de conflit.

**Retrait de la recette :** le chantier fictif a été archivé à la demande de l’utilisateur. Il disparaît des chantiers actifs et du tableau de bord ; ses visites clôturées et leurs sources restent conservées. L’archivage est réversible et ne constitue pas une suppression définitive.

## 34. Espace disponible sur mobile et tablette

Le bandeau permanent signalant un ancien stockage local sans propriétaire n’est plus affiché, sur aucun format d’écran. Le fournisseur de session ne lance plus la détection destinée uniquement à cet affichage. Les anciennes bases locales restent conservées séparément : aucune suppression, migration ou attribution automatique à un compte n’est effectuée. L’isolation compte/entreprise, le verrouillage de session et les messages de sauvegarde/synchronisation restent actifs. Le lien **Saisies conservées** demeure disponible.

Livraison sans migration de base : reconstruire et déployer l’image applicative après CI en conservant une image de retour arrière. Recharger les pages déjà ouvertes pour supprimer le bandeau dans ces onglets.

## 35. Analyse IA des photos avec le stockage privé

L’analyse IA d’une photo échouait systématiquement (« Impossible de charger l’image pour l’analyse ») : la route téléchargeait l’URL canonique publique de la photo, qui répond 400 depuis le passage du bucket `visite-photos` en privé (SEC-03). La route retraduit désormais l’URL en chemin de stockage, exige le bucket `visite-photos` et l’identifiant de la visite en deuxième segment (`<chantier>/<visite>/…`, vérifié sur les 114 photos en base), puis télécharge avec le client de l’utilisateur : la RLS du stockage s’applique, aucune URL signée n’est produite ni transmise. Le type est déduit des octets (JPEG ou PNG), la taille reste limitée à 10 Mo, et un échec de chargement est journalisé côté serveur.

Livraison sans migration : reconstruire et déployer l’image applicative après CI en conservant une image de retour arrière.

Déployé le 22 septembre 2026 (PR #84). Symptôme reproduit avant correction : l’URL publique d’une photo réelle répond 400. Confirmé en usage réel par l’utilisateur après déploiement : l’analyse IA d’une photo de visite fonctionne.

## 36. Champ de saisie de l’assistant juridique visible

Signalé sur tablette : le champ pour poser une question n’apparaissait pas. Il existait, sous la zone des messages bornée à 320 px ; l’accueil (avertissement IA-01 et quatre suggestions) remplissait cette hauteur et repoussait le champ sous le bord de l’écran, sans indice qu’il fallait défiler. L’accueil n’est plus borné (la limite et le défilement interne ne s’appliquent qu’une fois la conversation commencée), et l’ouverture du panneau amène le champ en vue avant de lui donner le focus. Sans migration.

Déployé le 22 septembre 2026 (PR #85), confirmé en usage réel par l’utilisateur sur tablette : le champ de question est visible et l’assistant répond. Non vérifié par l’agent dans le navigateur, la page étant derrière le second facteur.

## 37. Suppression des visites du chantier de test (maintenance du 22 septembre 2026)

À la demande explicite du propriétaire, les deux visites de « AA - Chantier Test » ont été supprimées, y compris la visite terminée du 23 juillet 2026 dont le rapport avait été envoyé, ce que l’application refuse par conception. Script ponctuel `scripts/maintenance/20260922-supprimer-visites-chantier-test.sql` : sélection et dépendances vérifiées sous verrou exclusif, lignes sauvegardées dans `maintenance_privee.visites_chantier_test_20260922` (2 visites, 1 réponse, 1 version de rapport ; aucun accès API), protections désactivées puis rétablies avant la validation, 2 entrées `delete_visite` au journal d’audit, refus d’un second passage. Les deux fichiers (PDF du rapport, une photo) ont été supprimés par l’API Storage. Vérifié : 0 visite restante sur le chantier, 0 fichier restant, 4 protections actives. Le chantier lui-même est conservé. Exception de maintenance à ne pas généraliser.
