-- Après les tests de clôture/concurrence, sur PostgreSQL JETABLE uniquement.
\ir ../supabase/migrations/060_synchronisation_atomique.sql
\ir ../supabase/migrations/060_synchronisation_atomique.sql
select test_assert(not has_function_privilege('anon','public.synchroniser_reponse(uuid,uuid,uuid,uuid,text,text,text[])','execute'),'RPC interdite anonyme');
select test_assert(not has_function_privilege('service_role','public.synchroniser_reponse(uuid,uuid,uuid,uuid,text,text,text[])','execute'),'RPC sans identité interdite');
insert into visites(id,chantier_id,inspecteur_id,statut,date_visite) values
('20000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','brouillon','2026-09-14');
set role authenticated;
set request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000001","aal":"aal1"}';
do $$ begin
 begin perform synchroniser_reponse('20000000-0000-4000-8000-000000000007','60000000-0000-4000-8000-000000000001',null,gen_random_uuid(),'conforme',null,'{}'); raise exception 'MFA accepté'; exception when insufficient_privilege then null; end;
end $$;
set request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000003","aal":"aal1"}';
do $$ begin
 begin perform synchroniser_reponse('20000000-0000-4000-8000-000000000007','60000000-0000-4000-8000-000000000001',null,gen_random_uuid(),'conforme',null,'{}'); raise exception 'non affecté accepté'; exception when insufficient_privilege then null; end;
end $$;
set request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000002","aal":"aal1"}';
do $$ begin
 begin insert into reponses(visite_id,point_controle_id,valeur) values('20000000-0000-4000-8000-000000000007','60000000-0000-4000-8000-000000000001','conforme'); raise exception 'INSERT direct accepté'; exception when insufficient_privilege then null; end;
 begin perform synchroniser_reponse('20000000-0000-4000-8000-000000000007','60000000-0000-4000-8000-000000000001',null,gen_random_uuid(),'invalide',null,'{}'); raise exception 'valeur invalide'; exception when invalid_parameter_value then null; end;
end $$;
select synchroniser_reponse('20000000-0000-4000-8000-000000000007','60000000-0000-4000-8000-000000000001',null,'70000000-0000-4000-8000-000000000010','conforme','original','{}')->>'revision' as revision \gset
set test.sync_revision=:'revision';
select test_assert((select statut='en_cours' from visites where id='20000000-0000-4000-8000-000000000007'),'statut changé atomiquement');
select test_assert((synchroniser_reponse('20000000-0000-4000-8000-000000000007','60000000-0000-4000-8000-000000000001',null,'70000000-0000-4000-8000-000000000010','conforme','original','{}')->>'deja_appliquee')::boolean,'rejeu après accusé perdu');
select test_assert((select sync_revision=current_setting('test.sync_revision')::uuid from reponses where visite_id='20000000-0000-4000-8000-000000000007'),'rejeu sans nouvelle révision');
do $$ begin
 begin update reponses set remarque='contournement' where visite_id='20000000-0000-4000-8000-000000000007'; raise exception 'UPDATE direct accepté'; exception when insufficient_privilege then null; end;
 begin delete from reponses where visite_id='20000000-0000-4000-8000-000000000007'; raise exception 'DELETE direct accepté'; exception when insufficient_privilege then null; end;
 begin perform synchroniser_reponse('20000000-0000-4000-8000-000000000007','60000000-0000-4000-8000-000000000001',null,'70000000-0000-4000-8000-000000000010','conforme','contenu changé','{}'); raise exception 'rejeu altéré accepté'; exception when invalid_parameter_value then null; end;
 begin perform synchroniser_reponse('20000000-0000-4000-8000-000000000007','60000000-0000-4000-8000-000000000001',null,gen_random_uuid(),'conforme','insertion concurrente','{}'); raise exception 'insertion concurrente acceptée'; exception when serialization_failure then null; end;
 begin perform synchroniser_reponse('20000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000001',null,gen_random_uuid(),'conforme','visite terminée','{}'); raise exception 'clôture ignorée'; exception when insufficient_privilege then null; end;
end $$;
select synchroniser_reponse('20000000-0000-4000-8000-000000000007','60000000-0000-4000-8000-000000000001',current_setting('test.sync_revision')::uuid,gen_random_uuid(),'conforme','nouvelle version','{}');
do $$ begin
 begin perform synchroniser_reponse('20000000-0000-4000-8000-000000000007','60000000-0000-4000-8000-000000000001',current_setting('test.sync_revision')::uuid,gen_random_uuid(),'conforme','version périmée','{}'); raise exception 'révision périmée acceptée'; exception when serialization_failure then null; end;
end $$;
reset role;
select test_assert((select remarque='nouvelle version' and sync_revision<>current_setting('test.sync_revision')::uuid from reponses where visite_id='20000000-0000-4000-8000-000000000007'),'révision serveur renouvelée sans écrasement périmé');
-- Même une maintenance privilégiée invalide un ancien reçu.
update reponses set remarque='maintenance' where visite_id='20000000-0000-4000-8000-000000000007';
select test_assert((select sync_operation_id is null and sync_acteur is null from reponses where visite_id='20000000-0000-4000-8000-000000000007'),'reçu invalidé après maintenance');
-- Une panne tardive ne laisse pas la réponse enregistrée sans le statut.
insert into visites(id,chantier_id,inspecteur_id,statut,date_visite) values
('20000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','brouillon','2026-09-14');
create function fixture_sync_echec() returns trigger language plpgsql as $$ begin raise exception 'panne' using errcode='P0001'; end $$;
create trigger z_fixture_sync_echec before update on visites for each row execute function fixture_sync_echec();
set role authenticated;
do $$ begin
 begin perform synchroniser_reponse('20000000-0000-4000-8000-000000000008','60000000-0000-4000-8000-000000000001',null,gen_random_uuid(),'conforme',null,'{}'); raise exception 'panne absente' using errcode='XX000'; exception when raise_exception then null; end;
end $$;
reset role;
drop trigger z_fixture_sync_echec on visites;
drop function fixture_sync_echec();
select test_assert(not exists(select 1 from reponses where visite_id='20000000-0000-4000-8000-000000000008'),'rollback complet réponse/statut');
set role authenticated;
select supprimer_visite_brouillon('20000000-0000-4000-8000-000000000007');
reset role;
select test_assert(not exists(select 1 from reponses where visite_id='20000000-0000-4000-8000-000000000007'),'suppression transactionnelle compatible');
select 'SECURITY_SYNC_TESTS_OK';
