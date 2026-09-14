-- Sources figées à la clôture ; reprise historique explicitement datée.
begin;
create table public.visite_archives (
 id uuid primary key, visite_id uuid not null unique references public.visites(id),
 auteur_id uuid not null, mode text not null check(mode in ('cloture','reprise_historique')),
 contenu text not null check(octet_length(contenu)<=8388608),
 sha256 text not null check(sha256=encode(sha256(convert_to(contenu,'UTF8')),'hex')),
 created_at timestamptz not null default clock_timestamp()
);
alter table public.visite_archives enable row level security;
revoke all on public.visite_archives from public,anon,authenticated,service_role;
grant select on public.visite_archives to authenticated,service_role;
create policy lecture_visite on public.visite_archives for select to authenticated using(public.user_role() in ('administrateur','inspecteur') and exists(select 1 from public.visites v where v.id=visite_id));
create policy session_mfa_requise on public.visite_archives as restrictive for all to authenticated using((select public.session_mfa_valide())) with check((select public.session_mfa_valide()));
create policy entreprise_requise on public.visite_archives as restrictive for all to authenticated using(public.dans_mon_entreprise('visites',visite_id)) with check(public.dans_mon_entreprise('visites',visite_id));
create trigger archive_immuable before update or delete on public.visite_archives for each row execute function public.refuser_mutation_version_rapport();
create table securionis_prive.preparations_archives (
 id uuid primary key, visite_id uuid not null references public.visites(id), auteur_id uuid not null,
 empreinte text not null, source jsonb not null, fichiers jsonb not null,
 created_at timestamptz not null default clock_timestamp()
);
alter table securionis_prive.preparations_archives enable row level security;
revoke all on securionis_prive.preparations_archives from public,anon,authenticated,service_role;
create trigger preparation_immuable before update or delete on securionis_prive.preparations_archives for each row execute function public.refuser_mutation_version_rapport();

-- Un seul SELECT produit toutes les composantes au même instant MVCC.
create or replace function securionis_prive.source_visite(p_id uuid)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object(
 'visite',to_jsonb(v.*), 'chantier',to_jsonb(c.*),
 'inspecteur',(select jsonb_build_object('nom',p.nom,'email',p.email,'entreprise_id',p.entreprise_id) from public.profiles p where p.id=v.inspecteur_id),
 'entreprise',(select to_jsonb(e.*) from public.entreprises e where e.id=c.entreprise_id),
 'reponses',(select coalesce(jsonb_agg(to_jsonb(r.*)||jsonb_build_object('points_controle',to_jsonb(pc.*),'categorie',(select to_jsonb(cat.*) from public.categories cat where cat.id=pc.categorie_id),'theme',(select to_jsonb(t.*) from public.themes t where t.id=pc.theme_id)) order by r.id),'[]'::jsonb) from public.reponses r join public.points_controle pc on pc.id=r.point_controle_id where r.visite_id=v.id),
 'ecarts',(select coalesce(jsonb_agg(to_jsonb(e.*) order by e.id),'[]'::jsonb) from public.ecarts e where e.chantier_id=v.chantier_id),
 'destinataires',(select coalesce(jsonb_agg(to_jsonb(d.*) order by d.id),'[]'::jsonb) from public.destinataires d where d.chantier_id=v.chantier_id),
 'documents_points',(select coalesce(jsonb_agg(to_jsonb(d.*) order by d.id),'[]'::jsonb) from public.point_controle_documents d where d.point_controle_id in(select r.point_controle_id from public.reponses r where r.visite_id=v.id)),
 'liens_documents',(select coalesce(jsonb_agg(to_jsonb(l.*) order by l.id),'[]'::jsonb) from public.point_controle_doc_liens l where l.point_controle_id in(select r.point_controle_id from public.reponses r where r.visite_id=v.id)),
 'bibliotheque',(select coalesce(jsonb_agg(to_jsonb(d.*) order by d.id),'[]'::jsonb) from public.base_documentaire d where d.id in(select l.document_id from public.point_controle_doc_liens l join public.reponses r on r.point_controle_id=l.point_controle_id where r.visite_id=v.id))
 ) from public.visites v join public.chantiers c on c.id=v.chantier_id where v.id=p_id;
