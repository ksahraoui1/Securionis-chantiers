-- Base séparée et jetable : jamais exécuter sur Supabase/production.
\set ON_ERROR_STOP on
create database securionis_tenant_test;
\connect securionis_tenant_test
create schema auth;
create schema storage;
create schema extensions;
do $$ begin
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
end $$;
grant usage on schema public,auth,storage,extensions to authenticated,anon,service_role;
alter default privileges in schema public,storage grant select,insert,update,delete on tables to authenticated,service_role;
alter default privileges in schema public grant execute on functions to authenticated,anon,service_role;
alter default privileges in schema public grant usage,select on sequences to authenticated,service_role;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
create table auth.mfa_factors(user_id uuid,status text);
create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims',true),'')::jsonb $$;
create table storage.buckets(id text primary key,name text,public boolean,allowed_mime_types text[],file_size_limit bigint);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid,unique(bucket_id,name));
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
\ir ../supabase/migrations/001_create_phases_categories.sql
\ir ../supabase/migrations/002_create_points_controle.sql
\ir ../supabase/migrations/003_create_chantiers.sql
\ir ../supabase/migrations/004_create_destinataires.sql
\ir ../supabase/migrations/005_create_visites.sql
\ir ../supabase/migrations/006_create_reponses.sql
\ir ../supabase/migrations/007_create_ecarts.sql
\ir ../supabase/migrations/008_create_chantier_inspecteurs.sql
\ir ../supabase/migrations/009_create_indexes.sql
\ir ../supabase/migrations/010_create_profiles.sql
\ir ../supabase/migrations/011_create_rls_policies.sql
\ir ../supabase/migrations/012_add_visite_categorie_ids.sql
\ir ../supabase/migrations/013_add_chantier_nom.sql
\ir ../supabase/migrations/014_add_visite_renseignements_par.sql
\ir ../supabase/migrations/015_create_entreprises.sql
\ir ../supabase/migrations/016_create_documents.sql
\ir ../supabase/migrations/017_add_themes_and_documents.sql
\ir ../supabase/migrations/019_add_chantier_archived.sql
\ir ../supabase/migrations/020_security_hardening.sql
\ir ../supabase/migrations/021_create_base_documentaire.sql
\ir ../supabase/migrations/022_security_rls_hardening.sql
\ir ../supabase/migrations/023_security_profiles_storage.sql
\ir ../supabase/migrations/024_role_invite_subscriptions.sql
\ir ../supabase/migrations/026_fix_categories_rls.sql
\ir ../supabase/migrations/027_security_role_trigger.sql
\ir ../supabase/migrations/028_add_visite_remarques.sql
\ir ../supabase/migrations/029_add_remarques_valeur.sql
\ir ../supabase/migrations/030_storage_private_buckets.sql
\ir ../supabase/migrations/031_ensure_storage_buckets.sql
\ir ../supabase/migrations/032_revert_storage_public.sql
\ir ../supabase/migrations/033_categories_admin_writes.sql
\ir ../supabase/migrations/034_push_subscriptions.sql
\ir ../supabase/migrations/035_add_famille_mots_cles.sql
\ir ../supabase/migrations/036_points_controle_recherche_unaccent.sql
\ir ../supabase/migrations/037_points_controle_admin_select.sql
\ir ../supabase/migrations/038_points_controle_famille_trigger.sql
\ir ../supabase/migrations/039_securite_fonctions.sql
\ir ../supabase/migrations/040_securite_user_role_revoke_public.sql
\ir ../supabase/migrations/041_documents_plan_type.sql
\ir ../supabase/migrations/042_comparaison_annotations.sql
\ir ../supabase/migrations/043_nc_depuis_annotation.sql
\ir ../supabase/migrations/044_bucket_rapports_types.sql
\ir ../supabase/migrations/045_securite_update_chantiers.sql
\ir ../supabase/migrations/046_securite_audit_logs.sql
\ir ../supabase/migrations/047_acces_inspecteur.sql
\ir ../supabase/migrations/048_buckets_prives.sql
\ir ../supabase/migrations/049_rate_limits.sql
\ir ../supabase/migrations/050_recherche_corpus_assistant.sql
\ir ../supabase/migrations/051_stockage_ecriture_cloisonnee.sql
\ir ../supabase/migrations/052_acces_visites_reponses.sql
\ir ../supabase/migrations/053_inscription_publique_fermee.sql
\ir ../supabase/migrations/054_base_documentaire_par_role.sql
\ir ../supabase/migrations/055_mfa_api_rls.sql
\ir ../supabase/migrations/056_rapports_et_suppression_visites.sql
\ir ../supabase/migrations/057_bibliotheque_et_rapports_storage.sql
\ir ../supabase/migrations/058_versions_rapports.sql
\ir ../supabase/migrations/059_cloture_transactionnelle.sql
\ir ../supabase/migrations/060_synchronisation_atomique.sql
\ir ../supabase/migrations/061_version_origine_reponses.sql
create function test_assert(ok boolean, message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'TEST: %',message; end if; end $$;
create function test_refuse(requete text) returns void language plpgsql security invoker as $$ begin
 begin execute requete; exception when insufficient_privilege then return; end;
 raise exception 'TEST: requête autorisée à tort : %',requete;
end $$;
insert into entreprises(id,nom) values('e1000000-0000-4000-8000-000000000001','Entreprise A');
insert into auth.users(id,email,raw_app_meta_data) values
 ('a1000000-0000-4000-8000-000000000001','admin-a@example.test','{"cree_par":"admin"}'),
 ('a1000000-0000-4000-8000-000000000002','inspecteur-a@example.test','{"cree_par":"admin"}'),
 ('a1000000-0000-4000-8000-000000000003','invite-a@example.test','{"cree_par":"admin"}');
set role service_role;
update profiles set entreprise_id='e1000000-0000-4000-8000-000000000001',role=case right(id::text,1) when '1' then 'administrateur' when '2' then 'inspecteur' else 'invité' end;
reset role;
insert into chantiers(id,adresse,nature_travaux,created_by) values('c1000000-0000-4000-8000-000000000001','Chantier A','Essai','a1000000-0000-4000-8000-000000000001');
insert into categories(id,libelle) values('d1000000-0000-4000-8000-000000000001','Catégorie A');
insert into themes(id,categorie_id,libelle) values('d1000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001','Thème A');
insert into points_controle(id,categorie_id,theme_id,intitule) values('d1000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000002','Point A');
insert into visites(id,chantier_id,inspecteur_id) values('f1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002');
insert into storage.objects(bucket_id,name) values('rapports','base-documentaire/ancien.pdf'),('visite-photos','c1000000-0000-4000-8000-000000000001/photo.jpg');
\ir ../supabase/migrations/062_isolation_entreprises.sql
\ir ../supabase/migrations/062_isolation_entreprises.sql
-- Deuxième entreprise créée uniquement dans cette base isolée.
insert into entreprises(id,nom) values('e2000000-0000-4000-8000-000000000001','Entreprise B');
insert into auth.users(id,email,raw_app_meta_data) values
 ('a2000000-0000-4000-8000-000000000001','admin-b@example.test','{"cree_par":"admin"}'),
 ('a2000000-0000-4000-8000-000000000002','inspecteur-b@example.test','{"cree_par":"admin"}'),
 ('a2000000-0000-4000-8000-000000000003','invite-b@example.test','{"cree_par":"admin"}'),
 ('a3000000-0000-4000-8000-000000000001','sans-entreprise@example.test','{"cree_par":"admin"}');
set role service_role;
update profiles set entreprise_id='e2000000-0000-4000-8000-000000000001',role=case right(id::text,1) when '1' then 'administrateur' when '2' then 'inspecteur' else 'invité' end where id::text like 'a200%';
reset role;
set request.jwt.claims='{"sub":"a2000000-0000-4000-8000-000000000001","aal":"aal2"}';
set role authenticated;
insert into chantiers(id,adresse,nature_travaux,created_by) values('c2000000-0000-4000-8000-000000000001','Chantier B','Essai','a2000000-0000-4000-8000-000000000001');
insert into categories(id,libelle,is_custom) values('d2000000-0000-4000-8000-000000000001','Catégorie B',true);
insert into themes(id,categorie_id,libelle) values('d2000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000001','Thème B');
insert into points_controle(id,categorie_id,theme_id,intitule,is_custom) values('d2000000-0000-4000-8000-000000000003','d2000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000002','Point B',true);
insert into visites(id,chantier_id,inspecteur_id) values('f2000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002');
insert into chantier_inspecteurs(chantier_id,inspecteur_id) values('c2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002');
insert into storage.objects(bucket_id,name) values('rapports','base-documentaire/e2000000-0000-4000-8000-000000000001/neuf.pdf'),('visite-photos','c2000000-0000-4000-8000-000000000001/photo.jpg');
reset role;
set request.jwt.claims='';
insert into documents(id,chantier_id,nom,fichier_url,fichier_nom) values('b1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','Plan 1','chantiers/c1000000-0000-4000-8000-000000000001/docs/plan.pdf','plan.pdf');
insert into comparaisons(id,chantier_id,document_pe_id,document_exe_id,created_by) values('b1000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001');
insert into comparaison_annotations(id,comparaison_id,type,x,y,created_by) values('b1000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000002','rect',1,1,'a1000000-0000-4000-8000-000000000001');
insert into ecarts(id,chantier_id,description,type) values('b1000000-0000-4000-8000-000000000004','c1000000-0000-4000-8000-000000000001','Écart test','ecart_plan');
insert into comparaison_nc_links(id,annotation_id,nc_id) values('b1000000-0000-4000-8000-000000000011','b1000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000004');
insert into base_documentaire(id,entreprise_id,titre,fichier_url,fichier_nom) values('b1000000-0000-4000-8000-000000000005','e1000000-0000-4000-8000-000000000001','Bibliothèque 1','base-documentaire/e1000000-0000-4000-8000-000000000001/doc.pdf','doc.pdf');
insert into point_controle_documents(id,point_controle_id,nom,fichier_url,fichier_nom) values('b1000000-0000-4000-8000-000000000006','d1000000-0000-4000-8000-000000000003','Annexe','points-controle/e1000000-0000-4000-8000-000000000001/d1000000-0000-4000-8000-000000000003/annexe.pdf','annexe.pdf');
insert into point_controle_doc_liens(id,point_controle_id,document_id) values('b1000000-0000-4000-8000-000000000007','d1000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000005');
insert into destinataires(id,chantier_id,nom,email) values('b1000000-0000-4000-8000-000000000008','c1000000-0000-4000-8000-000000000001','Destinataire fictif','dest@example.test');
insert into subscriptions(id,user_id,stripe_customer_id) values('b1000000-0000-4000-8000-000000000009','a1000000-0000-4000-8000-000000000001','fake-customer-1');
insert into audit_logs(id,user_id,action,resource) values('b1000000-0000-4000-8000-000000000010','a1000000-0000-4000-8000-000000000001','test','chantiers');
insert into documents(id,chantier_id,nom,fichier_url,fichier_nom) values('b2000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','Plan 2','chantiers/c2000000-0000-4000-8000-000000000001/docs/plan.pdf','plan.pdf');
insert into comparaisons(id,chantier_id,document_pe_id,document_exe_id,created_by) values('b2000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001');
insert into comparaison_annotations(id,comparaison_id,type,x,y,created_by) values('b2000000-0000-4000-8000-000000000003','b2000000-0000-4000-8000-000000000002','rect',1,1,'a2000000-0000-4000-8000-000000000001');
insert into ecarts(id,chantier_id,description,type) values('b2000000-0000-4000-8000-000000000004','c2000000-0000-4000-8000-000000000001','Écart test','ecart_plan');
insert into comparaison_nc_links(id,annotation_id,nc_id) values('b2000000-0000-4000-8000-000000000011','b2000000-0000-4000-8000-000000000003','b2000000-0000-4000-8000-000000000004');
insert into base_documentaire(id,entreprise_id,titre,fichier_url,fichier_nom) values('b2000000-0000-4000-8000-000000000005','e2000000-0000-4000-8000-000000000001','Bibliothèque 2','base-documentaire/e2000000-0000-4000-8000-000000000001/doc.pdf','doc.pdf');
insert into point_controle_documents(id,point_controle_id,nom,fichier_url,fichier_nom) values('b2000000-0000-4000-8000-000000000006','d2000000-0000-4000-8000-000000000003','Annexe','points-controle/e2000000-0000-4000-8000-000000000001/d2000000-0000-4000-8000-000000000003/annexe.pdf','annexe.pdf');
insert into point_controle_doc_liens(id,point_controle_id,document_id) values('b2000000-0000-4000-8000-000000000007','d2000000-0000-4000-8000-000000000003','b2000000-0000-4000-8000-000000000005');
insert into destinataires(id,chantier_id,nom,email) values('b2000000-0000-4000-8000-000000000008','c2000000-0000-4000-8000-000000000001','Destinataire fictif','dest@example.test');
insert into subscriptions(id,user_id,stripe_customer_id) values('b2000000-0000-4000-8000-000000000009','a2000000-0000-4000-8000-000000000001','fake-customer-2');
insert into audit_logs(id,user_id,action,resource) values('b2000000-0000-4000-8000-000000000010','a2000000-0000-4000-8000-000000000001','test','chantiers');
set role authenticated;
set request.jwt.claims='{"sub":"a2000000-0000-4000-8000-000000000001","aal":"aal2"}';
select test_assert((select count(*)=1 from documents),'admin B : documents isolé');
select test_assert((select count(*)=1 from comparaisons),'admin B : comparaisons isolé');
select test_assert((select count(*)=1 from comparaison_annotations),'admin B : comparaison_annotations isolé');
select test_assert((select count(*)=1 from ecarts),'admin B : ecarts isolé');
select test_assert((select count(*)=1 from comparaison_nc_links),'admin B : comparaison_nc_links isolé');
select test_assert((select count(*)=1 from base_documentaire),'admin B : base_documentaire isolé');
select test_assert((select count(*)=1 from point_controle_documents),'admin B : point_controle_documents isolé');
select test_assert((select count(*)=1 from point_controle_doc_liens),'admin B : point_controle_doc_liens isolé');
select test_assert((select count(*)=1 from destinataires),'admin B : destinataires isolé');
select test_assert((select count(*)=1 from subscriptions),'admin B : subscriptions isolé');
select test_assert((select count(*)=1 from audit_logs),'admin B : audit_logs isolé');
select test_refuse($q$insert into point_controle_doc_liens(point_controle_id,document_id) values('d2000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000005')$q$);
select test_refuse($q$insert into comparaisons(chantier_id,document_pe_id,document_exe_id) values('c2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001')$q$);
select test_refuse($q$insert into comparaison_nc_links(annotation_id,nc_id) values('b2000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000004')$q$);
select test_assert((select count(*)=1 from chantiers),'admin B ne voit que son chantier');
select test_assert((select count(*)=1 from entreprises),'admin B ne voit que son entreprise');
select test_assert((select count(*)=3 from profiles),'admin B ne voit que ses comptes');
select test_assert((select count(*)=1 from categories) and (select count(*)=1 from points_controle),'catalogue isolé');
select test_assert((select count(*)=2 from storage.objects),'fichiers isolés y compris bibliothèque historique');
select test_refuse($q$insert into chantiers(adresse,nature_travaux,created_by) values('Usurpé','Test','a1000000-0000-4000-8000-000000000001')$q$);
select test_refuse($q$update chantiers set entreprise_id='e1000000-0000-4000-8000-000000000001'$q$);
select test_refuse($q$insert into chantier_inspecteurs(chantier_id,inspecteur_id) values('c2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002')$q$);
select test_refuse($q$insert into themes(categorie_id,libelle) values('d1000000-0000-4000-8000-000000000001','Volé')$q$);
select test_refuse($q$insert into visites(chantier_id,inspecteur_id) values('c1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002')$q$);
select test_refuse($q$select preparer_cloture_visite('f1000000-0000-4000-8000-000000000001')$q$);
select test_refuse($q$select supprimer_visite_brouillon('f1000000-0000-4000-8000-000000000001')$q$);
select test_refuse($q$select synchroniser_reponse_v2('f1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000003',null,gen_random_uuid(),'conforme',null,'{}')$q$);
select test_refuse($q$select synchroniser_reponse_v2('f2000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000003',null,gen_random_uuid(),'conforme',null,array['c1000000-0000-4000-8000-000000000001/photo.jpg'])$q$);
select test_refuse($q$insert into base_documentaire(titre,fichier_url,fichier_nom) values('Volé','base-documentaire/ancien.pdf','ancien.pdf')$q$);
select test_refuse($q$select synchroniser_reponse_v2('f2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000003',null,gen_random_uuid(),'conforme',null,'{}')$q$);
select synchroniser_reponse_v2('f2000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000003',null,gen_random_uuid(),'conforme',null,'{}');
select test_assert((select count(*)=1 from reponses),'synchronisation propre entreprise réussie');
select test_refuse($q$insert into storage.objects(bucket_id,name) values('rapports','base-documentaire/e1000000-0000-4000-8000-000000000001/vole.pdf')$q$);
select test_refuse($q$insert into storage.objects(bucket_id,name) values('rapports','base-documentaire/ancien-chemin.pdf')$q$);
select test_refuse($q$insert into storage.objects(bucket_id,name) values('visite-photos','c1000000-0000-4000-8000-000000000001/vole.jpg')$q$);
with x as(update storage.objects set name='base-documentaire/e2000000-0000-4000-8000-000000000001/vole.pdf' where name='base-documentaire/ancien.pdf' returning id) select test_assert(count(*)=0,'fichier étranger non déplaçable') from x;
with x as(delete from chantiers where id='c1000000-0000-4000-8000-000000000001' returning id) select test_assert(count(*)=0,'chantier étranger non supprimable') from x;
reset role;
-- Publication privilégiée : le serveur ne peut attribuer un auteur étranger.
update visites set statut='terminee' where id='f1000000-0000-4000-8000-000000000001';
set role service_role;
select test_refuse($q$select publier_version_rapport(gen_random_uuid(),'f1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001',null,repeat('a',64),'Version test','{}')$q$);
select test_refuse($q$update profiles set entreprise_id='e1000000-0000-4000-8000-000000000001' where id='a2000000-0000-4000-8000-000000000002'$q$);
reset role;
set role authenticated;
set request.jwt.claims='{"sub":"a1000000-0000-4000-8000-000000000001","aal":"aal2"}';
select test_assert((select count(*)=1 from visites) and (select count(*)=0 from reponses),'admin A ne voit aucune réponse B');
select test_assert((select count(*)=1 from storage.objects where name='base-documentaire/ancien.pdf'),'bibliothèque historique conservée pour A');
select test_refuse($q$update storage.objects set name='base-documentaire/autre.pdf' where name='base-documentaire/ancien.pdf'$q$);
set request.jwt.claims='{"sub":"a2000000-0000-4000-8000-000000000002","aal":"aal1"}';
select test_assert((select count(*)=1 from visites) and (select count(*)=1 from reponses),'inspecteur B affecté accès conservé');
select test_refuse($q$select supprimer_visite_brouillon('f1000000-0000-4000-8000-000000000001')$q$);
set request.jwt.claims='{"sub":"a2000000-0000-4000-8000-000000000003","aal":"aal1"}';
select test_assert((select count(*)=0 from visites) and (select count(*)=0 from base_documentaire),'invité sans affectation ne reçoit aucun accès supplémentaire');
set request.jwt.claims='{"sub":"a3000000-0000-4000-8000-000000000001","aal":"aal1"}';
select test_assert((select count(*)=0 from chantiers) and (select count(*)=0 from categories) and (select count(*)=0 from storage.objects),'compte sans entreprise fermé');
reset role;
insert into auth.mfa_factors values('a2000000-0000-4000-8000-000000000001','verified');
set role authenticated;
set request.jwt.claims='{"sub":"a2000000-0000-4000-8000-000000000001","aal":"aal1"}';
select test_assert((select count(*)=0 from chantiers) and (select count(*)=0 from storage.objects),'MFA toujours requise');
reset role;
set request.jwt.claims='';
\ir ../supabase/migrations/062_isolation_entreprises.sql
select test_assert(not has_schema_privilege('authenticated','securionis_prive','usage'),'schéma interne inaccessible');
select test_assert(not has_function_privilege('authenticated','public.synchroniser_reponse(uuid,uuid,uuid,uuid,text,text,text[])','execute'),'ancienne synchronisation reste fermée');
select 'TENANT_ISOLATION_TESTS_OK' as resultat;
