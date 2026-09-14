-- Clôture atomique : accès actuel, comparaison des constats et rejeu idempotent.
-- Aucun historique n'est réécrit et aucune ancienne visite n'est rouverte.
begin;
alter table public.visites add column if not exists cloturee_par uuid;
alter table public.visites add column if not exists cloturee_le timestamptz;
alter table public.visites add column if not exists cloture_operation_id uuid;
alter table public.visites add column if not exists cloture_requete_sha256 text;

create or replace function public.proteger_cloture_visite()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op = 'DELETE' then
    if old.statut = 'terminee' then raise exception 'Une visite terminée est conservée' using errcode='42501'; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.statut = 'terminee' and
    (to_jsonb(new) - array['rapport_url','email_envoye','updated_at']) is distinct from
    (to_jsonb(old) - array['rapport_url','email_envoye','updated_at']) then
    raise exception 'Les constats d’une visite terminée sont figés' using errcode='42501';
  end if;
  if tg_op = 'INSERT' and new.statut = 'terminee' then
    raise exception 'La visite doit être validée par la procédure de clôture' using errcode='42501';
  end if;
  -- SECURITY INVOKER : seul l'appel de la procédure contrôlée change de rôle.
  -- Aucun indicateur de session falsifiable par le client n'est utilisé.
  if current_user in ('authenticated','anon','service_role') then
    if (tg_op = 'UPDATE' and new.statut = 'terminee' and old.statut is distinct from 'terminee')
      or (tg_op = 'INSERT' and (new.cloturee_par is not null or new.cloturee_le is not null or new.cloture_operation_id is not null or new.cloture_requete_sha256 is not null))
      or (tg_op = 'UPDATE' and (new.cloturee_par is distinct from old.cloturee_par or new.cloturee_le is distinct from old.cloturee_le or new.cloture_operation_id is distinct from old.cloture_operation_id or new.cloture_requete_sha256 is distinct from old.cloture_requete_sha256)) then
      raise exception 'Utilisez la procédure de clôture' using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.proteger_cloture_visite() from public,anon,authenticated,service_role;
drop trigger if exists proteger_cloture_visite on public.visites;
create trigger proteger_cloture_visite before insert or update or delete on public.visites
for each row execute function public.proteger_cloture_visite();

create or replace function public.proteger_reponse_visite()
returns trigger language plpgsql security definer set search_path='' as $$
declare cible uuid; etat text;
begin
  if tg_op='UPDATE' and (new.id is distinct from old.id or new.visite_id is distinct from old.visite_id or new.point_controle_id is distinct from old.point_controle_id) then
    raise exception 'Le rattachement d’une réponse est immuable' using errcode='42501';
  end if;
  cible := case when tg_op='DELETE' then old.visite_id else new.visite_id end;
  -- Même verrou que la clôture : une écriture commencée en parallèle doit
  -- se terminer avant la comparaison ou être refusée après la clôture.
  select statut into etat from public.visites where id=cible for update;
  if not found then
    if tg_op='DELETE' then return old; end if; -- cascade d'un brouillon supprimé
    raise exception 'Visite inexistante' using errcode='23503';
  end if;
  if etat='terminee' then raise exception 'Les réponses de cette visite sont figées' using errcode='42501'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.proteger_reponse_visite() from public,anon,authenticated,service_role;
drop trigger if exists proteger_reponse_visite on public.reponses;
create trigger proteger_reponse_visite before insert or update or delete on public.reponses
for each row execute function public.proteger_reponse_visite();