$$;
revoke all on function securionis_prive.source_visite(uuid) from public,anon,authenticated,service_role;
create or replace function public.empreinte_constats_visite(p_visite_id uuid)
returns text language sql set search_path='' as $$ select encode(sha256(convert_to(securionis_prive.source_visite(p_visite_id)::text,'UTF8')),'hex') $$;

create function securionis_prive.fichiers_source(p_source jsonb)
returns jsonb language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('bucket',bucket,'reference',reference,'type',type) order by bucket,reference),'[]'::jsonb) from (
 select 'visite-photos' as bucket,p.value #>> '{}' as reference,'image' as type from jsonb_array_elements(p_source->'reponses') r cross join lateral jsonb_array_elements(coalesce(nullif(r->'photos','null'::jsonb),'[]'::jsonb)) p
 union select 'rapports',p_source->'entreprise'->>'logo_url','image' where coalesce(p_source->'entreprise'->>'logo_url','')<>''
 union select 'rapports',d->>'fichier_url','document' from jsonb_array_elements((p_source->'documents_points')||(p_source->'bibliotheque')) d
 ) f;
$$;
revoke all on function securionis_prive.fichiers_source(jsonb) from public,anon,authenticated,service_role;

create function public.preparer_archive_visite(p_visite_id uuid,p_operation_id uuid,p_empreinte text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.visites%rowtype; a public.visite_archives%rowtype; p securionis_prive.preparations_archives%rowtype; source jsonb; empreinte text;
begin
 v:=public.verrouiller_visite_cloture(p_visite_id);
 if public.user_role() not in ('administrateur','inspecteur') or p_operation_id is null then raise exception 'Validation réservée aux inspecteurs et administrateurs' using errcode='42501'; end if;
 select * into a from public.visite_archives where visite_id=v.id;
 if found then return jsonb_build_object('archive_id',a.id,'terminee',true); end if;
 select * into p from securionis_prive.preparations_archives where id=p_operation_id;
 if found then
   if p.visite_id<>v.id or p.auteur_id<>auth.uid() or p.empreinte is distinct from p_empreinte then raise exception 'Opération déjà utilisée' using errcode='40001'; end if;
   return jsonb_build_object('preparee',true);
 end if;
 source:=securionis_prive.source_visite(v.id);
 empreinte:=encode(sha256(convert_to(source::text,'UTF8')),'hex');
 if (v.statut<>'terminee' and p_empreinte is distinct from empreinte) or (v.statut='terminee' and p_empreinte is not null) then raise exception 'Les sources ont changé. Reprenez la validation.' using errcode='40001'; end if;
 return jsonb_build_object('source',source,'empreinte',empreinte,'fichiers',securionis_prive.fichiers_source(source),'mode',case when v.statut='terminee' then 'reprise_historique' else 'cloture' end);
end;
$$;
revoke all on function public.preparer_archive_visite(uuid,uuid,text) from public,anon,service_role;
grant execute on function public.preparer_archive_visite(uuid,uuid,text) to authenticated;

create function public.enregistrer_preparation_archive(p_id uuid,p_visite_id uuid,p_auteur_id uuid,p_empreinte text,p_fichiers jsonb,p_mode text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v public.visites%rowtype; acteur public.profiles%rowtype; source jsonb; f jsonb; attendus jsonb; recus jsonb; contenu text; prefixe text; a public.visite_archives%rowtype;
begin
 select * into v from public.visites where id=p_visite_id for update;
 select * into acteur from public.profiles where id=p_auteur_id for share;
 if v.id is null or acteur.id is null or acteur.role not in ('administrateur','inspecteur') or acteur.entreprise_id is distinct from securionis_prive.entreprise_ligne('visites',v.id) then raise exception 'Accès refusé' using errcode='42501'; end if;
 if acteur.role<>'administrateur' then
   perform 1 from public.chantier_inspecteurs where chantier_id=v.chantier_id and inspecteur_id=acteur.id for share;
   if not found then raise exception 'Affectation actuelle requise' using errcode='42501'; end if;
 end if;
 select * into a from public.visite_archives where visite_id=v.id;
 if found then return a.id; end if;
 if p_id is null or p_mode is null or p_mode not in ('cloture','reprise_historique') or (p_mode='cloture') is distinct from (v.statut<>'terminee') then raise exception 'État de visite incompatible' using errcode='40001'; end if;
 source:=securionis_prive.source_visite(v.id);
 if encode(sha256(convert_to(source::text,'UTF8')),'hex') is distinct from p_empreinte then raise exception 'Les sources ont changé pendant leur copie' using errcode='40001'; end if;
 if p_fichiers is null or jsonb_typeof(p_fichiers)<>'array' or octet_length(p_fichiers::text)>2097152 or jsonb_array_length(p_fichiers)>300 then raise exception 'Manifeste invalide' using errcode='22023'; end if;
 attendus:=securionis_prive.fichiers_source(source);
 select coalesce(jsonb_agg(jsonb_build_object('bucket',entree->>'bucket','reference',entree->>'reference','type',entree->>'type') order by entree->>'bucket',entree->>'reference'),'[]'::jsonb) into recus from jsonb_array_elements(p_fichiers) entree;
 if recus is distinct from attendus then raise exception 'La copie des sources est incomplète' using errcode='22023'; end if;
 for f in select value from jsonb_array_elements(p_fichiers) loop
   prefixe:=case when f->>'bucket'='visite-photos' then v.chantier_id::text||'/archives/'||v.id::text||'/' else v.chantier_id::text||'/visites/'||v.id::text||'/sources/' end||p_id::text||'/';
   if coalesce(f->>'sha256','') !~ '^[0-9a-f]{64}$' or coalesce(f->>'taille','') !~ '^[1-9][0-9]{0,8}$' or (f->>'taille')::bigint>52428800
    or coalesce(f->>'mime','') not in ('image/png','image/jpeg','application/pdf')
    or (f->>'type'='image' and f->>'mime'='application/pdf')
    or coalesce(f->>'chemin','') !~ ('^'||prefixe||'[0-9a-f-]{36}/'||(f->>'sha256')||'\.(png|jpg|pdf)$')
    or not exists(select 1 from storage.objects where bucket_id=f->>'bucket' and name=f->>'chemin') then raise exception 'Fichier archivé absent ou invalide' using errcode='22023'; end if;
 end loop;
 if p_mode='reprise_historique' then
   contenu:=jsonb_build_object('format','securionis-archive-v1','mode',p_mode,'source',source,'fichiers',p_fichiers,'auteur_id',p_auteur_id,'capture_le',clock_timestamp())::text;
   insert into public.visite_archives(id,visite_id,auteur_id,mode,contenu,sha256) values(p_id,v.id,acteur.id,p_mode,contenu,encode(sha256(convert_to(contenu,'UTF8')),'hex'));
 else
   insert into securionis_prive.preparations_archives(id,visite_id,auteur_id,empreinte,source,fichiers) values(p_id,v.id,acteur.id,p_empreinte,source,p_fichiers) on conflict(id) do nothing;
   if not exists(select 1 from securionis_prive.preparations_archives where id=p_id and visite_id=v.id and auteur_id=acteur.id and empreinte=p_empreinte) then raise exception 'Opération déjà utilisée' using errcode='40001'; end if;
 end if;
 return p_id;
end;
$$;
revoke all on function public.enregistrer_preparation_archive(uuid,uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.enregistrer_preparation_archive(uuid,uuid,uuid,text,jsonb,text) to service_role;
create or replace function public.cloturer_visite(p_visite_id uuid,p_empreinte text,p_ecarts jsonb,p_renseignements_par text,p_remarques_generales text,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.visites%rowtype; demande text; ids jsonb; attendus jsonb; item jsonb; constat record; preparation securionis_prive.preparations_archives%rowtype; source jsonb; contenu text;
begin
  v := public.verrouiller_visite_cloture(p_visite_id);
  if public.user_role() not in ('administrateur','inspecteur') then raise exception 'Validation réservée aux inspecteurs et administrateurs' using errcode='42501'; end if;
  if p_operation_id is null or p_empreinte is null or p_empreinte !~ '^[0-9a-f]{64}$'
    or p_ecarts is null or jsonb_typeof(p_ecarts)<>'array'
    or octet_length(p_ecarts::text)>1048576 or char_length(coalesce(p_renseignements_par,''))>1000 or char_length(coalesce(p_remarques_generales,''))>20000 then
    raise exception 'Paramètres de clôture invalides' using errcode='22023';
  end if;
  for item in select value from jsonb_array_elements(p_ecarts) loop
    if jsonb_typeof(item)<>'object' or (item->>'reponse_id') is null or (item->>'reponse_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or (item ? 'delai' and jsonb_typeof(item->'delai') not in ('string','null')) or char_length(coalesce(item->>'delai',''))>2000 then
      raise exception 'Délai ou réponse invalide' using errcode='22023';
    end if;
  end loop;
  demande := encode(sha256(convert_to(jsonb_build_object('empreinte',p_empreinte,'ecarts',p_ecarts,'renseignements_par',p_renseignements_par,'remarques_generales',p_remarques_generales)::text,'UTF8')),'hex');
  if v.statut='terminee' then
    if v.cloture_operation_id=p_operation_id and v.cloturee_par=auth.uid() and v.cloture_requete_sha256=demande then
      return jsonb_build_object('id',v.id,'statut',v.statut,'cloturee_le',v.cloturee_le,'deja_appliquee',true);
    end if;
    raise exception 'Cette visite a déjà été clôturée. Consultez son rapport.' using errcode='40001';
  end if;
  source:=securionis_prive.source_visite(v.id);
  if encode(sha256(convert_to(source::text,'UTF8')),'hex') is distinct from p_empreinte then
    raise exception 'Les constats ont changé. Reprenez la validation de la visite.' using errcode='40001';
  end if;
  select * into preparation from securionis_prive.preparations_archives where id=p_operation_id and visite_id=v.id and auteur_id=auth.uid() and empreinte=p_empreinte;
  if not found then raise exception 'Archive des sources requise. Rechargez l’application et reprenez la validation.' using errcode='22023'; end if;
  if not exists(select 1 from public.reponses where visite_id=v.id) then raise exception 'Une visite vide ne peut pas être validée' using errcode='22023'; end if;
  select coalesce(jsonb_agg(value->>'reponse_id' order by value->>'reponse_id'),'[]'::jsonb) into ids from jsonb_array_elements(p_ecarts);
  select coalesce(jsonb_agg(id::text order by id::text),'[]'::jsonb) into attendus from public.reponses where visite_id=v.id and valeur='non_conforme';
  if ids is distinct from attendus then raise exception 'La liste des non-conformités est incomplète ou contient des doublons' using errcode='22023'; end if;
  if exists(select 1 from public.ecarts e join public.reponses r on r.id=e.reponse_id where r.visite_id=v.id group by e.reponse_id having count(*)>1)
    or exists(select 1 from public.ecarts e join public.reponses r on r.id=e.reponse_id where r.visite_id=v.id and (e.chantier_id is distinct from v.chantier_id or r.valeur<>'non_conforme')) then
    raise exception 'Des non-conformités antérieures sont incohérentes. Faites vérifier cette visite avant validation.' using errcode='22023';
  end if;
  for constat in select r.id,coalesce(nullif(btrim(r.remarque),''),p.intitule,'Non-conformité') as description from public.reponses r join public.points_controle p on p.id=r.point_controle_id where r.visite_id=v.id and r.valeur='non_conforme' order by r.id loop
    select value into item from jsonb_array_elements(p_ecarts) where value->>'reponse_id'=constat.id::text;
    update public.ecarts set description=constat.description,delai=nullif(btrim(item->>'delai'),''),updated_at=clock_timestamp() where reponse_id=constat.id;
    if not found then
      insert into public.ecarts(chantier_id,reponse_id,description,delai,statut) values(v.chantier_id,constat.id,constat.description,nullif(btrim(item->>'delai'),''),'ouvert');
    end if;
  end loop;
  update public.visites set statut='terminee',renseignements_par=nullif(btrim(p_renseignements_par),''),remarques_generales=nullif(btrim(p_remarques_generales),''),cloturee_par=auth.uid(),cloturee_le=clock_timestamp(),cloture_operation_id=p_operation_id,cloture_requete_sha256=demande,updated_at=clock_timestamp() where id=v.id returning * into v;
  -- Les informations de contexte restent celles de l'instant comparé ; seuls les
  -- constats finalisés par cette transaction et la validation sont ajoutés.
  source:=jsonb_set(source,'{visite}',to_jsonb(v));
  source:=jsonb_set(source,'{ecarts}',coalesce((select jsonb_agg(e order by e->>'id') from (
    select e from jsonb_array_elements(source->'ecarts') e where not exists(select 1 from public.reponses r where r.visite_id=v.id and r.id::text=e->>'reponse_id')
    union all select to_jsonb(e.*) from public.ecarts e join public.reponses r on r.id=e.reponse_id where r.visite_id=v.id
  ) figes),'[]'::jsonb));
  contenu:=jsonb_build_object('format','securionis-archive-v1','mode','cloture','source',source,'fichiers',preparation.fichiers,'auteur_id',auth.uid(),'capture_le',v.cloturee_le)::text;
  insert into public.visite_archives(id,visite_id,auteur_id,mode,contenu,sha256) values(p_operation_id,v.id,auth.uid(),'cloture',contenu,encode(sha256(convert_to(contenu,'UTF8')),'hex'));
  return jsonb_build_object('id',v.id,'statut',v.statut,'cloturee_le',v.cloturee_le,'deja_appliquee',false);
end;
$$;
revoke all on function public.cloturer_visite(uuid,text,jsonb,text,text,uuid) from public,anon,service_role;
grant execute on function public.cloturer_visite(uuid,text,jsonb,text,text,uuid) to authenticated;

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
  if not exists(select 1 from public.visite_archives a where a.visite_id=p_visite_id and a.id::text=p_source->>'archiveId' and a.sha256=p_source->>'archiveSha256') then
    raise exception 'Archive des sources requise pour publier ce rapport' using errcode='22023';
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

-- Les octets des photos originales de visites terminées deviennent non
-- remplaçables. Les copies nouvelles restent privées et non modifiables.
create function public.photo_visite_modifiable(p_nom text)
returns boolean language sql stable security definer set search_path='' as $$
 select split_part(p_nom,'/',2)<>'archives' and not exists(
   select 1 from public.visites v join public.reponses r on r.visite_id=v.id
   cross join lateral unnest(r.photos) photo
   where v.statut='terminee' and public.dans_mon_entreprise('visites',v.id)
   and split_part(regexp_replace(photo,'^https://[^/]+/storage/v1/object/(public|sign)/visite-photos/',''),'?',1)=p_nom
 ) and not exists(select 1 from public.visites v where v.statut='terminee' and v.chantier_id::text=split_part(p_nom,'/',1) and v.id::text=split_part(p_nom,'/',2) and public.dans_mon_entreprise('visites',v.id));
$$;
revoke all on function public.photo_visite_modifiable(text) from public,anon,service_role;
grant execute on function public.photo_visite_modifiable(text) to authenticated;
create policy sources_photos_insert on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'visite-photos' or public.photo_visite_modifiable(name));
create policy sources_photos_update on storage.objects as restrictive for update to authenticated using(bucket_id<>'visite-photos' or public.photo_visite_modifiable(name)) with check(bucket_id<>'visite-photos' or public.photo_visite_modifiable(name));
create policy sources_photos_delete on storage.objects as restrictive for delete to authenticated using(bucket_id<>'visite-photos' or public.photo_visite_modifiable(name));
-- Les annexes réglementaires copiées ne deviennent pas lisibles par les invités.
create policy sources_documents_lecture on storage.objects as restrictive for select to authenticated
using(bucket_id<>'rapports' or name !~ '^[0-9a-f-]{36}/visites/[0-9a-f-]{36}/sources/' or public.user_role() in ('administrateur','inspecteur'));
notify pgrst,'reload schema';
commit;
