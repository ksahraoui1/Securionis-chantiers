# Contrôle du durcissement du serveur

Réponse au constat **INFRA-03** de l'audit du 4 septembre 2026 : rien ne
surveillait la configuration du serveur, qui dérive seule. Les mises à jour
automatiques et cloud-init peuvent reposer une configuration par défaut à tout
moment, et c'est arrivé — le durcissement SSH de juillet n'avait jamais pris
effet, et **la régression est passée inaperçue pendant deux mois**.

Le script relève aussi les erreurs applicatives des dernières 24 heures, en
attendant qu'un DSN Sentry soit configuré (constat OBS-01).

## Installation sur le serveur

```bash
install -m 750 scripts/controle-durcissement.sh /usr/local/sbin/
install -m 644 scripts/controle-durcissement.{service,timer} /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now controle-durcissement.timer
```

La configuration vit dans `/etc/securionis-controle.conf`, en droits `600`, et
**hors du dépôt qui est public** :

```
DOSSIER_APP=/app/securionis
DESTINATAIRE=<adresse qui reçoit les alertes>
URL_PUBLIQUE=https://<domaine>
JOURS_CERT_MIN=21
```

## Usage

| Commande | Effet |
|---|---|
| `controle-durcissement.sh` | contrôle ; email seulement en cas de dérive ou d'erreur |
| `controle-durcissement.sh --afficher` | contrôle et affiche, n'envoie rien |
| `controle-durcissement.sh --test` | force un envoi, pour éprouver la chaîne d'alerte |

Code de sortie : `0` si tout est conforme, `1` sinon.

## Ce qui est contrôlé

Connexion SSH (root et mot de passe), pare-feu, `fail2ban`, droits des fichiers
de secrets, santé du conteneur, absence du fichier d'environnement **dans**
l'image, validité de la configuration nginx et présence de sa limite de corps,
jours restants du certificat, réponse de la page de connexion.

## Deux pièges rencontrés en l'écrivant

- **`sshd -T`, jamais la relecture d'un fichier.** `sshd` retient la première
  valeur obtenue, et un durcissement numéroté au-dessus de
  `50-cloud-init.conf` est inerte. C'est exactement ce qui avait fait conclure
  à tort en juillet.
- **`grep -R` et non `-r`** pour la configuration nginx : `sites-enabled` ne
  contient que des liens symboliques, que `-r` ne suit pas. Le contrôle
  annonçait une dérive alors que la directive était bien là — faux positif
  relevé au premier essai, et un contrôle qui crie au loup est pire que pas de
  contrôle.

## Éprouvé

Les seize contrôles passent sur le serveur. La détection a été vérifiée en
provoquant une dérive réversible — droits d'une sauvegarde passés de `600` à
`644` : le contrôle l'a signalée et est sorti en `1`, puis est revenu à `0`
après remise en état.
