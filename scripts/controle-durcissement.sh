#!/usr/bin/env bash
#
# Contrôle périodique du durcissement du serveur (constat INFRA-03, audit du
# 4 septembre 2026) et relevé des erreurs applicatives (OBS-01, en attendant
# Sentry).
#
# Ce contrôle existe parce qu'une régression est déjà passée inaperçue pendant
# deux mois : le durcissement SSH de juillet n'avait jamais pris effet, et rien
# ne le disait. Les mises à jour automatiques et cloud-init peuvent reposer une
# configuration par défaut à tout moment.
#
# ⚠️ Le dépôt est public : aucun identifiant d'infrastructure ici. L'adresse de
# destination et le dossier de l'application viennent de /etc/securionis-controle.conf.
#
# Usage :
#   controle-durcissement.sh            contrôle, envoie un email si dérive
#   controle-durcissement.sh --afficher contrôle et affiche, sans rien envoyer
#   controle-durcissement.sh --test     force un envoi, même sans dérive
#
# Code de sortie : 0 si tout est conforme, 1 sinon.

set -uo pipefail

CONFIG=/etc/securionis-controle.conf
# shellcheck source=/dev/null
[ -r "$CONFIG" ] && . "$CONFIG"
: "${DOSSIER_APP:=/app/securionis}"
: "${DESTINATAIRE:=}"
: "${URL_PUBLIQUE:=}"
: "${JOURS_CERT_MIN:=21}"

MODE=${1:-}
ecarts=()
constats=()

# releve <libelle> <attendu> <obtenu>
releve() {
  local libelle=$1 attendu=$2 obtenu=$3
  if [ "$attendu" = "$obtenu" ]; then
    constats+=("  OK      $libelle : $obtenu")
  else
    constats+=("  DERIVE  $libelle : $obtenu (attendu : $attendu)")
    ecarts+=("$libelle : $obtenu au lieu de $attendu")
  fi
}

# --- SSH : la régression de juillet, celle qui a motivé ce contrôle ----------
# `sshd -T` donne la configuration EFFECTIVE. Relire un fichier ne prouve rien :
# sshd retient la première valeur obtenue, et un durcissement numéroté au-dessus
# de 50-cloud-init.conf est inerte.
eff=$(sshd -T 2>/dev/null)
racine=$(printf '%s\n' "$eff" | awk '/^permitrootlogin /{print $2}')
motdepasse=$(printf '%s\n' "$eff" | awk '/^passwordauthentication /{print $2}')
[ "$racine" = "without-password" ] && racine="prohibit-password"
releve "SSH connexion root" "prohibit-password" "${racine:-inconnu}"
releve "SSH mot de passe" "no" "${motdepasse:-inconnu}"

# --- Pare-feu et bannissement ------------------------------------------------
releve "Pare-feu UFW" "active" "$(ufw status 2>/dev/null | awk 'NR==1{print $2}')"
releve "fail2ban" "active" "$(systemctl is-active fail2ban 2>/dev/null)"

# --- Secrets -----------------------------------------------------------------
for f in "$DOSSIER_APP"/.env "$DOSSIER_APP"/.env.bak-*; do
  [ -e "$f" ] || continue
  releve "Droits $(basename "$f")" "600" "$(stat -c %a "$f" 2>/dev/null)"
done

# --- Application -------------------------------------------------------------
etat=$(cd "$DOSSIER_APP" 2>/dev/null && docker compose ps --format '{{.Status}}' 2>/dev/null | head -1)
case "$etat" in
  *healthy*) releve "Conteneur" "sain" "sain" ;;
  *)         releve "Conteneur" "sain" "${etat:-absent}" ;;
esac

# Le fichier d'environnement ne doit pas se trouver dans l'image (SEC-02).
if (cd "$DOSSIER_APP" 2>/dev/null && docker compose exec -T app test -e /app/.env 2>/dev/null); then
  releve "Fichier .env dans l'image" "absent" "PRESENT"
else
  releve "Fichier .env dans l'image" "absent" "absent"
fi

# --- Reverse proxy -----------------------------------------------------------
if nginx -t >/dev/null 2>&1; then
  releve "Configuration nginx" "valide" "valide"
else
  releve "Configuration nginx" "valide" "invalide"
