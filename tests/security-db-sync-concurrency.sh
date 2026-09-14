#!/usr/bin/env bash
# Après security-db-sync.sql, sur la même base JETABLE.
set -euo pipefail
pg_command=("$@")
if [ ${#pg_command[@]} -eq 0 ]; then pg_command=(psql); fi
sql() { "${pg_command[@]}" -X -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate "$@"; }
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
wait_event() {
  for attempt in $(seq 1 60); do
    if [ "$(sql -Atc "select exists(select 1 from pg_stat_activity where application_name='$1' and $2)")" = t ]; then return 0; fi
    sleep 0.1
  done
  echo "État concurrent attendu absent : $1" >&2; return 1
}
# Premier tour : deux créations ; second tour : deux modifications d'une même révision.
for round in 1 2; do
  expected=$(sql -Atc "select coalesce((select quote_literal(sync_revision) from reponses where visite_id='20000000-0000-4000-8000-000000000008'),'null')")
  sql -v expected="$expected" -v value="gagnant-$round" >"$work/first.log" 2>&1 <<'SQL' &
set application_name='fixture-sync-first';
begin;
set local role authenticated;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000002","aal":"aal1"}';
select synchroniser_reponse('20000000-0000-4000-8000-000000000008','60000000-0000-4000-8000-000000000001',:expected,gen_random_uuid(),'conforme',:'value','{}');
select pg_sleep(3);
commit;
SQL
  first_pid=$!
  wait_event fixture-sync-first "wait_event='PgSleep'"
  sql -v expected="$expected" >"$work/second.log" 2>&1 <<'SQL' &
set application_name='fixture-sync-second';
set role authenticated;
set request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000002","aal":"aal1"}';
select synchroniser_reponse('20000000-0000-4000-8000-000000000008','60000000-0000-4000-8000-000000000001',:expected,gen_random_uuid(),'conforme','perdant','{}');
SQL
  second_pid=$!
  wait_event fixture-sync-second "wait_event_type='Lock'"
  wait "$first_pid"
  if wait "$second_pid"; then echo 'Écrasement concurrent accepté' >&2; exit 1; fi
  grep -q 40001 "$work/second.log"
  sql -c "select test_assert((select count(*)=1 and min(remarque)='gagnant-$round' from reponses where visite_id='20000000-0000-4000-8000-000000000008'),'une seule écriture concurrente retenue')" >/dev/null
done
echo SECURITY_CONCURRENT_SYNC_TESTS_OK
