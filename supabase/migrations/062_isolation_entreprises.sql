-- S09 : frontière d'entreprise restrictive, y compris pour les administrateurs.
-- Migration transactionnelle. Les données historiques sont attribuées seulement
-- si une unique entreprise existe ; toute ambiguïté annule la migration.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create schema if not exists securionis_prive;
revoke all on schema securionis_prive from public,anon,authenticated,service_role;
create or replace function public.user_entreprise() returns uuid
language sql stable security definer set search_path='' as $$
 select entreprise_id from public.profiles where id=auth.uid()
$$;
revoke all on function public.user_entreprise() from public,anon;
grant execute on function public.user_entreprise() to authenticated,service_role;

do $$ declare t text; entreprise uuid; begin
 if (select count(*) from public.entreprises)<>1 and not exists(select 1 from information_schema.columns where table_schema='public' and table_name='chantiers' and column_name='entreprise_id') then raise exception 'Attribution historique ambiguë : une entreprise unique est requise'; end if;
 select id into entreprise from public.entreprises order by id limit 1;
 foreach t in array array['chantiers','categories','themes','points_controle','base_documentaire','audit_logs'] loop
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='entreprise_id') then
 execute format('alter table public.%I add column entreprise_id uuid not null default %L references public.entreprises(id)',t,entreprise);
 end if;
 execute format('alter table public.%I alter column entreprise_id set default public.user_entreprise()',t);
 execute format('create index if not exists %I on public.%I(entreprise_id)',t||'_entreprise_idx',t);
 end loop;
 if exists(select 1 from public.chantiers c left join public.profiles p on p.id=c.created_by where p.entreprise_id is distinct from c.entreprise_id) then raise exception 'Créateur de chantier hors entreprise'; end if;
end $$;

create or replace function securionis_prive.entreprise_ligne(p_table text,p_id uuid) returns uuid language plpgsql stable security definer set search_path='' as $$ declare resultat uuid; begin
 case p_table
when 'chantiers' then select entreprise_id from public.chantiers where id=p_id into resultat;
when 'categories' then select entreprise_id from public.categories where id=p_id into resultat;
when 'themes' then select entreprise_id from public.themes where id=p_id into resultat;
when 'points_controle' then select entreprise_id from public.points_controle where id=p_id into resultat;
when 'base_documentaire' then select entreprise_id from public.base_documentaire where id=p_id into resultat;
when 'audit_logs' then select entreprise_id from public.audit_logs where id=p_id into resultat;
when 'profiles' then select entreprise_id from public.profiles where id=p_id into resultat;
when 'entreprises' then select id from public.entreprises where id=p_id into resultat;
when 'destinataires' then select securionis_prive.entreprise_ligne('chantiers',chantier_id) from public.destinataires where id=p_id into resultat;
when 'documents' then select securionis_prive.entreprise_ligne('chantiers',chantier_id) from public.documents where id=p_id into resultat;
when 'chantier_inspecteurs' then select securionis_prive.entreprise_ligne('chantiers',chantier_id) from public.chantier_inspecteurs where id=p_id into resultat;
when 'visites' then select securionis_prive.entreprise_ligne('chantiers',chantier_id) from public.visites where id=p_id into resultat;
when 'reponses' then select securionis_prive.entreprise_ligne('visites',visite_id) from public.reponses where id=p_id into resultat;
when 'ecarts' then select securionis_prive.entreprise_ligne('chantiers',chantier_id) from public.ecarts where id=p_id into resultat;
when 'comparaisons' then select securionis_prive.entreprise_ligne('chantiers',chantier_id) from public.comparaisons where id=p_id into resultat;
when 'comparaison_annotations' then select securionis_prive.entreprise_ligne('comparaisons',comparaison_id) from public.comparaison_annotations where id=p_id into resultat;
when 'comparaison_nc_links' then select securionis_prive.entreprise_ligne('comparaison_annotations',annotation_id) from public.comparaison_nc_links where id=p_id into resultat;
when 'point_controle_documents' then select securionis_prive.entreprise_ligne('points_controle',point_controle_id) from public.point_controle_documents where id=p_id into resultat;
when 'point_controle_doc_liens' then select securionis_prive.entreprise_ligne('points_controle',point_controle_id) from public.point_controle_doc_liens where id=p_id into resultat;
when 'rapport_versions' then select securionis_prive.entreprise_ligne('visites',visite_id) from public.rapport_versions where id=p_id into resultat;
when 'push_subscriptions' then select securionis_prive.entreprise_ligne('profiles',user_id) from public.push_subscriptions where id=p_id into resultat;
when 'subscriptions' then select securionis_prive.entreprise_ligne('profiles',user_id) from public.subscriptions where id=p_id into resultat;
else return null; end case; return resultat; end $$;
revoke all on function securionis_prive.entreprise_ligne(text,uuid) from public,anon,authenticated,service_role;