fi
# ⚠️ `grep -R` et non `-r` : sites-enabled ne contient que des liens
# symboliques vers sites-available, et `-r` ne les suit pas. Avec `-r` ce
# contrôle annonçait une dérive alors que la directive était bien là — un
# faux positif relevé au premier essai.
taille=$(grep -RhoE 'client_max_body_size[[:space:]]+[0-9]+[a-zA-Z]*' /etc/nginx/sites-enabled/ 2>/dev/null | head -1 | awk '{print $2}')
# Contrôle de présence, non d'égalité : la valeur exacte peut évoluer, son
# absence est ce qui casse l'envoi des rapports de comparaison (413 muet).
if [ -n "$taille" ]; then
  releve "Limite de corps nginx" "$taille" "$taille"
else
  releve "Limite de corps nginx" "definie" "absente"
fi

# --- Certificat --------------------------------------------------------------
if [ -n "$URL_PUBLIQUE" ]; then
  fin=$(echo | openssl s_client -servername "${URL_PUBLIQUE#https://}" -connect "${URL_PUBLIQUE#https://}:443" 2>/dev/null \
        | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  if [ -n "$fin" ]; then
    jours=$(( ( $(date -d "$fin" +%s) - $(date +%s) ) / 86400 ))
    if [ "$jours" -ge "$JOURS_CERT_MIN" ]; then
      releve "Certificat (jours restants)" "$jours" "$jours"
    else
      releve "Certificat (jours restants)" ">= $JOURS_CERT_MIN" "$jours"
    fi
  fi
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$URL_PUBLIQUE/login" 2>/dev/null)
  releve "Page de connexion" "200" "${code:-injoignable}"
fi

# --- Erreurs applicatives des dernières 24 h (OBS-01) ------------------------
# Palliatif tant qu'aucun DSN Sentry n'est configuré : sans cela, aucune erreur
# de l'application ne laisse de trace consultée par qui que ce soit.
erreurs=$(cd "$DOSSIER_APP" 2>/dev/null && docker compose logs --since 24h app 2>&1 \
          | grep -iE '\[audit\]|\[rate-limit\]|\[stockage\]|Error|Exception|ECONNREFUSED' \
          | grep -viE 'favicon|/_next/' | head -40)
nb_erreurs=$(printf '%s' "$erreurs" | grep -c . )

rapport="Contrôle du $(date '+%d.%m.%Y à %H:%M') sur $(hostname)

$(printf '%s\n' "${constats[@]}")

Erreurs applicatives sur 24 h : $nb_erreurs"
[ "$nb_erreurs" -gt 0 ] && rapport="$rapport

$erreurs"

[ "$MODE" = "--afficher" ] && { printf '%s\n' "$rapport"; [ ${#ecarts[@]} -eq 0 ] && exit 0 || exit 1; }

# --- Alerte ------------------------------------------------------------------
doit_alerter=0
[ ${#ecarts[@]} -gt 0 ] && doit_alerter=1
[ "$nb_erreurs" -gt 0 ] && doit_alerter=1
[ "$MODE" = "--test" ] && doit_alerter=1

if [ "$doit_alerter" -eq 1 ]; then
  logger -t securionis-controle "dérives : ${#ecarts[@]}, erreurs 24h : $nb_erreurs"
  cle=$(grep -m1 '^RESEND_API_KEY=' "$DOSSIER_APP/.env" 2>/dev/null | cut -d= -f2-)
  expediteur=$(grep -m1 '^RESEND_FROM_EMAIL=' "$DOSSIER_APP/.env" 2>/dev/null | cut -d= -f2-)
  if [ -n "$cle" ] && [ -n "$expediteur" ] && [ -n "$DESTINATAIRE" ]; then
    sujet="Securionis — ${#ecarts[@]} dérive(s), $nb_erreurs erreur(s) sur 24 h"
    corps=$(printf '%s' "$rapport" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')
    curl -s -o /dev/null -X POST https://api.resend.com/emails \
      -H "Authorization: Bearer $cle" -H "Content-Type: application/json" \
      -d "{\"from\":\"Contrôle Securionis <$expediteur>\",\"to\":[\"$DESTINATAIRE\"],\"subject\":\"$sujet\",\"text\":$corps}"
  fi
fi

[ ${#ecarts[@]} -eq 0 ] && exit 0 || exit 1
