-- Base jetable exclusivement : schéma minimal complété avec les vraies colonnes.
\ir security-db-versions.sql
alter table visites add column heure_visite time;
alter table visites add column categorie_ids uuid[] default '{}';
alter table visites add column renseignements_par text;
alter table visites add column remarques_generales text;
create table points_controle(id uuid primary key, intitule text);
insert into points_controle values ('60000000-0000-4000-8000-000000000001','Protection collective'),('60000000-0000-4000-8000-000000000002','Autre contrôle');
alter table reponses add column point_controle_id uuid references points_controle;
alter table reponses add column remarque text;
alter table reponses add column photos text[] default '{}';
alter table reponses add column updated_at timestamptz default now();
alter table reponses alter column id set default gen_random_uuid();
alter table reponses add unique(visite_id,point_controle_id);
alter table ecarts alter column id set default gen_random_uuid();
alter table ecarts add column chantier_id uuid references chantiers;
alter table ecarts add column description text;
alter table ecarts add column delai text;
alter table ecarts add column statut text default 'ouvert';
alter table ecarts add column updated_by uuid;
alter table ecarts add column updated_at timestamptz default now();
grant select on points_controle to authenticated,service_role;
create policy fixture_ecriture on visites for all to authenticated using (true) with check (true);
insert into chantier_inspecteurs(chantier_id,inspecteur_id) values('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002');
insert into visites(id,chantier_id,inspecteur_id,statut,date_visite) values
('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','en_cours','2026-09-14'),
('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','brouillon','2026-09-14');
insert into reponses(id,visite_id,point_controle_id,valeur,remarque) values
('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000001','non_conforme','Absence de garde-corps'),
('30000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000002','conforme',null);
\ir ../supabase/migrations/059_cloture_transactionnelle.sql
\ir ../supabase/migrations/059_cloture_transactionnelle.sql
select test_assert((select count(*)=1 from visites where statut='terminee' and cloturee_par is null),'historique conservé sans auteur inventé');
select test_assert(not has_function_privilege('anon','public.cloturer_visite(uuid,text,jsonb,text,text,uuid)','execute'),'clôture interdite anonyme');
select test_assert(not has_function_privilege('service_role','public.cloturer_visite(uuid,text,jsonb,text,text,uuid)','execute'),'pas de clôture privilégiée sans identité');
select test_assert(not has_function_privilege('authenticated','public.empreinte_constats_visite(uuid)','execute'),'helper de lecture non exposé');
set role authenticated;
set request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000001","aal":"aal1"}';
do $$ begin
 begin perform preparer_cloture_visite('20000000-0000-4000-8000-000000000003'); raise exception 'MFA incomplet accepté'; exception when insufficient_privilege then null; end;
end $$;
set request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000003","aal":"aal1"}';
do $$ begin
 begin perform preparer_cloture_visite('20000000-0000-4000-8000-000000000003'); raise exception 'invité non affecté accepté'; exception when insufficient_privilege then null; end;
end $$;
set request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000002","aal":"aal1"}';
do $$ begin
 begin update visites set statut='terminee' where id='20000000-0000-4000-8000-000000000003'; raise exception 'clôture directe acceptée'; exception when insufficient_privilege then null; end;
 begin perform preparer_cloture_visite('20000000-0000-4000-8000-000000000004'); raise exception 'visite vide acceptée'; exception when invalid_parameter_value then null; end;
 begin update reponses set visite_id='20000000-0000-4000-8000-000000000004' where id='30000000-0000-4000-8000-000000000003'; raise exception 'déplacement réponse accepté'; exception when insufficient_privilege then null; end;
end $$;
select preparer_cloture_visite('20000000-0000-4000-8000-000000000003')->>'empreinte' as empreinte \gset
set test.empreinte=:'empreinte';
-- Refus de listes manquantes, étrangères ou dupliquées : aucune écriture partielle.
do $$ declare liste jsonb; begin
 for liste in select value from jsonb_array_elements('[[],[{"reponse_id":"30000000-0000-4000-8000-000000000004","delai":"7 jours"}],[{"reponse_id":"30000000-0000-4000-8000-000000000003"},{"reponse_id":"30000000-0000-4000-8000-000000000003"}]]') loop
  begin perform cloturer_visite('20000000-0000-4000-8000-000000000003',current_setting('test.empreinte'),liste,'Inspecteur',null,gen_random_uuid()); raise exception 'liste invalide acceptée'; exception when invalid_parameter_value then null; end;
 end loop;
end $$;
select test_assert((select count(*)=0 from ecarts),'aucun écart créé après refus');
update reponses set remarque='Constat modifié entre préparation et validation' where id='30000000-0000-4000-8000-000000000003';
do $$ begin
 begin perform cloturer_visite('20000000-0000-4000-8000-000000000003',current_setting('test.empreinte'),'[{"reponse_id":"30000000-0000-4000-8000-000000000003","delai":"7 jours"}]',null,null,gen_random_uuid()); raise exception 'constat périmé validé'; exception when serialization_failure then null; end;
end $$;
reset role;
delete from chantier_inspecteurs where inspecteur_id='00000000-0000-4000-8000-000000000002';
set role authenticated;
do $$ begin
 begin perform preparer_cloture_visite('20000000-0000-4000-8000-000000000003'); raise exception 'auteur désaffecté accepté'; exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into chantier_inspecteurs(chantier_id,inspecteur_id) values('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002');