create or replace function public.dans_mon_entreprise(p_table text,p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(public.user_entreprise()=securionis_prive.entreprise_ligne(p_table,p_id),false)
$$;
revoke all on function public.dans_mon_entreprise(text,uuid) from public,anon;
grant execute on function public.dans_mon_entreprise(text,uuid) to authenticated,service_role;

alter table public.chantiers enable row level security;
drop policy if exists entreprise_requise on public.chantiers;
create policy entreprise_requise on public.chantiers as restrictive for all to authenticated using (entreprise_id=(select public.user_entreprise())) with check (entreprise_id=(select public.user_entreprise()));

alter table public.categories enable row level security;
drop policy if exists entreprise_requise on public.categories;
create policy entreprise_requise on public.categories as restrictive for all to authenticated using (entreprise_id=(select public.user_entreprise())) with check (entreprise_id=(select public.user_entreprise()));

alter table public.themes enable row level security;
drop policy if exists entreprise_requise on public.themes;
create policy entreprise_requise on public.themes as restrictive for all to authenticated using (entreprise_id=(select public.user_entreprise())) with check (entreprise_id=(select public.user_entreprise()));

alter table public.points_controle enable row level security;
drop policy if exists entreprise_requise on public.points_controle;
create policy entreprise_requise on public.points_controle as restrictive for all to authenticated using (entreprise_id=(select public.user_entreprise())) with check (entreprise_id=(select public.user_entreprise()));

alter table public.base_documentaire enable row level security;
drop policy if exists entreprise_requise on public.base_documentaire;
create policy entreprise_requise on public.base_documentaire as restrictive for all to authenticated using (entreprise_id=(select public.user_entreprise())) with check (entreprise_id=(select public.user_entreprise()));

alter table public.audit_logs enable row level security;
drop policy if exists entreprise_requise on public.audit_logs;
create policy entreprise_requise on public.audit_logs as restrictive for all to authenticated using (entreprise_id=(select public.user_entreprise())) with check (entreprise_id=(select public.user_entreprise()));

alter table public.profiles enable row level security;
drop policy if exists entreprise_requise on public.profiles;
create policy entreprise_requise on public.profiles as restrictive for all to authenticated using ((id=(select auth.uid()) or entreprise_id=(select public.user_entreprise()))) with check ((id=(select auth.uid()) or entreprise_id=(select public.user_entreprise())));

alter table public.entreprises enable row level security;
drop policy if exists entreprise_requise on public.entreprises;
create policy entreprise_requise on public.entreprises as restrictive for all to authenticated using (id=(select public.user_entreprise())) with check (id=(select public.user_entreprise()));

alter table public.destinataires enable row level security;
drop policy if exists entreprise_requise on public.destinataires;
create policy entreprise_requise on public.destinataires as restrictive for all to authenticated using (public.dans_mon_entreprise('chantiers',chantier_id)) with check (public.dans_mon_entreprise('chantiers',chantier_id));

alter table public.documents enable row level security;
drop policy if exists entreprise_requise on public.documents;
create policy entreprise_requise on public.documents as restrictive for all to authenticated using (public.dans_mon_entreprise('chantiers',chantier_id)) with check (public.dans_mon_entreprise('chantiers',chantier_id));

alter table public.chantier_inspecteurs enable row level security;
drop policy if exists entreprise_requise on public.chantier_inspecteurs;
create policy entreprise_requise on public.chantier_inspecteurs as restrictive for all to authenticated using (public.dans_mon_entreprise('chantiers',chantier_id)) with check (public.dans_mon_entreprise('chantiers',chantier_id));

alter table public.visites enable row level security;
drop policy if exists entreprise_requise on public.visites;
create policy entreprise_requise on public.visites as restrictive for all to authenticated using (public.dans_mon_entreprise('chantiers',chantier_id)) with check (public.dans_mon_entreprise('chantiers',chantier_id));

alter table public.reponses enable row level security;
drop policy if exists entreprise_requise on public.reponses;
create policy entreprise_requise on public.reponses as restrictive for all to authenticated using (public.dans_mon_entreprise('visites',visite_id)) with check (public.dans_mon_entreprise('visites',visite_id));

alter table public.ecarts enable row level security;
drop policy if exists entreprise_requise on public.ecarts;
create policy entreprise_requise on public.ecarts as restrictive for all to authenticated using (public.dans_mon_entreprise('chantiers',chantier_id)) with check (public.dans_mon_entreprise('chantiers',chantier_id));

alter table public.comparaisons enable row level security;
drop policy if exists entreprise_requise on public.comparaisons;
create policy entreprise_requise on public.comparaisons as restrictive for all to authenticated using (public.dans_mon_entreprise('chantiers',chantier_id)) with check (public.dans_mon_entreprise('chantiers',chantier_id));

alter table public.comparaison_annotations enable row level security;
drop policy if exists entreprise_requise on public.comparaison_annotations;
create policy entreprise_requise on public.comparaison_annotations as restrictive for all to authenticated using (public.dans_mon_entreprise('comparaisons',comparaison_id)) with check (public.dans_mon_entreprise('comparaisons',comparaison_id));

alter table public.comparaison_nc_links enable row level security;
drop policy if exists entreprise_requise on public.comparaison_nc_links;
create policy entreprise_requise on public.comparaison_nc_links as restrictive for all to authenticated using (public.dans_mon_entreprise('comparaison_annotations',annotation_id)) with check (public.dans_mon_entreprise('comparaison_annotations',annotation_id));

alter table public.point_controle_documents enable row level security;
drop policy if exists entreprise_requise on public.point_controle_documents;
create policy entreprise_requise on public.point_controle_documents as restrictive for all to authenticated using (public.dans_mon_entreprise('points_controle',point_controle_id)) with check (public.dans_mon_entreprise('points_controle',point_controle_id));

alter table public.point_controle_doc_liens enable row level security;
drop policy if exists entreprise_requise on public.point_controle_doc_liens;
create policy entreprise_requise on public.point_controle_doc_liens as restrictive for all to authenticated using (public.dans_mon_entreprise('points_controle',point_controle_id)) with check (public.dans_mon_entreprise('points_controle',point_controle_id));

alter table public.rapport_versions enable row level security;
drop policy if exists entreprise_requise on public.rapport_versions;
create policy entreprise_requise on public.rapport_versions as restrictive for all to authenticated using (public.dans_mon_entreprise('visites',visite_id)) with check (public.dans_mon_entreprise('visites',visite_id));

alter table public.push_subscriptions enable row level security;
drop policy if exists entreprise_requise on public.push_subscriptions;
create policy entreprise_requise on public.push_subscriptions as restrictive for all to authenticated using (public.dans_mon_entreprise('profiles',user_id)) with check (public.dans_mon_entreprise('profiles',user_id));

alter table public.subscriptions enable row level security;
drop policy if exists entreprise_requise on public.subscriptions;
create policy entreprise_requise on public.subscriptions as restrictive for all to authenticated using (public.dans_mon_entreprise('profiles',user_id)) with check (public.dans_mon_entreprise('profiles',user_id));

drop policy if exists phases_lecture_seule on public.phases;
create policy phases_lecture_seule on public.phases as restrictive for all to authenticated using ((select public.user_entreprise()) is not null) with check (false);

drop policy if exists phases_suppression_interdite on public.phases;
create policy phases_suppression_interdite on public.phases as restrictive for delete to authenticated using (false);
create table if not exists securionis_prive.fichiers_historiques (
 bucket_id text not null, name text not null, entreprise_id uuid not null references public.entreprises,
 primary key(bucket_id,name)
);
alter table securionis_prive.fichiers_historiques enable row level security;
revoke all on securionis_prive.fichiers_historiques from public,anon,authenticated,service_role;
-- Only the initial migration may assign legacy paths. Subsequent runs never
-- attribute unrecognised files to whichever company happens to be first.
insert into securionis_prive.fichiers_historiques(bucket_id,name,entreprise_id)
select o.bucket_id,o.name,e.id from storage.objects o cross join public.entreprises e
where o.bucket_id='rapports' and split_part(o.name,'/',1) in ('base-documentaire','points-controle','logos')
 and (select count(*) from public.entreprises)=1
on conflict do nothing;
create or replace function securionis_prive.entreprise_fichier(p_bucket text,p_name text) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare prefixe text:=split_part(p_name,'/',1); ident text; resultat uuid;
begin
 if p_name is null or p_name ~ '(^/|//|(^|/)\.\.?(/|$))' then return null; end if;
 if p_bucket='rapports' and prefixe in ('base-documentaire','points-controle','logos') then
  select entreprise_id into resultat from securionis_prive.fichiers_historiques where bucket_id=p_bucket and name=p_name;
  if found then return resultat; end if;
  ident:=split_part(p_name,'/',2);
  if ident ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and split_part(p_name,'/',3)<>'' then
   select id into resultat from public.entreprises where id=ident::uuid; return resultat;
  end if;
 elsif p_bucket in ('rapports','visite-photos') then
  ident:=case when p_bucket='rapports' and prefixe='chantiers' then split_part(p_name,'/',2) else prefixe end;
  if ident ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
   return securionis_prive.entreprise_ligne('chantiers',ident::uuid);
  end if;
 end if;
 return null;
end $$;
revoke all on function securionis_prive.entreprise_fichier(text,text) from public,anon,authenticated,service_role;
create or replace function public.fichier_mon_entreprise(p_bucket text,p_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(public.user_entreprise()=securionis_prive.entreprise_fichier(p_bucket,p_name),false)
$$;
revoke all on function public.fichier_mon_entreprise(text,text) from public,anon;
grant execute on function public.fichier_mon_entreprise(text,text) to authenticated,service_role;
drop policy if exists entreprise_requise on storage.objects;
create policy entreprise_requise on storage.objects as restrictive for all to authenticated
using (public.fichier_mon_entreprise(bucket_id,name)) with check (public.fichier_mon_entreprise(bucket_id,name));
-- Les anciens fichiers sont lisibles/supprimables selon les droits existants,
-- mais aucun client ne peut créer/écraser un ancien chemin de bibliothèque.
drop policy if exists bibliotheque_chemin_entreprise on storage.objects;
create policy bibliotheque_chemin_entreprise on storage.objects as restrictive for all to authenticated
using (true) with check (bucket_id<>'rapports' or split_part(name,'/',1) not in ('base-documentaire','points-controle','logos')
 or (split_part(name,'/',2)=(select public.user_entreprise())::text and split_part(name,'/',3)<>''));

create or replace function securionis_prive.verifier_rattachements(p_table text,ligne jsonb) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare entreprise uuid; parent text; col text; ident uuid; relations jsonb; lien text;
begin
 if p_table='entreprises' then entreprise:=(ligne->>'id')::uuid;
 elsif ligne ? 'entreprise_id' then entreprise:=(ligne->>'entreprise_id')::uuid;
 else
  case p_table
when 'destinataires' then entreprise:=securionis_prive.entreprise_ligne('chantiers',(ligne->>'chantier_id')::uuid);
when 'documents' then entreprise:=securionis_prive.entreprise_ligne('chantiers',(ligne->>'chantier_id')::uuid);
when 'chantier_inspecteurs' then entreprise:=securionis_prive.entreprise_ligne('chantiers',(ligne->>'chantier_id')::uuid);
when 'visites' then entreprise:=securionis_prive.entreprise_ligne('chantiers',(ligne->>'chantier_id')::uuid);
when 'reponses' then entreprise:=securionis_prive.entreprise_ligne('visites',(ligne->>'visite_id')::uuid);
when 'ecarts' then entreprise:=securionis_prive.entreprise_ligne('chantiers',(ligne->>'chantier_id')::uuid);
when 'comparaisons' then entreprise:=securionis_prive.entreprise_ligne('chantiers',(ligne->>'chantier_id')::uuid);
when 'comparaison_annotations' then entreprise:=securionis_prive.entreprise_ligne('comparaisons',(ligne->>'comparaison_id')::uuid);
when 'comparaison_nc_links' then entreprise:=securionis_prive.entreprise_ligne('comparaison_annotations',(ligne->>'annotation_id')::uuid);
when 'point_controle_documents' then entreprise:=securionis_prive.entreprise_ligne('points_controle',(ligne->>'point_controle_id')::uuid);
when 'point_controle_doc_liens' then entreprise:=securionis_prive.entreprise_ligne('points_controle',(ligne->>'point_controle_id')::uuid);
when 'rapport_versions' then entreprise:=securionis_prive.entreprise_ligne('visites',(ligne->>'visite_id')::uuid);
when 'push_subscriptions' then entreprise:=securionis_prive.entreprise_ligne('profiles',(ligne->>'user_id')::uuid);
when 'subscriptions' then entreprise:=securionis_prive.entreprise_ligne('profiles',(ligne->>'user_id')::uuid);
  else raise exception 'Table sans périmètre'; end case;
 end if;
 if entreprise is null then raise exception 'Entreprise requise' using errcode='42501'; end if;
 relations:=('{
  "chantiers": {
    "created_by": "profiles"
  },
  "themes": {
    "categorie_id": "categories"
  },
  "points_controle": {
    "categorie_id": "categories",
    "theme_id": "themes",
    "created_by": "profiles"
  },
  "chantier_inspecteurs": {
    "chantier_id": "chantiers",
    "inspecteur_id": "profiles"
  },
  "visites": {
    "chantier_id": "chantiers",
    "inspecteur_id": "profiles",
    "cloturee_par": "profiles"
  },
  "reponses": {
    "visite_id": "visites",
    "point_controle_id": "points_controle",
    "sync_acteur": "profiles"
  },
  "ecarts": {
    "chantier_id": "chantiers",
    "reponse_id": "reponses",
    "updated_by": "profiles"
  },
  "documents": {
    "chantier_id": "chantiers",
    "uploaded_by": "profiles",
    "parent_version_id": "documents"
  },
  "comparaisons": {
    "chantier_id": "chantiers",
    "document_pe_id": "documents",
    "document_exe_id": "documents",
    "created_by": "profiles"
  },
  "comparaison_annotations": {
    "comparaison_id": "comparaisons",
    "created_by": "profiles"
  },
  "comparaison_nc_links": {
    "annotation_id": "comparaison_annotations",
    "nc_id": "ecarts"
  },
  "point_controle_documents": {
    "point_controle_id": "points_controle"
  },
  "point_controle_doc_liens": {
    "point_controle_id": "points_controle",
    "document_id": "base_documentaire"
  },
  "rapport_versions": {
    "visite_id": "visites",
    "auteur_id": "profiles"
  },
  "destinataires": {
    "chantier_id": "chantiers"
  },
  "push_subscriptions": {
    "user_id": "profiles"
  },
  "subscriptions": {
    "user_id": "profiles"
  },
  "audit_logs": {
    "user_id": "profiles"
  }
}'::jsonb)->p_table;
 for col,parent in select key,value from jsonb_each_text(coalesce(relations,'{}'::jsonb)) loop
  ident:=(ligne->>col)::uuid;
  if ident is not null and securionis_prive.entreprise_ligne(parent,ident) is distinct from entreprise then
   raise exception 'Rattachement hors entreprise interdit' using errcode='42501';
  end if;
 end loop;
 if p_table='visites' then
  for lien in select jsonb_array_elements_text(coalesce(nullif(ligne->'categorie_ids','null'::jsonb),'[]'::jsonb)) loop
   if securionis_prive.entreprise_ligne('categories',lien::uuid) is distinct from entreprise then raise exception 'Catégorie hors entreprise' using errcode='42501'; end if;
  end loop;
 elsif p_table='comparaisons' and exists(select 1 from public.documents d where d.id in ((ligne->>'document_pe_id')::uuid,(ligne->>'document_exe_id')::uuid) and d.chantier_id is distinct from (ligne->>'chantier_id')::uuid) then
  raise exception 'Plans de chantiers différents' using errcode='42501';
 end if;
 return entreprise;
end $$;
revoke all on function securionis_prive.verifier_rattachements(text,jsonb) from public,anon,authenticated,service_role;
-- Les références entrantes doivent elles aussi rester dans l'entreprise.
create or replace function securionis_prive.entreprise_reference(reference text, bucket text) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare chemin text;
begin
 if reference like 'https://%' then
  if reference !~ ('^https://[^/]+/storage/v1/object/(public|sign|authenticated)/'||bucket||'/') then return null; end if;
  chemin:=regexp_replace(reference,'^https://[^/]+/storage/v1/object/(public|sign|authenticated)/'||bucket||'/','');
 else chemin:=reference; end if;
 return securionis_prive.entreprise_fichier(bucket,split_part(chemin,'?',1));
end $$;
revoke all on function securionis_prive.entreprise_reference(text,text) from public,anon,authenticated,service_role;
create or replace function public.proteger_entreprise_ligne() returns trigger
language plpgsql security definer set search_path='' as $$
declare entreprise uuid; ancien uuid; ligne jsonb:=to_jsonb(new); avant jsonb; champ text; bucket text; reference text;
begin
 if tg_table_name='audit_logs' and tg_op='INSERT' then
  new.entreprise_id:=securionis_prive.entreprise_ligne('profiles',new.user_id);
 end if;
 entreprise:=securionis_prive.verifier_rattachements(tg_table_name,to_jsonb(new));
 if tg_op='UPDATE' then avant:=to_jsonb(old); end if;
 foreach champ in array array['fichier_url','logo_url','rapport_url','storage_path','capture_url'] loop
  reference:=ligne->>champ;
  if reference is not null and (tg_op='INSERT' or reference is distinct from avant->>champ) then
   bucket:=case when champ='capture_url' then 'visite-photos' else 'rapports' end;
   if securionis_prive.entreprise_reference(reference,bucket) is distinct from entreprise then raise exception 'Fichier hors entreprise interdit' using errcode='42501'; end if;
  end if;
 end loop;
 if tg_table_name='reponses' and (tg_op='INSERT' or ligne->'photos' is distinct from avant->'photos') then
  for reference in select jsonb_array_elements_text(coalesce(nullif(ligne->'photos','null'::jsonb),'[]'::jsonb)) loop
   if securionis_prive.entreprise_reference(reference,'visite-photos') is distinct from entreprise then raise exception 'Photo hors entreprise interdite' using errcode='42501'; end if;
  end loop;
 end if;

 if tg_op='UPDATE' then
  ancien:=securionis_prive.verifier_rattachements(tg_table_name,to_jsonb(old));
  if new.id is distinct from old.id or entreprise is distinct from ancien then raise exception 'Transfert d’entreprise interdit' using errcode='42501'; end if;
 end if;
 if current_setting('role',true) in ('authenticated','anon') and entreprise is distinct from public.user_entreprise() then raise exception 'Accès hors entreprise interdit' using errcode='42501'; end if;
 return new;
end $$;
revoke all on function public.proteger_entreprise_ligne() from public,anon,authenticated,service_role;

drop trigger if exists proteger_entreprise_ligne on public.chantiers;
create trigger proteger_entreprise_ligne before insert or update on public.chantiers for each row execute function public.proteger_entreprise_ligne();

drop trigger if exists proteger_entreprise_ligne on public.categories;
create trigger proteger_entreprise_ligne before insert or update on public.categories for each row execute function public.proteger_entreprise_ligne();

drop trigger if exists proteger_entreprise_ligne on public.themes;
create trigger proteger_entreprise_ligne before insert or update on public.themes for each row execute function public.proteger_entreprise_ligne();

drop trigger if exists proteger_entreprise_ligne on public.points_controle;
create trigger proteger_entreprise_ligne before insert or update on public.points_controle for each row execute function public.proteger_entreprise_ligne();

drop trigger if exists proteger_entreprise_ligne on public.base_documentaire;
create trigger proteger_entreprise_ligne before insert or update on public.base_documentaire for each row execute function public.proteger_entreprise_ligne();

drop trigger if exists proteger_entreprise_ligne on public.audit_logs;
create trigger proteger_entreprise_ligne before insert or update on public.audit_logs for each row execute function public.proteger_entreprise_ligne();

drop trigger if exists proteger_entreprise_ligne on public.entreprises;
create trigger proteger_entreprise_ligne before insert or update on public.entreprises for each row execute function public.proteger_entreprise_ligne();

drop trigger if exists proteger_entreprise_ligne on public.destinataires;
create trigger proteger_entreprise_ligne before insert or update on public.destinataires for each row execute function public.proteger_entreprise_ligne();

drop trigger if exists proteger_entreprise_ligne on public.documents;
create trigger proteger_entreprise_ligne before insert or update on public.documents for each row execute function public.proteger_entreprise_ligne();

drop trigger if exists proteger_entreprise_ligne on public.chantier_inspecteurs;
create trigger proteger_entreprise_ligne before insert or update on public.chantier_inspecteurs for each row execute function public.proteger_entreprise_ligne();

drop trigger if exists proteger_entreprise_ligne on public.visites;
create trigger proteger_entreprise_ligne before insert or update on public.visites for each row execute function public.proteger_entreprise_ligne();

drop trigger if exists proteger_entreprise_ligne on public.reponses;
create trigger proteger_entreprise_ligne before insert or update on public.reponses for each row execute function public.proteger_entreprise_ligne();

drop trigger if exists proteger_entreprise_ligne on public.ecarts;
create trigger proteger_entreprise_ligne before insert or update on public.ecarts for each row execute function public.proteger_entreprise_ligne();

drop trigger if exists proteger_entreprise_ligne on public.comparaisons;
create trigger proteger_entreprise_ligne before insert or update on public.comparaisons for each row execute function public.proteger_entreprise_ligne();

drop trigger if exists proteger_entreprise_ligne on public.comparaison_annotations;
create trigger proteger_entreprise_ligne before insert or update on public.comparaison_annotations for each row execute function public.proteger_entreprise_ligne();

drop trigger if exists proteger_entreprise_ligne on public.comparaison_nc_links;
create trigger proteger_entreprise_ligne before insert or update on public.comparaison_nc_links for each row execute function public.proteger_entreprise_ligne();

drop trigger if exists proteger_entreprise_ligne on public.point_controle_documents;
create trigger proteger_entreprise_ligne before insert or update on public.point_controle_documents for each row execute function public.proteger_entreprise_ligne();

drop trigger if exists proteger_entreprise_ligne on public.point_controle_doc_liens;
create trigger proteger_entreprise_ligne before insert or update on public.point_controle_doc_liens for each row execute function public.proteger_entreprise_ligne();

drop trigger if exists proteger_entreprise_ligne on public.rapport_versions;
create trigger proteger_entreprise_ligne before insert or update on public.rapport_versions for each row execute function public.proteger_entreprise_ligne();

drop trigger if exists proteger_entreprise_ligne on public.push_subscriptions;
create trigger proteger_entreprise_ligne before insert or update on public.push_subscriptions for each row execute function public.proteger_entreprise_ligne();

drop trigger if exists proteger_entreprise_ligne on public.subscriptions;
create trigger proteger_entreprise_ligne before insert or update on public.subscriptions for each row execute function public.proteger_entreprise_ligne();

create or replace function public.prevent_user_self_role_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.id is distinct from old.id or (old.entreprise_id is not null and new.entreprise_id is distinct from old.entreprise_id) then
  raise exception 'Transfert de profil interdit' using errcode='42501';
 end if;
 if current_setting('role',true)<>'service_role' and (new.role is distinct from old.role or new.entreprise_id is distinct from old.entreprise_id) then
  raise exception 'Modification de rôle ou entreprise réservée au serveur' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function public.prevent_user_self_role_change() from public,anon,authenticated;
drop trigger if exists enforce_role_immutability on public.profiles;
create trigger enforce_role_immutability before update on public.profiles for each row execute function public.prevent_user_self_role_change();

create or replace function public.supprimer_visite_brouillon(p_visite_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v public.visites%rowtype;
  nb integer;
begin
  if not public.dans_mon_entreprise('visites',p_visite_id) then raise exception 'Visite introuvable ou accès refusé' using errcode='42501'; end if;
  if not public.session_mfa_valide() then
    raise exception 'Authentification complète requise' using errcode = '42501';
  end if;
  select * into v from public.visites where id = p_visite_id for update;
  if not found then
    raise exception 'Visite introuvable ou accès refusé' using errcode = '42501';
  end if;
  if public.user_role() is distinct from 'administrateur' then
    perform 1 from public.chantier_inspecteurs
      where chantier_id = v.chantier_id and inspecteur_id = auth.uid() for share;
    if not found then
      raise exception 'Visite introuvable ou accès refusé' using errcode = '42501';
    end if;
  end if;
  if v.statut = 'terminee' then
    raise exception 'Impossible de supprimer une visite terminée' using errcode = '22023';
  end if;
  select count(*) into nb from public.reponses where visite_id = v.id;
  delete from public.ecarts where reponse_id in (select id from public.reponses where visite_id = v.id);
  delete from public.visites where id = v.id;
  return jsonb_build_object('id', v.id, 'chantier_id', v.chantier_id,
    'statut', v.statut, 'rapport_url', v.rapport_url, 'date_visite', v.date_visite,
    'reponses', nb);
end;
$$;

create or replace function public.verrouiller_visite_cloture(p_visite_id uuid)
returns public.visites language plpgsql security definer set search_path='' as $$
declare v public.visites%rowtype; role_acteur text;
begin
  if not public.dans_mon_entreprise('visites',p_visite_id) then raise exception 'Visite introuvable ou accès refusé' using errcode='42501'; end if;
  if not public.session_mfa_valide() then raise exception 'Authentification complète requise' using errcode='42501'; end if;
  select * into v from public.visites where id=p_visite_id for update;
  if not found then raise exception 'Visite introuvable ou accès refusé' using errcode='42501'; end if;
  select role into role_acteur from public.profiles where id=auth.uid() for share;
  if not found then raise exception 'Profil requis' using errcode='42501'; end if;
  if role_acteur is distinct from 'administrateur' then
    perform 1 from public.chantier_inspecteurs where chantier_id=v.chantier_id and inspecteur_id=auth.uid() for share;
    if not found then raise exception 'Affectation actuelle requise' using errcode='42501'; end if;
  end if;
  perform p.id from public.points_controle p join public.reponses r on r.point_controle_id=p.id
    where r.visite_id=v.id order by p.id for share of p;
  return v;
end;
$$;

create or replace function public.publier_version_rapport(
  p_id uuid, p_visite_id uuid, p_auteur_id uuid, p_reference_attendue text,
  p_sha256 text, p_motif text, p_source jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v public.visites%rowtype; acteur public.profiles%rowtype; chemin text;
begin
  select * into v from public.visites where id=p_visite_id for update;
  if not found or v.statut <> 'terminee' then
    raise exception 'Visite terminée requise' using errcode='22023';
  end if;
  select * into acteur from public.profiles where id=p_auteur_id for share;
  if not found or acteur.role not in ('administrateur','inspecteur') then
    raise exception 'Accès refusé' using errcode='42501';
  end if;
  if acteur.entreprise_id is null or acteur.entreprise_id is distinct from securionis_prive.entreprise_ligne('chantiers',v.chantier_id) then raise exception 'Accès refusé' using errcode='42501'; end if;
  if acteur.role <> 'administrateur' then
    perform 1 from public.chantier_inspecteurs where chantier_id=v.chantier_id and inspecteur_id=p_auteur_id for share;
    if not found then raise exception 'Affectation actuelle requise' using errcode='42501'; end if;
  end if;
  if v.rapport_url is distinct from p_reference_attendue then
    raise exception 'Un autre rapport a été publié. Rechargez la page.' using errcode='40001';
  end if;
  if p_motif is null or char_length(trim(p_motif)) < 5 or char_length(p_motif) > 1000
    or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$'
    or p_source is null or jsonb_typeof(p_source) <> 'object' or octet_length(p_source::text) > 2097152 then
    raise exception 'Métadonnées de version invalides' using errcode='22023';
  end if;
  chemin := v.chantier_id::text || '/visites/' || v.id::text || '/versions/' || p_id::text || '.pdf';
  if not exists (select 1 from storage.objects where bucket_id='rapports' and name=chemin) then
    raise exception 'Fichier de version absent' using errcode='22023';
  end if;
  insert into public.rapport_versions(id,visite_id,storage_path,sha256,auteur_id,auteur_nom,motif,source)
    values (p_id,v.id,chemin,p_sha256,acteur.id,acteur.nom,trim(p_motif),p_source);
  update public.visites set rapport_url=chemin,email_envoye=false,updated_at=clock_timestamp() where id=v.id;
  return p_id;
end;
$$;

do $$ declare t text; ligne jsonb; begin
 foreach t in array array['chantiers','categories','themes','points_controle','base_documentaire','audit_logs','entreprises','destinataires','documents','chantier_inspecteurs','visites','reponses','ecarts','comparaisons','comparaison_annotations','comparaison_nc_links','point_controle_documents','point_controle_doc_liens','rapport_versions','push_subscriptions','subscriptions'] loop
 for ligne in execute format('select to_jsonb(ligne_source.*) from public.%I ligne_source',t) loop
 perform securionis_prive.verifier_rattachements(t,ligne);
 end loop; end loop; end $$;

notify pgrst,'reload schema';
commit;
