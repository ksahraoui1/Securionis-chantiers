-- Base jetable déjà préparée par les tests d'isolation et d'archives.
\set ON_ERROR_STOP on
\connect securionis_tenant_test
\ir ../supabase/migrations/064_avenants_visites.sql
begin;
create function test_code(requete text, attendu text) returns void language plpgsql as $$ begin
 begin execute requete; exception when others then if sqlstate=attendu then return; end if; raise; end;
 raise exception 'TEST: requête autorisée à tort %',requete;
end $$;
set request.jwt.claims='{"sub":"a1000000-0000-4000-8000-000000000001","aal":"aal2"}';
set role authenticated;
select preparer_archive_visite('f1000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001',null) as historique \gset
set role service_role;
select enregistrer_preparation_archive('81000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',:'historique'::jsonb->>'empreinte','[]','reprise_historique');
reset role;
insert into storage.objects(bucket_id,name) values('rapports','c1000000-0000-4000-8000-000000000001/visites/f1000000-0000-4000-8000-000000000001/versions/82000000-0000-4000-8000-000000000001.pdf');
select jsonb_build_object('archiveId',id,'archiveSha256',sha256) as source from visite_archives where id='81000000-0000-4000-8000-000000000001' \gset
set role service_role;
select publier_version_rapport('82000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',null,repeat('f',64),'Rapport test',:'source');
set role authenticated;
select rapport_url as rapport from visites where id='f1000000-0000-4000-8000-000000000001' \gset
select test_refuse($q$select publier_avenant_visite('{}',repeat('a',64))$q$);
select test_refuse($q$select confirmer_envoi_rapport('f1000000-0000-4000-8000-000000000001',auth.uid(),'faux',null)$q$);
select preparer_avenant_visite('f1000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001',:'rapport',null,'Rectification du constat','Erreur de transcription','Le complément conservé précise le constat et ses conditions.') as plan \gset
-- Deux rédacteurs ont tous deux vu le même état antérieur.
select preparer_avenant_visite('f1000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000001',:'rapport',null,'Autre rectification','Nouvelle observation','Un autre complément est préparé avant la première publication.') as concurrent \gset
reset role;
insert into storage.objects(bucket_id,name) values
 ('rapports','c1000000-0000-4000-8000-000000000001/visites/f1000000-0000-4000-8000-000000000001/avenants/83000000-0000-4000-8000-000000000001/'||repeat('a',64)||'.pdf'),
 ('rapports','c1000000-0000-4000-8000-000000000001/visites/f1000000-0000-4000-8000-000000000001/avenants/83000000-0000-4000-8000-000000000002/'||repeat('b',64)||'.pdf');
