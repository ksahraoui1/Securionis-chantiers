-- Opération ponctuelle explicitement confirmée par le propriétaire le 22 septembre 2026 :
-- suppression des 2 visites du chantier de test « AA - Chantier Test », dont une
-- visite terminée avec rapport envoyé (protégée par l'application).
-- Exécuter comme propriétaire PostgreSQL, jamais via une RPC accessible aux clients.
-- Une sélection changée, une dépendance inattendue ou un deuxième passage annule tout.
-- Les fichiers Storage (1 PDF, 1 photo) se suppriment ensuite par l'API Storage.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
lock table public.visites,public.reponses,public.ecarts,public.rapport_versions in access exclusive mode;
create temporary table cible(id uuid primary key) on commit drop;
insert into cible values ('ea13e58b-a816-4afe-bd4b-2600549472db'),('c55b7e3c-2a5d-4b52-9a53-2590db26715c');
do $$ begin
 if (select count(*) from public.visites v join cible c using(id)
     where v.chantier_id='049b586c-63ef-4c72-aac6-deeb1a770e64')<>2
 or (select count(*) from public.visites where chantier_id='049b586c-63ef-4c72-aac6-deeb1a770e64')<>2
 or (select count(*) from public.reponses where visite_id in(select id from cible))<>1
 or (select count(*) from public.rapport_versions where visite_id in(select id from cible))<>1
 then raise exception 'La sélection confirmée a changé : suppression annulée'; end if;
 if exists(select 1 from public.ecarts e join public.reponses r on r.id=e.reponse_id where r.visite_id in(select id from cible))
 or exists(select 1 from public.visite_archives where visite_id in(select id from cible))
 or exists(select 1 from public.visite_avenants where visite_id in(select id from cible))
 or exists(select 1 from securionis_prive.preparations_archives where visite_id in(select id from cible))
 then raise exception 'Dépendance inattendue : suppression annulée'; end if;
 if to_regclass('maintenance_privee.visites_chantier_test_20260922') is not null
 then raise exception 'Déjà exécuté : suppression annulée'; end if;
end $$;
create schema if not exists maintenance_privee;
revoke all on schema maintenance_privee from public,anon,authenticated,service_role;
create table maintenance_privee.visites_chantier_test_20260922(
 table_source text not null,id uuid not null,donnees jsonb not null,
 sauvegardee_le timestamptz not null default clock_timestamp(),
 motif text not null default 'Suppression des 2 visites de « AA - Chantier Test » confirmée par le propriétaire le 22 septembre 2026',
 primary key(table_source,id)
);
alter table maintenance_privee.visites_chantier_test_20260922 enable row level security;
revoke all on maintenance_privee.visites_chantier_test_20260922 from public,anon,authenticated,service_role;
insert into maintenance_privee.visites_chantier_test_20260922(table_source,id,donnees)
select 'visites',id,to_jsonb(v) from public.visites v where id in(select id from cible)
union all select 'reponses',id,to_jsonb(r) from public.reponses r where visite_id in(select id from cible)
union all select 'rapport_versions',id,to_jsonb(rv) from public.rapport_versions rv where visite_id in(select id from cible);
-- Exception limitée à cette transaction, sous verrou exclusif ; protections rétablies AVANT le commit.
alter table public.rapport_versions disable trigger versions_immuables;
alter table public.reponses disable trigger proteger_reponse_visite;
alter table public.reponses disable trigger proteger_ecriture_reponse;
alter table public.visites disable trigger proteger_cloture_visite;
delete from public.rapport_versions where visite_id in(select id from cible);
delete from public.visites where id in(select id from cible);
alter table public.rapport_versions enable trigger versions_immuables;
alter table public.reponses enable trigger proteger_reponse_visite;
alter table public.reponses enable trigger proteger_ecriture_reponse;
alter table public.visites enable trigger proteger_cloture_visite;
insert into public.audit_logs(user_id,action,resource,resource_id,details,entreprise_id)
select '760ff84a-f43a-43c6-9ca2-184423e30f0b','delete_visite','visites',d.id::text,
 jsonb_build_object('maintenance','20260922-supprimer-visites-chantier-test','statut',d.donnees->>'statut','date_visite',d.donnees->>'date_visite'),
 (select entreprise_id from public.chantiers where id='049b586c-63ef-4c72-aac6-deeb1a770e64')
from maintenance_privee.visites_chantier_test_20260922 d where d.table_source='visites';
do $$ begin
 if exists(select 1 from public.visites where chantier_id='049b586c-63ef-4c72-aac6-deeb1a770e64')
 or exists(select 1 from public.reponses where visite_id in(select id from cible))
 or exists(select 1 from public.rapport_versions where visite_id in(select id from cible))
 or (select count(*) from maintenance_privee.visites_chantier_test_20260922)<>4
 or (select count(*) from pg_trigger where tgenabled='O' and (tgrelid,tgname) in(
      ('public.rapport_versions'::regclass,'versions_immuables'),('public.reponses'::regclass,'proteger_reponse_visite'),
      ('public.reponses'::regclass,'proteger_ecriture_reponse'),('public.visites'::regclass,'proteger_cloture_visite')))<>4
 then raise exception 'Contrôle après suppression échoué : transaction annulée'; end if;
end $$;
commit;
