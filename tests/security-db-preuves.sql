-- Seulement sur la base PostgreSQL jetable, après la suite cycle.
\set ON_ERROR_STOP on
\connect securionis_tenant_test
\ir ../supabase/migrations/067_pieces_preuves_corrections.sql
begin;
insert into ecarts(id,chantier_id,description,type) values('b1000000-0000-4000-8000-000000000067','c1000000-0000-4000-8000-000000000001','NC de recette des pièces','ecart_plan');
create function preuve_code(requete text, attendu text) returns void language plpgsql as $$ begin
 begin execute requete; exception when others then if sqlstate=attendu then return; end if; raise; end;
 raise exception 'TEST : opération acceptée à tort %',requete;
end $$;
set request.jwt.claims='{"sub":"a1000000-0000-4000-8000-000000000001","aal":"aal2"}';
set role authenticated;
select avancer_cycle_ecart('b1000000-0000-4000-8000-000000000067','87000000-0000-4000-8000-000000000010',0,'planifier','Intervenant','2026-10-01',null);
select test_assert(avancer_cycle_ecart('b1000000-0000-4000-8000-000000000067','87000000-0000-4000-8000-000000000010',0,'planifier','Intervenant','2026-10-01',null)->>'rejeu'='true','compatibilité ancienne RPC et demande textuelle');
select test_refuse($q$select enregistrer_piece_ecart(gen_random_uuid(),'b1000000-0000-4000-8000-000000000067',auth.uid(),1,'test.pdf','application/pdf',10,repeat('a',64))$q$);
reset role;
insert into storage.objects(bucket_id,name) values
('ecart-preuves','e1000000-0000-4000-8000-000000000001/b1000000-0000-4000-8000-000000000067/87000000-0000-4000-8000-000000000001/'||repeat('a',64)||'.pdf'),
('ecart-preuves','e1000000-0000-4000-8000-000000000001/b1000000-0000-4000-8000-000000000067/87000000-0000-4000-8000-000000000002/'||repeat('b',64)||'.jpg');
set role service_role;
select enregistrer_piece_ecart('87000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000067','a1000000-0000-4000-8000-000000000001',1,'Rapport.pdf','application/pdf',10,repeat('a',64));
select enregistrer_piece_ecart('87000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000067','a1000000-0000-4000-8000-000000000001',1,'Photo.jpg','image/jpeg',20,repeat('b',64));
select test_assert(enregistrer_piece_ecart('87000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000067','a1000000-0000-4000-8000-000000000001',1,'Rapport.pdf','application/pdf',10,repeat('a',64))->>'id'='87000000-0000-4000-8000-000000000001','rejeu upload');
select preuve_code($q$select enregistrer_piece_ecart('87000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000067','a1000000-0000-4000-8000-000000000001',1,'Modifie.pdf','application/pdf',10,repeat('a',64))$q$,'40001');
select test_refuse($q$select enregistrer_piece_ecart(gen_random_uuid(),'b1000000-0000-4000-8000-000000000067','a2000000-0000-4000-8000-000000000001',1,'Intrus.pdf','application/pdf',10,repeat('a',64))$q$);
select preuve_code($q$select enregistrer_piece_ecart(gen_random_uuid(),'b1000000-0000-4000-8000-000000000067','a1000000-0000-4000-8000-000000000001',1,'../secret.pdf','application/pdf',10,repeat('a',64))$q$,'22023');
select test_refuse($q$update ecart_pieces set sha256=repeat('c',64)$q$);
reset role;
insert into chantier_inspecteurs(chantier_id,inspecteur_id) values('c1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002');
set request.jwt.claims='{"sub":"a1000000-0000-4000-8000-000000000002","aal":"aal2"}';
set role authenticated;
select test_assert((select count(*)=0 from ecart_pieces),'pièces non soumises privées au déposant');
select preuve_code($q$select avancer_cycle_ecart_v2('b1000000-0000-4000-8000-000000000067',gen_random_uuid(),1,'soumettre','Intervenant','2026-10-01','Preuve décrivant les corrections réalisées.',array['87000000-0000-4000-8000-000000000001']::uuid[])$q$,'40001');
set request.jwt.claims='{"sub":"a1000000-0000-4000-8000-000000000001","aal":"aal2"}';
select test_assert((select count(*)=2 from ecart_pieces),'déposant voit ses pièces');
select test_assert((select count(*)=0 from storage.objects where bucket_id='ecart-preuves'),'accès Storage direct fermé');
select test_refuse($q$insert into storage.objects(bucket_id,name) values('ecart-preuves','faux.pdf')$q$);
select preuve_code($q$select avancer_cycle_ecart_v2('b1000000-0000-4000-8000-000000000067',gen_random_uuid(),1,'soumettre','Intervenant','2026-10-01','Preuve décrivant les corrections réalisées.',array['87000000-0000-4000-8000-000000000001','87000000-0000-4000-8000-000000000001']::uuid[])$q$,'22023');
select preuve_code($q$select avancer_cycle_ecart_v2('b1000000-0000-4000-8000-000000000067',gen_random_uuid(),1,'soumettre','Intervenant','2026-10-01','Preuve décrivant les corrections réalisées.',array[gen_random_uuid()]::uuid[])$q$,'40001');
-- Échec audit après association : tout est annulé, y compris l’association.
reset role;
create function preuve_audit_panne() returns trigger language plpgsql as $$ begin raise exception 'Audit indisponible' using errcode='P0001'; end $$;
create trigger preuve_audit_panne before insert on audit_logs for each row execute function preuve_audit_panne();
set role authenticated;
select preuve_code($q$select avancer_cycle_ecart_v2('b1000000-0000-4000-8000-000000000067','87000000-0000-4000-8000-000000000011',1,'soumettre','Intervenant','2026-10-01','Preuve décrivant les corrections réalisées.',array['87000000-0000-4000-8000-000000000002','87000000-0000-4000-8000-000000000001']::uuid[])$q$,'P0001');
select test_assert((select bool_and(evenement_id is null) from ecart_pieces) and (select revision=1 and soumission_id is null from ecart_suivis where ecart_id='b1000000-0000-4000-8000-000000000067'),'association annulée avec la soumission');
reset role;
drop trigger preuve_audit_panne on audit_logs;
set role authenticated;
select avancer_cycle_ecart_v2('b1000000-0000-4000-8000-000000000067','87000000-0000-4000-8000-000000000011',1,'soumettre','Intervenant','2026-10-01','Preuve décrivant les corrections réalisées.',array['87000000-0000-4000-8000-000000000002','87000000-0000-4000-8000-000000000001']::uuid[]);
select test_assert(avancer_cycle_ecart_v2('b1000000-0000-4000-8000-000000000067','87000000-0000-4000-8000-000000000011',1,'soumettre','Intervenant','2026-10-01','Preuve décrivant les corrections réalisées.',array['87000000-0000-4000-8000-000000000001','87000000-0000-4000-8000-000000000002']::uuid[])->>'rejeu'='true','rejeu exact indépendant de l’ordre des pièces');
select test_assert((select count(*)=2 and bool_and(evenement_id='87000000-0000-4000-8000-000000000011') from ecart_pieces),'pièces associées une seule fois');
select preuve_code($q$select avancer_cycle_ecart_v2('b1000000-0000-4000-8000-000000000067','87000000-0000-4000-8000-000000000011',1,'soumettre','Intervenant','2026-10-01','Preuve décrivant les corrections réalisées.','{}')$q$,'40001');
set request.jwt.claims='{"sub":"a1000000-0000-4000-8000-000000000002","aal":"aal2"}';
select test_assert((select count(*)=2 from ecart_pieces),'pièces soumises visibles au collègue affecté');
select preuve_code($q$select avancer_cycle_ecart('b1000000-0000-4000-8000-000000000067',gen_random_uuid(),2,'valider','Intervenant','2026-10-01','Ancien client sans affichage des pièces')$q$,'22023');
select avancer_cycle_ecart_v2('b1000000-0000-4000-8000-000000000067',gen_random_uuid(),2,'reprendre','Intervenant','2026-10-01','Une correction complémentaire est nécessaire.','{}');
set request.jwt.claims='{"sub":"a1000000-0000-4000-8000-000000000001","aal":"aal2"}';
select preuve_code($q$select avancer_cycle_ecart_v2('b1000000-0000-4000-8000-000000000067',gen_random_uuid(),3,'soumettre','Intervenant','2026-10-01','Preuve de la nouvelle correction réalisée.',array['87000000-0000-4000-8000-000000000001']::uuid[])$q$,'40001');
select avancer_cycle_ecart('b1000000-0000-4000-8000-000000000067',gen_random_uuid(),3,'soumettre','Intervenant','2026-10-01','La seconde preuve ne contient pas de pièce.');
select test_assert((select soumission_id<>'87000000-0000-4000-8000-000000000011' from ecart_suivis where ecart_id='b1000000-0000-4000-8000-000000000067') and (select bool_and(evenement_id='87000000-0000-4000-8000-000000000011') from ecart_pieces),'anciennes pièces restent attachées à leur propre preuve');
select test_refuse($q$delete from ecart_pieces$q$);
reset role;
select test_refuse($q$update ecart_pieces set nom='Réécrit.pdf'$q$);
set request.jwt.claims='{"sub":"a2000000-0000-4000-8000-000000000001","aal":"aal2"}';
set role authenticated;
select test_assert((select count(*)=0 from ecart_pieces),'admin autre entreprise ne lit pas les pièces');
reset role;
insert into auth.mfa_factors values('a1000000-0000-4000-8000-000000000001','verified');
set request.jwt.claims='{"sub":"a1000000-0000-4000-8000-000000000001","aal":"aal1"}';
set role authenticated;
select test_assert((select count(*)=0 from ecart_pieces),'MFA protège les pièces');
reset role;
rollback;
\echo PREUVES_TESTS_OK