set role service_role;
select test_refuse(format($q$select publier_avenant_visite(%L,repeat('a',64))$q$,jsonb_set(:'plan'::jsonb,'{auteur_id}','"a2000000-0000-4000-8000-000000000001"')));
select publier_avenant_visite(:'plan',repeat('a',64));
select test_assert(publier_avenant_visite(:'plan',repeat('a',64))='83000000-0000-4000-8000-000000000001','publication idempotente');
select test_code(format($q$select publier_avenant_visite(%L,repeat('b',64))$q$,:'concurrent'),'40001');
select test_assert(confirmer_envoi_rapport('f1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',:'rapport',null)=false,'ne pas marquer envoyé sans le nouvel avenant');
select test_assert(confirmer_envoi_rapport('f1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',:'rapport','83000000-0000-4000-8000-000000000001'),'dossier exact confirmé');
set role authenticated;
select test_assert((select count(*)=1 from visite_avenants) and (select count(*)=1 from audit_logs where action='publish_visite_avenant'),'avenant et journal uniques');
select test_assert((select statut='terminee' and rapport_url=:'rapport' and email_envoye from visites where id='f1000000-0000-4000-8000-000000000001'),'rapport et clôture conservés');
select test_refuse($q$update visite_avenants set contenu='Réécriture interdite'$q$);
select test_refuse($q$delete from visite_avenants$q$);
select test_refuse($q$insert into visite_avenants select * from visite_avenants$q$);
with x as(delete from storage.objects where name like '%/avenants/%' returning id) select test_assert(count(*)=0,'PDF avenant non supprimable') from x;
select test_assert(preparer_avenant_visite('f1000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001',:'rapport',null,'Rectification du constat','Erreur de transcription','Le complément conservé précise le constat et ses conditions.')->'existant'->>'numero'='1','rejeu reconnu avant nouvelle génération');
select test_code(format($q$select preparer_avenant_visite('f1000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001',%L,null,'Rectification changée','Erreur de transcription','Le complément conservé précise le constat et ses conditions.')$q$,:'rapport'),'40001');
select test_code(format($q$select preparer_avenant_visite('f1000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000003','81000000-0000-4000-8000-000000000001',%L,null,'Nouveau complément','Motif conforme','Ce texte est assez long pour être admis par la validation.')$q$,:'rapport'),'40001');
select preparer_avenant_visite('f1000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000003','81000000-0000-4000-8000-000000000001',:'rapport','83000000-0000-4000-8000-000000000001','Nouveau complément','Motif conforme','Ce texte est assez long pour être admis par la validation.') as second \gset
select test_assert(:'second'::jsonb->>'numero'='2','numérotation après relecture');
reset role;
insert into storage.objects(bucket_id,name) values('rapports','c1000000-0000-4000-8000-000000000001/visites/f1000000-0000-4000-8000-000000000001/avenants/83000000-0000-4000-8000-000000000003/'||repeat('c',64)||'.pdf');
set role service_role;
select publier_avenant_visite(:'second',repeat('c',64));
select test_assert(not confirmer_envoi_rapport('f1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',:'rapport','83000000-0000-4000-8000-000000000001'),'un ancien envoi ne marque pas le nouveau dossier');
set role authenticated;
select test_assert((select not email_envoye from visites where id='f1000000-0000-4000-8000-000000000001'),'nouvel avenant à transmettre');
reset role;
insert into chantier_inspecteurs(chantier_id,inspecteur_id) values('c1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002');
set role authenticated;
set request.jwt.claims='{"sub":"a1000000-0000-4000-8000-000000000002","aal":"aal2"}';
select preparer_avenant_visite('f1000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000004','81000000-0000-4000-8000-000000000001',:'rapport','83000000-0000-4000-8000-000000000003','Préparation inspecteur','Avant désaffectation','La publication doit recontrôler l’affectation actuelle de son auteur.') as desaffecte \gset
reset role;
delete from chantier_inspecteurs where chantier_id='c1000000-0000-4000-8000-000000000001' and inspecteur_id='a1000000-0000-4000-8000-000000000002';
set role service_role;
select test_refuse(format($q$select publier_avenant_visite(%L,repeat('d',64))$q$,:'desaffecte'));
set role authenticated;
set request.jwt.claims='{"sub":"a2000000-0000-4000-8000-000000000001","aal":"aal2"}';
select test_assert((select count(*)=0 from visite_avenants),'avenant A invisible à B');
select test_refuse(format($q$select preparer_avenant_visite('f1000000-0000-4000-8000-000000000001',gen_random_uuid(),'81000000-0000-4000-8000-000000000001',%L,null,'Objet étranger','Motif étranger','Une publication inter-entreprises doit être refusée.')$q$,:'rapport'));
reset role;
insert into auth.mfa_factors values('a1000000-0000-4000-8000-000000000001','verified');
set request.jwt.claims='{"sub":"a1000000-0000-4000-8000-000000000001","aal":"aal1"}';
set role authenticated;
select test_assert((select count(*)=0 from visite_avenants),'avenants protégés par MFA');
reset role;
rollback;
select 'AVENANTS_TESTS_OK' as resultat;
