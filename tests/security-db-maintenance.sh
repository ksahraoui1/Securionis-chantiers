#!/usr/bin/env bash
# Base jetable uniquement, après la suite de synchronisation.
set -euo pipefail
pg_command=("$@")
if [ ${#pg_command[@]} -eq 0 ]; then pg_command=(psql); fi
sql() { "${pg_command[@]}" -X -v ON_ERROR_STOP=1 "$@"; }
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
root=$(cd "$(dirname "$0")/.." && pwd)
source_sql="$root/scripts/maintenance/20260914-supprimer-reponses-non-necessaires.sql"
sql >/dev/null <<'SQL'
insert into visites(id,chantier_id,inspecteur_id,statut,date_visite) values('20000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','en_cours','2026-09-14');
insert into points_controle(id,intitule) select ('61000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'Non nécessaire de test' from generate_series(1,91) i;
insert into reponses(visite_id,point_controle_id,valeur,remarque) select '20000000-0000-4000-8000-000000000009',id,'pas_necessaire','fixture' from points_controle where id::text like '61000000-%';
update visites set statut='terminee' where id='20000000-0000-4000-8000-000000000009';
SQL
if sql <"$source_sql" >"$work/refus.log" 2>&1; then echo 'Empreinte différente acceptée' >&2; exit 1; fi
grep -q 'sélection confirmée a changé' "$work/refus.log"
expected=$(sql -Atc "select encode(sha256(convert_to(jsonb_agg(to_jsonb(r) order by r.id)::text,'UTF8')),'hex') from reponses r where valeur='pas_necessaire'")
[[ "$expected" =~ ^[0-9a-f]{64}$ ]]
sed "s/50365a3e6c439d4ae5035557d762bbcf98773d06d274f5ab7970b611f8cc1e78/$expected/g" "$source_sql" >"$work/fixture.sql"
sql <"$work/fixture.sql" >"$work/success.log" 2>&1
if sql <"$work/fixture.sql" >"$work/rejeu.log" 2>&1; then echo 'Deuxième suppression acceptée' >&2; exit 1; fi
sql >/dev/null <<'SQL'
select test_assert((select count(*)=91 from maintenance_privee.reponses_non_necessaires_20260914),'91 copies complètes conservées');
select test_assert(not has_schema_privilege('authenticated','maintenance_privee','usage') and not has_table_privilege('authenticated','maintenance_privee.reponses_non_necessaires_20260914','select'),'sauvegarde inaccessible aux clients');
select test_assert((select relrowsecurity from pg_class where oid='maintenance_privee.reponses_non_necessaires_20260914'::regclass),'RLS sauvegarde active');
select test_assert(not exists(select 1 from reponses where valeur='pas_necessaire'),'seules les réponses sélectionnées supprimées');
select test_assert((select tgenabled='O' from pg_trigger where tgrelid='reponses'::regclass and tgname='proteger_reponse_visite'),'protection rétablie');
SQL
echo SECURITY_MAINTENANCE_TESTS_OK
