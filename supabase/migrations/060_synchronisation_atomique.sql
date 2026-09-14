-- Comparaison atomique de la révision observée au début d'un envoi.
-- Cette étape ne remplace pas encore la version de départ d'une saisie hors ligne.
begin;
alter table public.reponses add column if not exists sync_revision uuid not null default gen_random_uuid();
alter table public.reponses add column if not exists sync_operation_id uuid;
alter table public.reponses add column if not exists sync_acteur uuid;
alter table public.reponses add column if not exists sync_requete_sha256 text;

-- SECURITY INVOKER : aucun drapeau de session ne permet de contourner la RPC.
create or replace function public.proteger_ecriture_reponse()
returns trigger language plpgsql set search_path='' as $$
begin
  if current_user in ('anon','authenticated','service_role') then
    raise exception 'Rechargez l’application : utilisez la synchronisation contrôlée' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; end if;
  if tg_op='UPDATE' and new.sync_operation_id is not distinct from old.sync_operation_id then
    new.sync_operation_id := null; new.sync_acteur := null; new.sync_requete_sha256 := null;
  end if;
  new.sync_revision := gen_random_uuid();
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function public.proteger_ecriture_reponse() from public,anon,authenticated,service_role;
drop trigger if exists proteger_ecriture_reponse on public.reponses;
create trigger proteger_ecriture_reponse before insert or update or delete on public.reponses
for each row execute function public.proteger_ecriture_reponse();

create or replace function public.synchroniser_reponse(
 p_visite_id uuid,p_point_controle_id uuid,p_revision_attendue uuid,p_operation_id uuid,
 p_valeur text,p_remarque text,p_photos text[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.visites%rowtype; r public.reponses%rowtype; demande text;
begin
  v := public.verrouiller_visite_cloture(p_visite_id);
  if v.statut='terminee' then raise exception 'Les réponses de cette visite sont figées' using errcode='42501'; end if;
  if p_operation_id is null or p_point_controle_id is null or p_valeur is null
    or p_valeur not in ('conforme','non_conforme','pas_necessaire','remarques')
    or char_length(coalesce(p_remarque,''))>20000 or p_photos is null
    or cardinality(p_photos)>10 or coalesce(array_ndims(p_photos),1)<>1
    or exists(select 1 from unnest(p_photos) as photo where photo is null or char_length(photo)>4096) then
    raise exception 'Réponse invalide' using errcode='22023';
  end if;
  perform 1 from public.points_controle where id=p_point_controle_id for share;
  if not found then raise exception 'Point de contrôle inexistant' using errcode='23503'; end if;
  demande := encode(sha256(convert_to(jsonb_build_object('visite',p_visite_id,'point',p_point_controle_id,'valeur',p_valeur,'remarque',p_remarque,'photos',p_photos)::text,'UTF8')),'hex');
  -- Le verrou de visite sérialise aussi deux INSERT sur une réponse absente.
  select * into r from public.reponses where visite_id=v.id and point_controle_id=p_point_controle_id for update;
  if found and r.sync_operation_id=p_operation_id then
    if r.sync_acteur is distinct from auth.uid() or r.sync_requete_sha256 is distinct from demande then
      raise exception 'Identifiant de synchronisation réutilisé avec un autre contenu' using errcode='22023';
    end if;
    return jsonb_build_object('id',r.id,'operation_id',p_operation_id,'revision',r.sync_revision,'deja_appliquee',true);
  end if;
  if r.sync_revision is distinct from p_revision_attendue then
    raise exception 'La réponse a changé pendant l’envoi. La saisie locale est conservée.' using errcode='40001';
  end if;
  if r.id is null then
    insert into public.reponses(visite_id,point_controle_id,valeur,remarque,photos,sync_operation_id,sync_acteur,sync_requete_sha256)
    values(v.id,p_point_controle_id,p_valeur,p_remarque,p_photos,p_operation_id,auth.uid(),demande) returning * into r;
  else
    update public.reponses set valeur=p_valeur,remarque=p_remarque,photos=p_photos,
      sync_operation_id=p_operation_id,sync_acteur=auth.uid(),sync_requete_sha256=demande where id=r.id returning * into r;
  end if;
  update public.visites set statut='en_cours',updated_at=clock_timestamp() where id=v.id and statut='brouillon';
  return jsonb_build_object('id',r.id,'operation_id',p_operation_id,'revision',r.sync_revision,'deja_appliquee',false);
end;
$$;
revoke all on function public.synchroniser_reponse(uuid,uuid,uuid,uuid,text,text,text[]) from public,anon,service_role;
grant execute on function public.synchroniser_reponse(uuid,uuid,uuid,uuid,text,text,text[]) to authenticated;
notify pgrst,'reload schema';
commit;