create or replace function public.proteger_ecart_visite()
returns trigger language plpgsql security definer set search_path='' as $$
declare reponse uuid; cible uuid; v public.visites%rowtype; r public.reponses%rowtype;
begin
  if tg_op='UPDATE' and (new.id is distinct from old.id or new.reponse_id is distinct from old.reponse_id or new.chantier_id is distinct from old.chantier_id) then
    raise exception 'Le rattachement d’une non-conformité est immuable' using errcode='42501';
  end if;
  reponse := case when tg_op='DELETE' then old.reponse_id else new.reponse_id end;
  if reponse is null then
    if tg_op='DELETE' then return old; end if;
    return new; -- NC de plan, indépendante d'une visite
  end if;
  select visite_id into cible from public.reponses where id=reponse;
  select * into v from public.visites where id=cible for update;
  if not found then raise exception 'Réponse de visite inexistante' using errcode='23503'; end if;
  if v.statut='terminee' then
    if tg_op <> 'UPDATE' then raise exception 'Les constats de non-conformité sont figés' using errcode='42501'; end if;
    if (to_jsonb(new)-array['statut','updated_by','updated_at']) is distinct from (to_jsonb(old)-array['statut','updated_by','updated_at']) then
      raise exception 'Seul le suivi de correction peut évoluer après clôture' using errcode='42501';
    end if;
  end if;
  if tg_op='INSERT' then
    select * into r from public.reponses where id=reponse;
    if r.valeur <> 'non_conforme' or new.chantier_id is distinct from v.chantier_id then
      raise exception 'Non-conformité incompatible avec sa réponse' using errcode='22023';
    end if;
    if exists(select 1 from public.ecarts where reponse_id=reponse) then
      raise exception 'Une non-conformité existe déjà pour cette réponse' using errcode='23505';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.proteger_ecart_visite() from public,anon,authenticated,service_role;
drop trigger if exists proteger_ecart_visite on public.ecarts;
create trigger proteger_ecart_visite before insert or update or delete on public.ecarts
for each row execute function public.proteger_ecart_visite();

-- Helpers internes, non exposés aux clients par une permission EXECUTE.
create or replace function public.verrouiller_visite_cloture(p_visite_id uuid)
returns public.visites language plpgsql security definer set search_path='' as $$
declare v public.visites%rowtype; role_acteur text;
begin
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
revoke all on function public.verrouiller_visite_cloture(uuid) from public,anon,authenticated,service_role;

create or replace function public.empreinte_constats_visite(p_visite_id uuid)
returns text language sql set search_path='' as $$
  select encode(sha256(convert_to(jsonb_build_object(
    'visite',(select to_jsonb(v) from public.visites v where v.id=p_visite_id),
    'reponses',(select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('intitule',p.intitule) order by r.id),'[]'::jsonb) from public.reponses r join public.points_controle p on p.id=r.point_controle_id where r.visite_id=p_visite_id),
    'ecarts',(select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]'::jsonb) from public.ecarts e join public.reponses r on r.id=e.reponse_id where r.visite_id=p_visite_id)
  )::text,'UTF8')),'hex');
$$;
revoke all on function public.empreinte_constats_visite(uuid) from public,anon,authenticated,service_role;

create or replace function public.preparer_cloture_visite(p_visite_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.visites%rowtype; nc jsonb;
begin
  v := public.verrouiller_visite_cloture(p_visite_id);
  if v.statut='terminee' then raise exception 'Cette visite est déjà terminée' using errcode='22023'; end if;
  if not exists(select 1 from public.reponses where visite_id=v.id) then
    raise exception 'Renseignez au moins un point avant de valider la visite' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'description',coalesce(nullif(btrim(r.remarque),''),p.intitule,'Non-conformité'),'delai',(select e.delai from public.ecarts e where e.reponse_id=r.id order by e.id limit 1)) order by r.id),'[]'::jsonb)
    into nc from public.reponses r join public.points_controle p on p.id=r.point_controle_id where r.visite_id=v.id and r.valeur='non_conforme';
  return jsonb_build_object('empreinte',public.empreinte_constats_visite(v.id),'non_conformites',nc);
end;
$$;
revoke all on function public.preparer_cloture_visite(uuid) from public,anon,service_role;
grant execute on function public.preparer_cloture_visite(uuid) to authenticated;

create or replace function public.cloturer_visite(p_visite_id uuid,p_empreinte text,p_ecarts jsonb,p_renseignements_par text,p_remarques_generales text,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.visites%rowtype; demande text; ids jsonb; attendus jsonb; item jsonb; constat record;
begin
  v := public.verrouiller_visite_cloture(p_visite_id);
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
  if public.empreinte_constats_visite(v.id) is distinct from p_empreinte then
    raise exception 'Les constats ont changé. Reprenez la validation de la visite.' using errcode='40001';
  end if;
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
  return jsonb_build_object('id',v.id,'statut',v.statut,'cloturee_le',v.cloturee_le,'deja_appliquee',false);
end;
$$;
revoke all on function public.cloturer_visite(uuid,text,jsonb,text,text,uuid) from public,anon,service_role;
grant execute on function public.cloturer_visite(uuid,text,jsonb,text,text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
