-- Uniquement sur une base vide et jetable. Aucun secret ni identifiant réel.
\set ON_ERROR_STOP on
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create schema storage;
grant usage on schema public, auth, storage to authenticated, anon, service_role;
create function auth.uid() returns uuid language sql stable as $$ select (current_setting('request.jwt.claims', true)::jsonb->>'sub')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select current_setting('request.jwt.claims', true)::jsonb $$;
create table auth.mfa_factors(user_id uuid, status text);
create table public.profiles(id uuid primary key, role text);
create table public.chantiers(id uuid primary key);
create table public.chantier_inspecteurs(id uuid default gen_random_uuid(), chantier_id uuid references chantiers, inspecteur_id uuid);
create table public.visites(id uuid primary key, chantier_id uuid references chantiers, inspecteur_id uuid, statut text, rapport_url text, date_visite date);
create table public.reponses(id uuid primary key, visite_id uuid references visites on delete cascade, valeur text);
create table public.ecarts(id uuid primary key, reponse_id uuid references reponses);
create table storage.objects(id uuid primary key, name text);
create function public.user_role() returns text language sql security definer stable set search_path = '' as $$ select role from public.profiles where id = auth.uid() $$;
grant select, insert, update, delete on all tables in schema public, storage to authenticated, service_role;
do $$ declare t record; begin
 for t in select schemaname, tablename from pg_tables where schemaname in ('public', 'storage') loop
  execute format('alter table %I.%I enable row level security', t.schemaname, t.tablename);
  execute format('create policy fixture_access on %I.%I for all to authenticated using (true) with check (true)', t.schemaname, t.tablename);
 end loop;
end $$;
create function public.test_assert(ok boolean, message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'TEST: %', message; end if; end $$;
insert into profiles values ('00000000-0000-4000-8000-000000000001','administrateur'), ('00000000-0000-4000-8000-000000000002','inspecteur'), ('00000000-0000-4000-8000-000000000003','invité');
insert into auth.mfa_factors values ('00000000-0000-4000-8000-000000000001','verified');
insert into chantiers values ('10000000-0000-4000-8000-000000000001');
insert into chantier_inspecteurs(chantier_id, inspecteur_id) values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002');
insert into visites values ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','en_cours',null,'2026-09-13'), ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','terminee',null,'2026-09-13');
insert into reponses values ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','non_conforme');
insert into ecarts values ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
insert into storage.objects values (gen_random_uuid(),'test/photo.png');
\ir ../supabase/migrations/055_mfa_api_rls.sql
\ir ../supabase/migrations/056_rapports_et_suppression_visites.sql
-- Réapplication : migrations idempotentes, sans ouverture de politique.
\ir ../supabase/migrations/055_mfa_api_rls.sql
\ir ../supabase/migrations/056_rapports_et_suppression_visites.sql
set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","aal":"aal1"}';
select test_assert(not session_mfa_valide(), 'admin aal1 refusé');
select test_assert((select count(*) = 0 from visites), 'lecture MFA bloquée');
select test_assert((select count(*) = 0 from storage.objects), 'Storage MFA bloqué');
with modified as (update visites set statut='terminee' returning id) select test_assert(count(*) = 0, 'écriture MFA bloquée') from modified;
do $$ begin
 begin insert into chantiers values (gen_random_uuid()); raise exception 'INSERT MFA accepté'; exception when insufficient_privilege then null; end;
 begin perform supprimer_visite_brouillon('20000000-0000-4000-8000-000000000001'); raise exception 'DELETE MFA accepté'; exception when insufficient_privilege then null; end;
end $$;
set request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","aal":"aal2"}';
select test_assert(session_mfa_valide() and (select count(*) = 2 from visites), 'admin aal2 admis');
select test_assert((select count(*) = 1 from storage.objects), 'Storage aal2 admis');
do $$ begin
 begin update visites set rapport_url='base-documentaire/secret.pdf'; raise exception 'référence modifiable'; exception when insufficient_privilege then null; end;
 begin insert into visites(id,rapport_url) values (gen_random_uuid(),'secret.pdf'); raise exception 'INSERT référence accepté'; exception when insufficient_privilege then null; end;
 begin update visites set chantier_id=gen_random_uuid(); raise exception 'rattachement modifiable'; exception when insufficient_privilege then null; end;
 begin perform supprimer_visite_brouillon('20000000-0000-4000-8000-000000000002'); raise exception 'visite clôturée supprimée'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
set role service_role;
update visites set rapport_url='rapport-serveur.pdf' where id='20000000-0000-4000-8000-000000000002';
reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000003","aal":"aal1"}';
select test_assert(session_mfa_valide(), 'invité non enrôlé admis sans droit supplémentaire');
do $$ begin
 begin perform supprimer_visite_brouillon('20000000-0000-4000-8000-000000000001'); raise exception 'invité non rattaché admis'; exception when insufficient_privilege then null; end;
end $$;
set request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","aal":"aal1"}';
select test_assert(session_mfa_valide(), 'inspecteur non enrôlé admis');
reset role;
delete from chantier_inspecteurs;
set role authenticated;
do $$ begin
 begin perform supprimer_visite_brouillon('20000000-0000-4000-8000-000000000001'); raise exception 'auteur retiré admis'; exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into chantier_inspecteurs(chantier_id,inspecteur_id) values ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002');
set role authenticated;
select test_assert((supprimer_visite_brouillon('20000000-0000-4000-8000-000000000001')->>'reponses')::int = 1, 'suppression autorisée');
select test_assert((select count(*) = 0 from reponses) and (select count(*) = 0 from ecarts), 'cascade complète');
reset role;
select test_assert((select count(*) = 1 from visites), 'visite clôturée intacte');
select test_assert(not has_function_privilege('anon', 'public.session_mfa_valide()', 'execute'), 'RPC MFA fermée à anon');
select test_assert(not has_function_privilege('anon', 'public.supprimer_visite_brouillon(uuid)', 'execute'), 'RPC suppression fermée à anon');
select 'SECURITY_DATABASE_TESTS_OK' as resultat;
