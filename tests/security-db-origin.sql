-- Après security-db-sync.sql et sa concurrence, sur la même base jetable.
\ir ../supabase/migrations/061_version_origine_reponses.sql
\ir ../supabase/migrations/061_version_origine_reponses.sql
select test_assert(not has_function_privilege('authenticated','public.synchroniser_reponse(uuid,uuid,uuid,uuid,text,text,text[])','execute'),'ancienne entrée fermée');
select test_assert(not has_function_privilege('anon','public.synchroniser_reponse_v2(uuid,uuid,uuid,uuid,text,text,text[])','execute'),'v2 fermée anonyme');
select test_assert(not has_function_privilege('service_role','public.synchroniser_reponse_v2(uuid,uuid,uuid,uuid,text,text,text[])','execute'),'v2 identité obligatoire');
set role authenticated;
set request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000002","aal":"aal1"}';
select sync_revision as revision from reponses where visite_id='20000000-0000-4000-8000-000000000008' \gset
set test.origin_revision=:'revision';
select synchroniser_reponse_v2('20000000-0000-4000-8000-000000000008','60000000-0000-4000-8000-000000000001',:'revision','70000000-0000-4000-8000-000000000061','conforme','version v2','{}');
select test_assert((synchroniser_reponse_v2('20000000-0000-4000-8000-000000000008','60000000-0000-4000-8000-000000000001',:'revision','70000000-0000-4000-8000-000000000061','conforme','version v2','{}')->>'deja_appliquee')::boolean,'rejeu v2 exact');
do $$ begin
 begin perform synchroniser_reponse('20000000-0000-4000-8000-000000000008','60000000-0000-4000-8000-000000000001',null,gen_random_uuid(),'conforme','ancien onglet','{}'); raise exception 'ancien onglet accepté'; exception when insufficient_privilege then null; end;
 begin perform synchroniser_reponse_v2('20000000-0000-4000-8000-000000000008','60000000-0000-4000-8000-000000000001',current_setting('test.origin_revision')::uuid,gen_random_uuid(),'conforme','ancienne base','{}'); raise exception 'ancienne base acceptée'; exception when serialization_failure then null; end;
end $$;
set request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000001","aal":"aal1"}';
do $$ begin
 begin perform synchroniser_reponse_v2('20000000-0000-4000-8000-000000000008','60000000-0000-4000-8000-000000000001',null,gen_random_uuid(),'conforme',null,'{}'); raise exception 'MFA contourné'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'SECURITY_ORIGIN_TESTS_OK';
