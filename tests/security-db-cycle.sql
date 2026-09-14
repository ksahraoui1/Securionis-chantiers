-- Seulement sur la base jetable créée par security-db-tenant.sql.
\set ON_ERROR_STOP on
\connect securionis_tenant_test
\ir ../supabase/migrations/066_cycle_actions_correctives.sql
begin;
create function cycle_code(requete text, attendu text) returns void language plpgsql as $$ begin
 begin execute requete; exception when others then if sqlstate=attendu then return; end if; raise; end;
 raise exception 'TEST : opération acceptée à tort %',requete;
end $$;
set request.jwt.claims='{"sub":"a1000000-0000-4000-8000-000000000001","aal":"aal2"}';
set role authenticated;
select test_refuse($q$update ecarts set statut='corrige' where id='b1000000-0000-4000-8000-000000000004'$q$);
select test_refuse($q$insert into ecart_suivis values('b1000000-0000-4000-8000-000000000004',1,'Entreprise test','2026-10-01',null,now())$q$);
select cycle_code($q$select avancer_cycle_ecart('b1000000-0000-4000-8000-000000000004',gen_random_uuid(),0,'valider','Entreprise test','2026-10-01','Vérification sans preuve')$q$,'22023');
select avancer_cycle_ecart('b1000000-0000-4000-8000-000000000004','86000000-0000-4000-8000-000000000001',0,'planifier','Entreprise test','2026-10-01',null);
select test_assert(avancer_cycle_ecart('b1000000-0000-4000-8000-000000000004','86000000-0000-4000-8000-000000000001',0,'planifier','Entreprise test','2026-10-01',null)->>'rejeu'='true','rejeu exact');
select cycle_code($q$select avancer_cycle_ecart('b1000000-0000-4000-8000-000000000004',gen_random_uuid(),0,'planifier','Concurrent','2026-10-02',null)$q$,'40001');
select cycle_code($q$select avancer_cycle_ecart('b1000000-0000-4000-8000-000000000004','86000000-0000-4000-8000-000000000001',0,'planifier','Identifiant détourné','2026-10-01',null)$q$,'40001');
select cycle_code($q$select avancer_cycle_ecart('b1000000-0000-4000-8000-000000000004',gen_random_uuid(),1,'soumettre','Entreprise test','2026-10-01','court')$q$,'22023');
select avancer_cycle_ecart('b1000000-0000-4000-8000-000000000004','86000000-0000-4000-8000-000000000002',1,'soumettre','Entreprise test','2026-10-01','Garde-corps posé et contrôle effectué sur place.');
select test_assert((select statut='a_verifier' from ecarts where id='b1000000-0000-4000-8000-000000000004'),'soumission ne clôture pas');
select avancer_cycle_ecart('b1000000-0000-4000-8000-000000000004','86000000-0000-4000-8000-000000000003',2,'reprendre','Entreprise test','2026-10-01','Compléter la fixation sur le dernier étage.');
select avancer_cycle_ecart('b1000000-0000-4000-8000-000000000004','86000000-0000-4000-8000-000000000004',3,'soumettre','Entreprise test','2026-10-01','La fixation manquante a été ajoutée puis contrôlée.');
select avancer_cycle_ecart('b1000000-0000-4000-8000-000000000004','86000000-0000-4000-8000-000000000005',4,'valider','Entreprise test','2026-10-01','Contrôle final sur place : conformité constatée.');
select test_assert((select statut='corrige' from ecarts where id='b1000000-0000-4000-8000-000000000004'),'validation clôture');
select test_assert((select count(*)=5 from ecart_evenements) and (select count(*)=5 from audit_logs where action='advance_ecart_cycle'),'historique et audit atomiques sans doublon');
select test_assert(avancer_cycle_ecart('b1000000-0000-4000-8000-000000000004','86000000-0000-4000-8000-000000000002',1,'soumettre','Entreprise test','2026-10-01','Garde-corps posé et contrôle effectué sur place.')->>'revision'='2','rejeu ancien après avancée conserve le résultat original');
select cycle_code($q$select avancer_cycle_ecart('b1000000-0000-4000-8000-000000000004',gen_random_uuid(),5,'planifier','Entreprise test','2026-10-02',null)$q$,'22023');
select test_refuse($q$update ecarts set description='Constat changé après validation' where id='b1000000-0000-4000-8000-000000000004'$q$);
select test_refuse($q$update ecart_evenements set commentaire='Falsification'$q$);
select test_refuse($q$delete from ecart_evenements$q$);
select test_refuse($q$update ecart_suivis set revision=0$q$);
set request.jwt.claims='{"sub":"a2000000-0000-4000-8000-000000000001","aal":"aal2"}';
select test_assert((select count(*)=0 from ecart_evenements) and (select count(*)=0 from ecart_suivis),'historique A invisible à administrateur B');
select test_refuse($q$select avancer_cycle_ecart('b1000000-0000-4000-8000-000000000004',gen_random_uuid(),5,'planifier','Intrus','2026-10-01',null)$q$);
set request.jwt.claims='{"sub":"a1000000-0000-4000-8000-000000000003","aal":"aal2"}';
select test_refuse($q$select avancer_cycle_ecart('b1000000-0000-4000-8000-000000000004',gen_random_uuid(),5,'planifier','Invité','2026-10-01',null)$q$);
set request.jwt.claims='{"sub":"a1000000-0000-4000-8000-000000000002","aal":"aal2"}';
select test_refuse($q$select avancer_cycle_ecart('b1000000-0000-4000-8000-000000000004',gen_random_uuid(),5,'planifier','Inspecteur non affecté','2026-10-01',null)$q$);
reset role;
insert into auth.mfa_factors values('a1000000-0000-4000-8000-000000000001','verified');
set request.jwt.claims='{"sub":"a1000000-0000-4000-8000-000000000001","aal":"aal1"}';
set role authenticated;
select test_assert((select count(*)=0 from ecart_evenements),'MFA protège la lecture');
select test_refuse($q$select avancer_cycle_ecart('b1000000-0000-4000-8000-000000000004',gen_random_uuid(),5,'planifier','Session faible','2026-10-01',null)$q$);
set role service_role;
select test_refuse($q$select avancer_cycle_ecart('b1000000-0000-4000-8000-000000000004',gen_random_uuid(),5,'planifier','Service','2026-10-01',null)$q$);
reset role;
-- Constat de visite terminée : le suivi évolue, les sources restent figées.
insert into visites(id,chantier_id,inspecteur_id) values('f1000000-0000-4000-8000-000000000066','c1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002');
insert into reponses(id,visite_id,point_controle_id,valeur,remarque) values('91000000-0000-4000-8000-000000000066','f1000000-0000-4000-8000-000000000066','d1000000-0000-4000-8000-000000000003','non_conforme','Constat initial');
insert into ecarts(id,chantier_id,reponse_id,description,delai) values('b1000000-0000-4000-8000-000000000066','c1000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000066','Constat initial','7 jours');
update visites set statut='terminee' where id='f1000000-0000-4000-8000-000000000066';
insert into chantier_inspecteurs(chantier_id,inspecteur_id) values('c1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002');
set request.jwt.claims='{"sub":"a1000000-0000-4000-8000-000000000002","aal":"aal2"}';
set role authenticated;
select avancer_cycle_ecart('b1000000-0000-4000-8000-000000000066',gen_random_uuid(),0,'planifier','Intervenant terrain','2026-10-01',null);
select test_assert((select description='Constat initial' and delai='7 jours' and statut='en_cours_correction' from ecarts where id='b1000000-0000-4000-8000-000000000066'),'suivi séparé du constat');
select test_refuse($q$update ecarts set description='Faux constat' where id='b1000000-0000-4000-8000-000000000066'$q$);
reset role;
create function cycle_audit_panne() returns trigger language plpgsql as $$ begin raise exception 'Audit indisponible' using errcode='P0001'; end $$;
create trigger cycle_audit_panne before insert on audit_logs for each row execute function cycle_audit_panne();
set role authenticated;
select cycle_code($q$select avancer_cycle_ecart('b1000000-0000-4000-8000-000000000066',gen_random_uuid(),1,'soumettre','Intervenant terrain','2026-10-01','Tous les travaux de correction ont été réalisés.')$q$,'P0001');
select test_assert((select revision=1 and preuve is null from ecart_suivis where ecart_id='b1000000-0000-4000-8000-000000000066') and (select statut='en_cours_correction' from ecarts where id='b1000000-0000-4000-8000-000000000066'),'panne audit annule toute la transition');
reset role;
rollback;
\echo CYCLE_TESTS_OK
