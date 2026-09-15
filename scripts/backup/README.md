# Sauvegarde et recette de restauration

## Périmètre vérifié le 15 septembre 2026

Le formulaire de correction livré par la PR 78 est visible dans la session réelle : conservation locale annoncée, pièces et soumission disponibles, historique existant conservé. Aucun texte ou fichier fictif n’a été enregistré en production pour ce contrôle.

Le tableau Supabase présente des sauvegardes physiques quotidiennes. La sauvegarde du 15 septembre à 03:07:27 UTC est marquée terminée. Ces sauvegardes comprennent la base, **pas les octets des fichiers Storage**. La restauration vers un nouveau projet est proposée dans la même organisation et région ; le devis observé est de 10,18 USD/mois supplémentaires (calcul et disque). Ce tarif est une observation datée, à relire avant toute création.

Sources : [sauvegardes Supabase](https://supabase.com/docs/guides/platform/backups), [restauration vers un nouveau projet](https://supabase.com/docs/guides/platform/clone-project). Les configurations Auth, les clés API et les fichiers nécessitent des vérifications séparées. Les tâches externes éventuelles (pg_cron, pg_net, webhooks) doivent être inventoriées avant le clonage pour éviter un envoi involontaire depuis la copie.

## Outil de sauvegarde des fichiers

`storage.cjs` est un outil d’exploitation Node.js 22, distinct de l’application. Il utilise les API HTTP Storage avec fetch natif pour **lire** les buckets et leurs fichiers ; aucune dépendance npm supplémentaire. Il n’appelle aucune API d’écriture, de suppression ou de restauration distante.

- Inventaire récursif et paginé, avec vérification de stabilité avant/après copie. Si le stockage évolue, aucun reçu de succès n’est écrit : ce n’est pas un instantané transactionnel avec la base.
- Chiffrement AES-256-GCM avec IV neuf pour chaque fichier et pour le manifeste. La clé comporte 32 octets aléatoires ; elle n’entre jamais dans le dépôt, l’image ou les arguments de commande.
- Noms locaux dérivés d’une empreinte bucket/chemin ; le manifeste chiffré conserve les correspondances, métadonnées, tailles et SHA-256 des octets.
- Dossiers neufs uniquement (0700), fichiers 0600, aucun écrasement. Limites : 200 Mio par fichier, 2 Gio au total, 100 000 objets. Un refus réseau, une taille incohérente ou un dépassement interrompt la sauvegarde.
- `receipt.json` apparaît seulement après succès complet. Il expose uniquement format, date, compteurs et enveloppe cryptographique. Un dossier sans reçu reste incomplet.
- La commande `restore` fonctionne sans réseau : elle déchiffre dans un dossier neuf, vérifie chaque empreinte et taille, puis écrit `VERIFIED.json`. Elle n’importe rien dans Supabase. Un échec peut laisser le manifeste ou des fichiers déjà vérifiés dans le dossier privé, mais aucun marqueur de réussite.

Une copie et sa clé sur le même VPS ne protègent pas contre sa perte ou sa compromission. Elles constituent un premier contrôle de récupérabilité, pas une sauvegarde externe complète. Une destination indépendante, la garde séparée de la clé, la fréquence et la rétention restent à définir. Aucune planification ni purge automatique n’est installée par ce lot.

## Exécution autorisée

Avant la première exécution, faire autoriser explicitement la copie des fichiers privés vers le serveur de sauvegarde et le déchiffrement dans le dossier de recette. La création d’un projet Supabase facturé exige également l’accord sur le coût affiché. Ne jamais choisir la restauration sur le projet de production pour une recette.

Préparer un parent privé et une clé de 32 octets dans un fichier 0600 hors dépôt, avec création exclusive. Ne jamais remplacer une clé existante. Les variables requises pour la sauvegarde sont `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` et `BACKUP_KEY_FILE`. Seule cette dernière est nécessaire à la restauration locale.

Exemple dans l’image applicative existante, avec les chemins privés approuvés. `IMAGE_VALIDEE` désigne l’image déjà contrôlée ; les dossiers de sortie doivent être neufs. Le script est monté sous `/app/scripts` ; il utilise uniquement les modules natifs de Node.js.

```bash
docker run --rm --read-only --cap-drop ALL --security-opt no-new-privileges \
  --memory=256m --cpus=0.5 --user 0 \
  --env-file /app/securionis/.env \
  -e BACKUP_KEY_FILE=/run/backup.key \
  -v /etc/securionis-storage-backup.key:/run/backup.key:ro \
  -v /app/securionis/scripts/backup/storage.cjs:/app/scripts/storage.cjs:ro \
  -v /var/backups/securionis:/backup \
  --entrypoint node IMAGE_VALIDEE /app/scripts/storage.cjs backup /backup/SAUVEGARDE_NEUVE

docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
  --memory=256m --cpus=0.5 --user 0 \
  -e BACKUP_KEY_FILE=/run/backup.key \
  -v /etc/securionis-storage-backup.key:/run/backup.key:ro \
  -v /app/securionis/scripts/backup/storage.cjs:/app/scripts/storage.cjs:ro \
  -v /var/backups/securionis:/backup \
  --entrypoint node IMAGE_VALIDEE /app/scripts/storage.cjs restore /backup/SAUVEGARDE_NEUVE /backup/RECETTE_NEUVE
```

La sauvegarde ne charge pas la base de données, les comptes Auth ou les paramètres du projet. Après une restauration de base dans un environnement indépendant, comparer les migrations, les comptes et entreprises, les compteurs métier, les politiques RLS et les références de fichiers avec la copie Storage correspondante. Ne pas annoncer une reprise complète avant ces contrôles et un test applicatif sans emails réels.

## Validation du code

`tests/storage-backup.test.cjs` couvre le chiffrement du manifeste, les octets restaurés, les permissions, le changement d’inventaire, le refus de lecture, la mauvaise clé, l’altération, la limite de flux et la conservation d’une destination existante. Ces tests emploient des fichiers fictifs et ne prouvent pas à eux seuls la restauration de la production. L’exécution réelle et ses résultats doivent être consignés séparément.