-- Simuler une panne au dernier UPDATE pour vérifier le rollback de l'INSERT écart.
create function public.fixture_echec_cloture() returns trigger language plpgsql as $$ begin if new.statut='terminee' then raise exception 'panne fixture' using errcode='P0001'; end if; return new; end $$;
create trigger z_fixture_echec before update on visites for each row execute function fixture_echec_cloture();
set role authenticated;
select preparer_cloture_visite('20000000-0000-4000-8000-000000000003')->>'empreinte' as empreinte \gset
set test.empreinte=:'empreinte';
do $$ begin
 begin perform cloturer_visite('20000000-0000-4000-8000-000000000003',current_setting('test.empreinte'),'[{"reponse_id":"30000000-0000-4000-8000-000000000003","delai":"7 jours"}]','Inspecteur','Observation', '70000000-0000-4000-8000-000000000001'); raise exception 'panne non déclenchée' using errcode='XX000'; exception when raise_exception then null; end;
end $$;
select test_assert((select count(*)=0 from ecarts) and (select statut='en_cours' from visites where id='20000000-0000-4000-8000-000000000003'),'rollback atomique après panne tardive');
reset role;
drop trigger z_fixture_echec on visites;
drop function public.fixture_echec_cloture();
set role authenticated;
select cloturer_visite('20000000-0000-4000-8000-000000000003',current_setting('test.empreinte'),'[{"reponse_id":"30000000-0000-4000-8000-000000000003","delai":"7 jours"}]','Inspecteur','Observation','70000000-0000-4000-8000-000000000001');
select test_assert((cloturer_visite('20000000-0000-4000-8000-000000000003',current_setting('test.empreinte'),'[{"reponse_id":"30000000-0000-4000-8000-000000000003","delai":"7 jours"}]','Inspecteur','Observation','70000000-0000-4000-8000-000000000001')->>'deja_appliquee')::boolean,'rejeu exact idempotent');
select test_assert((select count(*)=1 from ecarts),'pas de doublon après rejeu');
select test_assert((select cloturee_par=auth.uid() and cloturee_le is not null and remarques_generales='Observation' from visites where id='20000000-0000-4000-8000-000000000003'),'auteur et date serveur inscrits');
do $$ begin
 begin perform cloturer_visite('20000000-0000-4000-8000-000000000003',current_setting('test.empreinte'),'[]',null,null,'70000000-0000-4000-8000-000000000001'); raise exception 'UUID réutilisé avec autre payload'; exception when serialization_failure then null; end;
 begin update visites set statut='en_cours' where id='20000000-0000-4000-8000-000000000003'; raise exception 'réouverture acceptée'; exception when insufficient_privilege then null; end;
 begin update visites set remarques_generales='altéré' where id='20000000-0000-4000-8000-000000000003'; raise exception 'métadonnées altérées'; exception when insufficient_privilege then null; end;
 begin update reponses set remarque='altéré' where id='30000000-0000-4000-8000-000000000003'; raise exception 'réponse terminée modifiée'; exception when insufficient_privilege then null; end;
 begin delete from reponses where id='30000000-0000-4000-8000-000000000004'; raise exception 'réponse terminée supprimée'; exception when insufficient_privilege then null; end;
 begin insert into reponses(visite_id,point_controle_id,valeur) values('20000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000001','conforme'); raise exception 'réponse ajoutée après clôture'; exception when insufficient_privilege then null; end;
 begin delete from ecarts; raise exception 'NC terminée supprimée'; exception when insufficient_privilege then null; end;
 begin update ecarts set description='altéré'; raise exception 'description NC modifiée'; exception when insufficient_privilege then null; end;
end $$;
update ecarts set statut='en_cours_correction',updated_by=auth.uid();
select test_assert((select bool_and(statut='en_cours_correction') from ecarts),'suivi de correction conservé');
update visites set email_envoye=true where id='20000000-0000-4000-8000-000000000003';
reset role;
set role service_role;
do $$ begin
 begin update reponses set photos=array['falsifié'] where id='30000000-0000-4000-8000-000000000003'; raise exception 'service altère les photos'; exception when insufficient_privilege then null; end;
end $$;
update visites set rapport_url='nouvelle-version-serveur.pdf' where id='20000000-0000-4000-8000-000000000003';
reset role;
-- La suppression transactionnelle d'un brouillon reste compatible avec les triggers.
insert into reponses(visite_id,point_controle_id,valeur) values('20000000-0000-4000-8000-000000000004','60000000-0000-4000-8000-000000000001','non_conforme');
insert into ecarts(chantier_id,reponse_id,description) select '10000000-0000-4000-8000-000000000001',id,'fixture brouillon' from reponses where visite_id='20000000-0000-4000-8000-000000000004';
set role authenticated;
set request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000002","aal":"aal1"}';
select test_assert((supprimer_visite_brouillon('20000000-0000-4000-8000-000000000004')->>'reponses')::int=1,'suppression brouillon et cascade conservées');
reset role;
select 'SECURITY_CLOTURE_TESTS_OK' as resultat;
