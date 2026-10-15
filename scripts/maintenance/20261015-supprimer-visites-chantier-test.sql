-- Opération ponctuelle explicitement confirmée par le propriétaire le 15 octobre 2026 :
-- suppression des 2 visites du chantier de test « AA - Chantier Test » (terminées ;
-- le rapport du 13 octobre a été envoyé par email, l'email
-- n'est pas rappelé), avec leurs NC et leur historique de correction, archives et versions.
-- Exécuter comme propriétaire PostgreSQL, jamais via une RPC accessible aux clients.
-- Une sélection changée, une dépendance inattendue ou un deuxième passage annule tout.
-- Les 9 fichiers Storage (3 PDF, 2 photos, 2 sources, 2 copies d'archive) se suppriment
-- ensuite par l'API Storage.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
lock table public.visites,public.reponses,public.ecarts,public.rapport_versions,
 public.visite_archives,public.visite_avenants,securionis_prive.preparations_archives,
 public.ecart_evenements,public.ecart_pieces,public.ecart_suivis,public.comparaison_nc_links
 in access exclusive mode;
create temporary table cible(id uuid primary key) on commit drop;
insert into cible values ('5cad98a2-b3d2-4d25-801e-3d5512d01fa9'),('420da7d0-4c0e-4752-9ff7-c1d6aa24f290');
create temporary table cible_ecarts on commit drop as
 select e.id from public.ecarts e join public.reponses r on r.id=e.reponse_id
 where r.visite_id in(select id from cible);
do $$ begin
 if (select count(*) from public.visites v join cible c using(id)
     where v.chantier_id='049b586c-63ef-4c72-aac6-deeb1a770e64' and v.statut='terminee')<>2
 or (select count(*) from public.visites where chantier_id='049b586c-63ef-4c72-aac6-deeb1a770e64')<>2
 or (select count(*) from public.reponses where visite_id in(select id from cible))<>2
 or (select count(*) from cible_ecarts)<>2
 or (select count(*) from public.ecart_evenements where ecart_id in(select id from cible_ecarts))<>3
 or (select count(*) from public.ecart_suivis where ecart_id in(select id from cible_ecarts))<>1
 or (select count(*) from public.rapport_versions where visite_id in(select id from cible))<>3
 or (select count(*) from public.visite_archives where visite_id in(select id from cible))<>2
 or (select count(*) from securionis_prive.preparations_archives where visite_id in(select id from cible))<>2
 then raise exception 'La sélection confirmée a changé : suppression annulée'; end if;
 if exists(select 1 from public.visite_avenants where visite_id in(select id from cible))
 or exists(select 1 from public.ecart_pieces where ecart_id in(select id from cible_ecarts))
 or exists(select 1 from public.comparaison_nc_links where nc_id in(select id from cible_ecarts))
 then raise exception 'Dépendance inattendue : suppression annulée'; end if;
 if to_regclass('maintenance_privee.visites_chantier_test_20261015') is not null
 then raise exception 'Déjà exécuté : suppression annulée'; end if;
end $$;
create schema if not exists maintenance_privee;
revoke all on schema maintenance_privee from public,anon,authenticated,service_role;
create table maintenance_privee.visites_chantier_test_20261015(
 table_source text not null,id uuid not null,donnees jsonb not null,
 sauvegardee_le timestamptz not null default clock_timestamp(),
 motif text not null default 'Suppression des 2 visites de « AA - Chantier Test » demandée par le propriétaire le 15 octobre 2026',
 primary key(table_source,id)
);
alter table maintenance_privee.visites_chantier_test_20261015 enable row level security;
revoke all on maintenance_privee.visites_chantier_test_20261015 from public,anon,authenticated,service_role;
insert into maintenance_privee.visites_chantier_test_20261015(table_source,id,donnees)
select 'visites',id,to_jsonb(v) from public.visites v where id in(select id from cible)
union all select 'reponses',id,to_jsonb(r) from public.reponses r where visite_id in(select id from cible)
union all select 'ecarts',id,to_jsonb(e) from public.ecarts e where id in(select id from cible_ecarts)
union all select 'rapport_versions',id,to_jsonb(rv) from public.rapport_versions rv where visite_id in(select id from cible)
union all select 'visite_archives',id,to_jsonb(a) from public.visite_archives a where visite_id in(select id from cible)
union all select 'preparations_archives',id,to_jsonb(p) from securionis_prive.preparations_archives p where visite_id in(select id from cible)
union all select 'ecart_evenements',id,to_jsonb(x) from public.ecart_evenements x where ecart_id in(select id from cible_ecarts)
union all select 'ecart_suivis',ecart_id,to_jsonb(x) from public.ecart_suivis x where ecart_id in(select id from cible_ecarts);
-- Exception limitée à cette transaction, sous verrou exclusif ; protections rétablies AVANT le commit.
alter table public.ecart_evenements disable trigger historique_immuable;
alter table public.ecarts disable trigger proteger_ecart_visite;
alter table public.rapport_versions disable trigger versions_immuables;
alter table public.visite_archives disable trigger archive_immuable;
alter table securionis_prive.preparations_archives disable trigger preparation_immuable;
alter table public.reponses disable trigger proteger_reponse_visite;
alter table public.reponses disable trigger proteger_ecriture_reponse;
alter table public.visites disable trigger proteger_cloture_visite;
delete from public.ecart_suivis where ecart_id in(select id from cible_ecarts);
delete from public.ecart_evenements where ecart_id in(select id from cible_ecarts);
delete from public.ecarts where id in(select id from cible_ecarts);
delete from public.rapport_versions where visite_id in(select id from cible);
delete from public.visite_archives where visite_id in(select id from cible);
delete from securionis_prive.preparations_archives where visite_id in(select id from cible);
delete from public.visites where id in(select id from cible);
alter table public.ecart_evenements enable trigger historique_immuable;
alter table public.ecarts enable trigger proteger_ecart_visite;
alter table public.rapport_versions enable trigger versions_immuables;
alter table public.visite_archives enable trigger archive_immuable;
alter table securionis_prive.preparations_archives enable trigger preparation_immuable;
alter table public.reponses enable trigger proteger_reponse_visite;
alter table public.reponses enable trigger proteger_ecriture_reponse;
alter table public.visites enable trigger proteger_cloture_visite;
insert into public.audit_logs(user_id,action,resource,resource_id,details,entreprise_id)
select '760ff84a-f43a-43c6-9ca2-184423e30f0b','delete_visite','visites',d.id::text,
 jsonb_build_object('maintenance','20261015-supprimer-visites-chantier-test','statut',d.donnees->>'statut',
  'date_visite',d.donnees->>'date_visite','ecarts_supprimes',(select count(*) from cible_ecarts)),
 (select entreprise_id from public.chantiers where id='049b586c-63ef-4c72-aac6-deeb1a770e64')
from maintenance_privee.visites_chantier_test_20261015 d where d.table_source='visites';
do $$ begin
 if exists(select 1 from public.visites where id in(select id from cible))
 or exists(select 1 from public.reponses where visite_id in(select id from cible))
 or exists(select 1 from public.ecarts where id in(select id from cible_ecarts))
 or exists(select 1 from public.ecart_evenements where ecart_id in(select id from cible_ecarts))
 or exists(select 1 from public.ecart_suivis where ecart_id in(select id from cible_ecarts))
 or exists(select 1 from public.visites where chantier_id='049b586c-63ef-4c72-aac6-deeb1a770e64')
 or exists(select 1 from public.rapport_versions where visite_id in(select id from cible))
 or exists(select 1 from public.visite_archives where visite_id in(select id from cible))
 or exists(select 1 from securionis_prive.preparations_archives where visite_id in(select id from cible))
 or (select count(*) from maintenance_privee.visites_chantier_test_20261015)<>17
 or (select count(*) from pg_trigger where tgenabled='O' and (tgrelid,tgname) in(
      ('public.ecart_evenements'::regclass,'historique_immuable'),('public.ecarts'::regclass,'proteger_ecart_visite'),('public.rapport_versions'::regclass,'versions_immuables'),
      ('public.visite_archives'::regclass,'archive_immuable'),('securionis_prive.preparations_archives'::regclass,'preparation_immuable'),
      ('public.reponses'::regclass,'proteger_reponse_visite'),('public.reponses'::regclass,'proteger_ecriture_reponse'),
      ('public.visites'::regclass,'proteger_cloture_visite')))<>8
 then raise exception 'Contrôle après suppression échoué : transaction annulée'; end if;
end $$;
commit;
