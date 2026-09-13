-- Base jetable uniquement ; reprend les tests MFA et suppression du premier lot.
\ir security-db.sql
alter table profiles add column nom text default 'Utilisateur de test';
alter table visites add column email_envoye boolean default false;
alter table visites add column updated_at timestamptz default now();
alter table storage.objects add column bucket_id text default 'rapports';
create table storage.buckets(id text primary key, public boolean);
insert into storage.buckets values ('rapports',false),('visite-photos',false);
create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
drop policy fixture_access on storage.objects;
\ir ../supabase/migrations/048_buckets_prives.sql
\ir ../supabase/migrations/051_stockage_ecriture_cloisonnee.sql
update visites set rapport_url=chantier_id::text || '/rapport_20260913_' || left(id::text,8) || '.pdf';
insert into storage.objects(id,bucket_id,name) select gen_random_uuid(),'rapports',rapport_url from visites;
insert into storage.objects(id,bucket_id,name) values
(gen_random_uuid(),'rapports','base-documentaire/test.pdf'),
(gen_random_uuid(),'rapports','points-controle/test.pdf'),
(gen_random_uuid(),'rapports','logos/test.png');
\ir ../supabase/migrations/057_bibliotheque_et_rapports_storage.sql
\ir ../supabase/migrations/058_versions_rapports.sql
\ir ../supabase/migrations/057_bibliotheque_et_rapports_storage.sql
\ir ../supabase/migrations/058_versions_rapports.sql
select test_assert((select count(*)=1 from rapport_versions where historique), 'reprise historique idempotente');
set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000003","aal":"aal1"}';
select test_assert((select count(*)=0 from storage.objects where name like 'base-documentaire/%'), 'bibliothèque invisible aux invités');
select test_assert((select count(*)=1 from storage.objects where name like 'points-controle/%'), 'pièces de checklist conservées');
set request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","aal":"aal1"}';
select test_assert((select count(*)=1 from storage.objects where name like 'base-documentaire/%'), 'bibliothèque inspecteur conservée');
with changed as (update storage.objects set name=name where name ~ '/rapport_[0-9]{8}_' returning id)
select test_assert(count(*)=0, 'remplacement PDF refusé inspecteur') from changed;
do $$ begin
 begin insert into storage.objects(id,bucket_id,name) values(gen_random_uuid(),'rapports','10000000-0000-4000-8000-000000000001/visites/20000000-0000-4000-8000-000000000002/rapport.pdf'); raise exception 'INSERT PDF client accepté'; exception when insufficient_privilege then null; end;
end $$;
insert into storage.objects(id,bucket_id,name) values(gen_random_uuid(),'rapports','10000000-0000-4000-8000-000000000001/rapports-comparaison/test.pdf');
insert into storage.objects(id,bucket_id,name) values(gen_random_uuid(),'rapports','chantiers/10000000-0000-4000-8000-000000000001/docs/test.pdf');
set request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","aal":"aal2"}';
with changed as (delete from storage.objects where name ~ '/rapport_[0-9]{8}_' returning id)
select test_assert(count(*)=0, 'suppression PDF refusée admin client') from changed;
with changed as (update storage.objects set name=name where name ~ '/rapport_[0-9]{8}_' returning id)
select test_assert(count(*)=0, 'remplacement PDF refusé admin client') from changed;
do $$ begin
 begin update storage.objects set name='10000000-0000-4000-8000-000000000001/rapport_forge.pdf' where name='logos/test.png'; raise exception 'Déplacement vers PDF accepté'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Publication réelle, puis conflit concurrent et refus d'écriture sur l'archive.
insert into storage.objects(id,bucket_id,name) values(gen_random_uuid(),'rapports','10000000-0000-4000-8000-000000000001/visites/20000000-0000-4000-8000-000000000002/versions/50000000-0000-4000-8000-000000000001.pdf');
set role service_role;
select publier_version_rapport('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001/rapport_20260913_20000000.pdf',repeat('a',64),'Correction documentée','{"fixture":true}');
select test_assert((select count(*)=2 from rapport_versions), 'ancienne et nouvelle versions conservées');
select test_assert((select rapport_url like '%/versions/50000000-0000-4000-8000-000000000001.pdf' and not email_envoye from visites), 'référence et état email publiés ensemble');
do $$ begin
 begin perform publier_version_rapport('50000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','ancienne-reference',repeat('b',64),'Version concurrente','{}'); raise exception 'Conflit accepté'; exception when serialization_failure then null; end;
 begin update rapport_versions set motif='falsifié'; raise exception 'Archive modifiable service'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 begin update rapport_versions set motif='falsifié'; raise exception 'Archive modifiable postgres'; exception when insufficient_privilege then null; end;
end $$;
delete from chantier_inspecteurs;
set role service_role;
do $$ begin
 begin perform publier_version_rapport('50000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002',null,repeat('b',64),'Auteur retiré','{}'); raise exception 'Auteur retiré accepté'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select test_assert(not has_function_privilege('authenticated','public.publier_version_rapport(uuid,uuid,uuid,text,text,text,jsonb)','execute'), 'publication RPC interdite au client');
-- Le SELECT des archives doit suivre la RLS des visites, sans privilege serveur.
drop policy fixture_access on visites;
create policy fixture_lecture on visites for select to authenticated using (inspecteur_id=auth.uid() or user_role()='administrateur');
set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000003","aal":"aal1"}';
select test_assert((select count(*)=0 from rapport_versions), 'archive invisible sans accès visite');
set request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","aal":"aal1"}';
select test_assert((select count(*)=0 from rapport_versions), 'archives protégées par MFA');
reset role;
select 'SECURITY_VERSIONS_TESTS_OK' as resultat;
