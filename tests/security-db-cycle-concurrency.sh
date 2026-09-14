#!/usr/bin/env bash
# Base jetable tenant uniquement, après security-db-cycle.sql.
set -euo pipefail
pg_command=("$@")
if [ ${#pg_command[@]} -eq 0 ]; then pg_command=(psql); fi
sql() { "${pg_command[@]}" -X -d securionis_tenant_test -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate "$@"; }
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
sql >"$work/first.log" 2>&1 <<'SQL' &
set application_name='cycle-first';
begin;
set local role authenticated;
set local request.jwt.claims='{"sub":"a1000000-0000-4000-8000-000000000001","aal":"aal2"}';
select avancer_cycle_ecart('b1000000-0000-4000-8000-000000000004','86000000-0000-4000-8000-000000000010',0,'planifier','Premier auteur','2026-10-01',null);
select pg_sleep(3);
commit;
SQL
first=$!
ready=false
for attempt in $(seq 1 60); do
 if [ "$(sql -Atc "select exists(select 1 from pg_stat_activity where application_name='cycle-first' and wait_event='PgSleep')")" = t ]; then ready=true;break;fi
 sleep 0.1
done
[ "$ready" = true ]
if sql >"$work/second.log" 2>&1 <<'SQL'
set role authenticated;
set request.jwt.claims='{"sub":"a1000000-0000-4000-8000-000000000001","aal":"aal2"}';
select avancer_cycle_ecart('b1000000-0000-4000-8000-000000000004','86000000-0000-4000-8000-000000000011',0,'planifier','Concurrent','2026-10-02',null);
SQL
then echo 'Modification concurrente acceptée à tort';exit 1;fi
wait "$first"
grep -q 40001 "$work/second.log"
sql -c "select test_assert((select revision=1 and responsable='Premier auteur' from ecart_suivis where ecart_id='b1000000-0000-4000-8000-000000000004') and (select count(*)=1 from ecart_evenements),'une seule transition concurrente publiée');" >/dev/null
echo CYCLE_CONCURRENCY_TESTS_OK
