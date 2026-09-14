-- Après security-db-tenant.sql, uniquement dans sa base jetable.
\set ON_ERROR_STOP on
\connect securionis_tenant_test
\ir ../supabase/migrations/063_archives_visites.sql
begin;
select test_assert((select relrowsecurity from pg_class where oid='securionis_prive.preparations_archives'::regclass),'préparations privées avec RLS');
create function test_code(requete text, attendu text) returns void language plpgsql as $$ begin
 begin execute requete; exception when others then if sqlstate=attendu then return; end if; raise; end;
 raise exception 'TEST: requête autorisée à tort %',requete;
end $$;
set role authenticated;
set request.jwt.claims='{"sub":"a2000000-0000-4000-8000-000000000001","aal":"aal2"}';
select test_refuse($q$select preparer_archive_visite('f1000000-0000-4000-8000-000000000001',gen_random_uuid(),null)$q$);
select test_refuse($q$select enregistrer_preparation_archive(gen_random_uuid(),'f2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001',repeat('a',64),'[]','cloture')$q$);
select test_refuse($q$select * from securionis_prive.preparations_archives$q$);
select test_refuse($q$insert into visite_archives(id,visite_id,auteur_id,mode,contenu,sha256) values(gen_random_uuid(),'f2000000-0000-4000-8000-000000000001',auth.uid(),'cloture','{}',repeat('a',64))$q$);
select sync_revision as revision from reponses where visite_id='f2000000-0000-4000-8000-000000000001' \gset
select synchroniser_reponse_v2('f2000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000003',:'revision',gen_random_uuid(),'non_conforme','Protection manquante',array['https://project.supabase.co/storage/v1/object/public/visite-photos/c2000000-0000-4000-8000-000000000001/f2000000-0000-4000-8000-000000000001/avant.jpg']);
select jsonb_build_array(jsonb_build_object('reponse_id',id,'delai','2026-09-30')) as ecarts from reponses where visite_id='f2000000-0000-4000-8000-000000000001' \gset
select preparer_cloture_visite('f2000000-0000-4000-8000-000000000001')->>'empreinte' as empreinte \gset
select test_code(format($q$select cloturer_visite('f2000000-0000-4000-8000-000000000001',%L,'[]',null,null,'71000000-0000-4000-8000-000000000001')$q$,:'empreinte'),'22023');
select preparer_archive_visite('f2000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001',:'empreinte') as preparation \gset
reset role;
-- Modification du référentiel : la base de clôture affichée doit devenir invalide.
update points_controle set critere='Critère changé' where id='d2000000-0000-4000-8000-000000000003';
set role authenticated;
select test_code(format($q$select preparer_archive_visite('f2000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001',%L)$q$,:'empreinte'),'40001');
select preparer_cloture_visite('f2000000-0000-4000-8000-000000000001')->>'empreinte' as empreinte \gset
select preparer_archive_visite('f2000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001',:'empreinte') as preparation \gset
reset role;
-- Fichiers factices uniquement : on teste la validation du manifeste et les politiques.
create temp table manifeste as select jsonb_agg(f||jsonb_build_object('chemin',case when f->>'bucket'='visite-photos' then 'c2000000-0000-4000-8000-000000000001/archives/f2000000-0000-4000-8000-000000000001/' else 'c2000000-0000-4000-8000-000000000001/visites/f2000000-0000-4000-8000-000000000001/sources/' end||'71000000-0000-4000-8000-000000000001/72000000-0000-4000-8000-000000000001/'||repeat('a',64)||case when f->>'type'='image' then '.jpg' else '.pdf' end,'sha256',repeat('a',64),'taille',42,'mime',case when f->>'type'='image' then 'image/jpeg' else 'application/pdf' end)) as fichiers from jsonb_array_elements(:'preparation'::jsonb->'fichiers') f;
select test_assert((select jsonb_array_length(fichiers)=3 from manifeste),'photo et deux documents réglementaires inclus');
insert into storage.objects(bucket_id,name) select distinct f->>'bucket',f->>'chemin' from manifeste cross join lateral jsonb_array_elements(fichiers) f;
select fichiers from manifeste \gset
set role service_role;
select test_refuse(format($q$select enregistrer_preparation_archive('71000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',%L,%L,'cloture')$q$,:'empreinte',:'fichiers'));
select test_code(format($q$select enregistrer_preparation_archive('71000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001',%L,'[]','cloture')$q$,:'empreinte'),'22023');
select enregistrer_preparation_archive('71000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001',:'empreinte',:'fichiers','cloture');
set role authenticated;
select test_assert((preparer_archive_visite('f2000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001',:'empreinte')->>'preparee')::boolean,'rejeu préparation sans nouvelle copie');
select cloturer_visite('f2000000-0000-4000-8000-000000000001',:'empreinte',:'ecarts','Personne test','Remarque finale','71000000-0000-4000-8000-000000000001');
select test_assert((select count(*)=1 from visite_archives),'archive publiée avec clôture');
select test_assert((select count(*)=1 from ecarts where reponse_id is not null),'NC créée une seule fois');
select test_assert((select exists(select 1 from jsonb_array_elements(contenu::jsonb->'source'->'ecarts') e where e->>'description'='Protection manquante' and e->>'delai'='2026-09-30') from visite_archives),'NC et délai final figés dans les sources');
select test_assert((select contenu::jsonb->'source'->'visite'->>'remarques_generales'='Remarque finale' and contenu::jsonb->'source'->'visite'->>'statut'='terminee' from visite_archives),'paramètres finaux de clôture figés');
select test_assert((cloturer_visite('f2000000-0000-4000-8000-000000000001',:'empreinte',:'ecarts','Personne test','Remarque finale','71000000-0000-4000-8000-000000000001')->>'deja_appliquee')::boolean,'clôture et archive idempotentes');
select test_refuse($q$update visite_archives set contenu='{}'$q$);
select test_refuse($q$delete from visite_archives$q$);
select test_refuse($q$insert into storage.objects(bucket_id,name) values('visite-photos','c2000000-0000-4000-8000-000000000001/archives/f2000000-0000-4000-8000-000000000001/faux.jpg')$q$);
select test_refuse($q$insert into storage.objects(bucket_id,name) values('visite-photos','c2000000-0000-4000-8000-000000000001/f2000000-0000-4000-8000-000000000001/faux.jpg')$q$);
with x as (delete from storage.objects where name like '%/sources/%' returning id) select test_assert(count(*)=0,'copies de documents non supprimables') from x;
reset role;
-- Simuler l'objet d'une photo historique, puis vérifier qu'il ne peut être remplacé/supprimé.
insert into storage.objects(bucket_id,name) values('visite-photos','c2000000-0000-4000-8000-000000000001/f2000000-0000-4000-8000-000000000001/source.jpg');
update points_controle set critere='Référentiel futur' where id='d2000000-0000-4000-8000-000000000003';
select test_assert((select contenu::jsonb->'source'->'reponses'->0->'points_controle'->>'critere'='Critère changé' from visite_archives),'archive indépendante du référentiel futur');
select test_refuse($q$update visite_archives set contenu='{}'$q$);
set role authenticated;
with x as(update storage.objects set name='c2000000-0000-4000-8000-000000000001/deplace.jpg' where name like '%/source.jpg' returning id) select test_assert(count(*)=0,'photo close non déplaçable') from x;
with x as(delete from storage.objects where name like '%/source.jpg' returning id) select test_assert(count(*)=0,'photo close non supprimable') from x;
set request.jwt.claims='{"sub":"a1000000-0000-4000-8000-000000000001","aal":"aal2"}';
select test_assert((select count(*)=0 from visite_archives),'archive B invisible à A');
-- Visite A fermée avant migration, sans réponse : la reprise reste datée d'aujourd'hui.
select preparer_archive_visite('f1000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001',null) as historique \gset
select test_assert(:'historique'::jsonb->>'mode'='reprise_historique','mode historique explicite');
set role service_role;
select enregistrer_preparation_archive('73000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',:'historique'::jsonb->>'empreinte','[]','reprise_historique');
set role authenticated;
select test_assert((select mode='reprise_historique' from visite_archives),'archive historique conservée séparément');
reset role;
insert into chantier_inspecteurs(chantier_id,inspecteur_id) values('c2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000003');
set role authenticated;
set request.jwt.claims='{"sub":"a2000000-0000-4000-8000-000000000003","aal":"aal1"}';
select test_assert((select count(*)=1 from visites) and (select count(*)=0 from visite_archives),'invité affecté : archives réglementaires réservées');
select test_assert((select count(*)=0 from storage.objects where name like '%/sources/%'),'copies réglementaires non exposées aux invités');
select test_refuse($q$select preparer_archive_visite('f2000000-0000-4000-8000-000000000001',gen_random_uuid(),null)$q$);
set request.jwt.claims='{"sub":"a2000000-0000-4000-8000-000000000001","aal":"aal1"}';
select test_assert((select count(*)=0 from visite_archives),'MFA obligatoire sur archives');
select test_refuse($q$select preparer_archive_visite('f2000000-0000-4000-8000-000000000001',gen_random_uuid(),null)$q$);
reset role;
rollback;
select 'ARCHIVES_TESTS_OK' as resultat;
