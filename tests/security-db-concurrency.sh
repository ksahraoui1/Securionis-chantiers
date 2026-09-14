#!/usr/bin/env bash
# Uniquement après security-db-cloture.sql, sur la même base JETABLE.
set -euo pipefail
pg_command=("$@")
if [ ${#pg_command[@]} -eq 0 ]; then pg_command=(psql); fi
sql() { "${pg_command[@]}" -X -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate "$@"; }
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
sql >/dev/null <<'SQL'
insert into visites(id,chantier_id,inspecteur_id,statut,date_visite) values
('20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','en_cours','2026-09-14'),
('20000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','en_cours','2026-09-14');
insert into reponses(id,visite_id,point_controle_id,valeur,remarque) values
('30000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000005','60000000-0000-4000-8000-000000000001','non_conforme','original'),
('30000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000006','60000000-0000-4000-8000-000000000001','non_conforme','original');
SQL
wait_event() {
  for attempt in $(seq 1 60); do
    if [ "$(sql -Atc "select exists(select 1 from pg_stat_activity where application_name='$1' and $2)")" = t ]; then return 0; fi
    sleep 0.1
  done
  echo "État concurrent attendu absent : $1" >&2; return 1
}
# La clôture prend le verrou en premier ; la réponse tardive attend puis est refusée.
sql >"$work/close.log" 2>&1 <<'SQL' &
set application_name='fixture-close-first';
begin;
set local role authenticated;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000002","aal":"aal1"}';
select preparer_cloture_visite('20000000-0000-4000-8000-000000000005')->>'empreinte' as empreinte \gset
select cloturer_visite('20000000-0000-4000-8000-000000000005',:'empreinte','[{"reponse_id":"30000000-0000-4000-8000-000000000005","delai":"7 jours"}]',null,null,'70000000-0000-4000-8000-000000000005');
select pg_sleep(4);
commit;
SQL
close_pid=$!
wait_event fixture-close-first "wait_event='PgSleep'"
sql >"$work/write-late.log" 2>&1 <<'SQL' &
set application_name='fixture-write-late';
set role authenticated;
set request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000002","aal":"aal1"}';
update reponses set remarque='trop tard' where id='30000000-0000-4000-8000-000000000005';
SQL
write_pid=$!
wait_event fixture-write-late "wait_event_type='Lock'"
wait "$close_pid"
if wait "$write_pid"; then echo 'Écriture après clôture acceptée' >&2; exit 1; fi
grep -q 42501 "$work/write-late.log"
sql -c "select test_assert((select remarque='original' from reponses where id='30000000-0000-4000-8000-000000000005'),'écriture concurrente refusée après clôture')" >/dev/null
# La réponse prend le verrou en premier ; une clôture préparée auparavant attend
# puis voit une empreinte différente et annule toute la transaction.
expected=$(sql -Atc "select empreinte_constats_visite('20000000-0000-4000-8000-000000000006')")
[[ "$expected" =~ ^[0-9a-f]{64}$ ]]
sql >"$work/write-first.log" 2>&1 <<'SQL' &
set application_name='fixture-write-first';
begin;
set local role authenticated;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000002","aal":"aal1"}';
update reponses set remarque='modification prioritaire' where id='30000000-0000-4000-8000-000000000006';
select pg_sleep(4);
commit;
SQL
write_pid=$!
wait_event fixture-write-first "wait_event='PgSleep'"
sql -v expected="$expected" >"$work/close-late.log" 2>&1 <<'SQL' &
set application_name='fixture-close-late';
set role authenticated;
set request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000002","aal":"aal1"}';
select cloturer_visite('20000000-0000-4000-8000-000000000006',:'expected','[{"reponse_id":"30000000-0000-4000-8000-000000000006","delai":"7 jours"}]',null,null,'70000000-0000-4000-8000-000000000006');
SQL
close_pid=$!
wait_event fixture-close-late "wait_event_type='Lock'"
wait "$write_pid"
if wait "$close_pid"; then echo 'Clôture avec empreinte périmée acceptée' >&2; exit 1; fi
grep -q 40001 "$work/close-late.log"
sql -c "select test_assert((select statut='en_cours' from visites where id='20000000-0000-4000-8000-000000000006') and not exists(select 1 from ecarts where reponse_id='30000000-0000-4000-8000-000000000006'),'clôture concurrente annulée sans écart partiel')" >/dev/null
echo SECURITY_CONCURRENT_CLOTURE_TESTS_OK
