-- Opération ponctuelle explicitement confirmée par le propriétaire le 6 octobre 2026 :
-- suppression de la visite du 6 octobre 2026 du chantier « CAMAC 249'045 - Rue des
-- Remparts 27 » (terminée, rapport envoyé le jour même à deux destinataires — l'email
-- n'est pas rappelé), avec sa NC, son archive de clôture et sa version de rapport.
-- Exécuter comme propriétaire PostgreSQL, jamais via une RPC accessible aux clients.
-- Une sélection changée, une dépendance inattendue ou un deuxième passage annule tout.
-- Les 2 fichiers Storage (PDF du rapport, image source de l'archive) se suppriment
-- ensuite par l'API Storage.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
lock table public.visites,public.reponses,public.ecarts,public.rapport_versions,
 public.visite_archives,public.visite_avenants,securionis_prive.preparations_archives,
 public.ecart_evenements,public.ecart_pieces,public.ecart_suivis,public.comparaison_nc_links
 in access exclusive mode;
create temporary table cible(id uuid primary key) on commit drop;
insert into cible values ('3469b79e-6f25-44e8-bca5-1aef9fcb1d2b');
create temporary table cible_ecarts on commit drop as
 select e.id from public.ecarts e join public.reponses r on r.id=e.reponse_id
 where r.visite_id in(select id from cible);
do $$ begin
 if (select count(*) from public.visites v join cible c using(id)
     where v.chantier_id='60494759-2801-4f88-b489-a9e6982e2742' and v.statut='terminee')<>1
 or (select count(*) from public.reponses where visite_id in(select id from cible))<>2
 or (select count(*) from cible_ecarts)<>1
 or (select count(*) from public.rapport_versions where visite_id in(select id from cible))<>1
 or (select count(*) from public.visite_archives where visite_id in(select id from cible))<>1
 or (select count(*) from securionis_prive.preparations_archives where visite_id in(select id from cible))<>1
 then raise exception 'La sélection confirmée a changé : suppression annulée'; end if;
 if exists(select 1 from public.visite_avenants where visite_id in(select id from cible))
 or exists(select 1 from public.ecart_evenements where ecart_id in(select id from cible_ecarts))
 or exists(select 1 from public.ecart_pieces where ecart_id in(select id from cible_ecarts))
 or exists(select 1 from public.ecart_suivis where ecart_id in(select id from cible_ecarts))
 or exists(select 1 from public.comparaison_nc_links where nc_id in(select id from cible_ecarts))
 then raise exception 'Dépendance inattendue : suppression annulée'; end if;
 if to_regclass('maintenance_privee.visite_camac_249045_20261006') is not null
 then raise exception 'Déjà exécuté : suppression annulée'; end if;
end $$;
create schema if not exists maintenance_privee;
revoke all on schema maintenance_privee from public,anon,authenticated,service_role;
create table maintenance_privee.visite_camac_249045_20261006(
 table_source text not null,id uuid not null,donnees jsonb not null,
 sauvegardee_le timestamptz not null default clock_timestamp(),
 motif text not null default 'Suppression de la visite du 6 octobre 2026 de « CAMAC 249''045 - Rue des Remparts 27 » confirmée par le propriétaire le 6 octobre 2026',
 primary key(table_source,id)
);
alter table maintenance_privee.visite_camac_249045_20261006 enable row level security;
revoke all on maintenance_privee.visite_camac_249045_20261006 from public,anon,authenticated,service_role;
insert into maintenance_privee.visite_camac_249045_20261006(table_source,id,donnees)
select 'visites',id,to_jsonb(v) from public.visites v where id in(select id from cible)
union all select 'reponses',id,to_jsonb(r) from public.reponses r where visite_id in(select id from cible)
union all select 'ecarts',id,to_jsonb(e) from public.ecarts e where id in(select id from cible_ecarts)
union all select 'rapport_versions',id,to_jsonb(rv) from public.rapport_versions rv where visite_id in(select id from cible)
union all select 'visite_archives',id,to_jsonb(a) from public.visite_archives a where visite_id in(select id from cible)
union all select 'preparations_archives',id,to_jsonb(p) from securionis_prive.preparations_archives p where visite_id in(select id from cible);
-- Exception limitée à cette transaction, sous verrou exclusif ; protections rétablies AVANT le commit.
alter table public.ecarts disable trigger proteger_ecart_visite;
alter table public.rapport_versions disable trigger versions_immuables;
alter table public.visite_archives disable trigger archive_immuable;
alter table securionis_prive.preparations_archives disable trigger preparation_immuable;
alter table public.reponses disable trigger proteger_reponse_visite;
alter table public.reponses disable trigger proteger_ecriture_reponse;
alter table public.visites disable trigger proteger_cloture_visite;
delete from public.ecarts where id in(select id from cible_ecarts);
delete from public.rapport_versions where visite_id in(select id from cible);
delete from public.visite_archives where visite_id in(select id from cible);
delete from securionis_prive.preparations_archives where visite_id in(select id from cible);
delete from public.visites where id in(select id from cible);
alter table public.ecarts enable trigger proteger_ecart_visite;
alter table public.rapport_versions enable trigger versions_immuables;
alter table public.visite_archives enable trigger archive_immuable;
alter table securionis_prive.preparations_archives enable trigger preparation_immuable;
alter table public.reponses enable trigger proteger_reponse_visite;
alter table public.reponses enable trigger proteger_ecriture_reponse;
alter table public.visites enable trigger proteger_cloture_visite;
insert into public.audit_logs(user_id,action,resource,resource_id,details,entreprise_id)
select '760ff84a-f43a-43c6-9ca2-184423e30f0b','delete_visite','visites',d.id::text,
 jsonb_build_object('maintenance','20261006-supprimer-visite-camac-249045','statut',d.donnees->>'statut',
  'date_visite',d.donnees->>'date_visite','ecarts_supprimes',(select count(*) from cible_ecarts)),
 '450a6b52-a7ab-4850-b886-460cd86a004b'
from maintenance_privee.visite_camac_249045_20261006 d where d.table_source='visites';
do $$ begin
 if exists(select 1 from public.visites where id in(select id from cible))
 or exists(select 1 from public.reponses where visite_id in(select id from cible))
 or exists(select 1 from public.ecarts where id in(select id from cible_ecarts))
 or exists(select 1 from public.rapport_versions where visite_id in(select id from cible))
 or exists(select 1 from public.visite_archives where visite_id in(select id from cible))
 or exists(select 1 from securionis_prive.preparations_archives where visite_id in(select id from cible))
 or (select count(*) from maintenance_privee.visite_camac_249045_20261006)<>7
 or (select count(*) from pg_trigger where tgenabled='O' and (tgrelid,tgname) in(
      ('public.ecarts'::regclass,'proteger_ecart_visite'),('public.rapport_versions'::regclass,'versions_immuables'),
      ('public.visite_archives'::regclass,'archive_immuable'),('securionis_prive.preparations_archives'::regclass,'preparation_immuable'),
      ('public.reponses'::regclass,'proteger_reponse_visite'),('public.reponses'::regclass,'proteger_ecriture_reponse'),
      ('public.visites'::regclass,'proteger_cloture_visite')))<>7
 then raise exception 'Contrôle après suppression échoué : transaction annulée'; end if;
end $$;
commit;
