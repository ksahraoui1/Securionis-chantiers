-- Opération ponctuelle explicitement confirmée par le propriétaire : 91 réponses.
-- Exécuter comme propriétaire PostgreSQL, jamais via une RPC accessible aux clients.
-- Une empreinte périmée, une dépendance inattendue ou un deuxième passage annule tout.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
lock table public.visites,public.reponses,public.ecarts in access exclusive mode;
do $$ begin
 if (select count(*) from public.reponses where valeur='pas_necessaire')<>91
 or (select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb)::text,'UTF8')),'hex') from public.reponses r where valeur='pas_necessaire')<>'50365a3e6c439d4ae5035557d762bbcf98773d06d274f5ab7970b611f8cc1e78'
 then raise exception 'La sélection confirmée a changé : suppression annulée'; end if;
 if exists(select 1 from public.ecarts e join public.reponses r on r.id=e.reponse_id where r.valeur='pas_necessaire')
 or exists(select 1 from pg_constraint where contype='f' and confrelid='public.reponses'::regclass and conrelid<>'public.ecarts'::regclass)
 then raise exception 'Dépendance inattendue : suppression annulée'; end if;
 if not exists(select 1 from pg_trigger where tgrelid='public.reponses'::regclass and tgname='proteger_reponse_visite' and tgenabled='O')
 then raise exception 'Protection initiale inattendue'; end if;
end $$;
create temporary table verification_suppression on commit drop as
select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb)::text) as empreinte from public.reponses r where valeur is distinct from 'pas_necessaire';
create schema if not exists maintenance_privee;
revoke all on schema maintenance_privee from public,anon,authenticated,service_role;
create table maintenance_privee.reponses_non_necessaires_20260914(
 id uuid primary key,donnees jsonb not null,sauvegardee_le timestamptz not null default clock_timestamp(),
 motif text not null default 'Suppression des 91 réponses Pas nécessaire confirmée par le propriétaire le 14 septembre 2026'
);
alter table maintenance_privee.reponses_non_necessaires_20260914 enable row level security;
revoke all on maintenance_privee.reponses_non_necessaires_20260914 from public,anon,authenticated,service_role;
insert into maintenance_privee.reponses_non_necessaires_20260914(id,donnees)
select id,to_jsonb(r) from public.reponses r where valeur='pas_necessaire';
-- Exception de maintenance limitée à cette transaction. Le verrou exclusif empêche
-- tout autre accès pendant l'exception ; le trigger est rétabli AVANT le commit.
-- Aucun droit API ni politique RLS n'est ouvert. Aucun fichier Storage n'est supprimé.
alter table public.reponses disable trigger proteger_reponse_visite;
delete from public.reponses where id in(select id from maintenance_privee.reponses_non_necessaires_20260914);
alter table public.reponses enable trigger proteger_reponse_visite;
do $$ begin
 if (select count(*) from maintenance_privee.reponses_non_necessaires_20260914)<>91
 or exists(select 1 from public.reponses where valeur='pas_necessaire')
 or (select empreinte from verification_suppression) is distinct from (select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb)::text) from public.reponses r)
 or not exists(select 1 from pg_trigger where tgrelid='public.reponses'::regclass and tgname='proteger_reponse_visite' and tgenabled='O')
 then raise exception 'Contrôle après suppression échoué : transaction annulée'; end if;
end $$;
commit;
select jsonb_build_object('sauvegardees',(select count(*) from maintenance_privee.reponses_non_necessaires_20260914),'pas_necessaire_restantes',(select count(*) from public.reponses where valeur='pas_necessaire'),'reponses_restantes',(select count(*) from public.reponses),'visites',(select count(*) from public.visites),'ecarts',(select count(*) from public.ecarts),'protection_retournee',(select tgenabled='O' from pg_trigger where tgrelid='public.reponses'::regclass and tgname='proteger_reponse_visite')) as verification_suppression;
