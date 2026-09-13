-- Références de rapports réservées au serveur ; suppression atomique autorisée.
begin;
create or replace function public.proteger_reference_rapport_visite()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.rapport_url is not null then
        raise exception 'La référence du rapport est gérée par le serveur' using errcode = '42501';
      end if;
    elsif new.rapport_url is distinct from old.rapport_url
       or new.chantier_id is distinct from old.chantier_id
       or new.id is distinct from old.id then
      raise exception 'La référence et le rattachement de la visite sont protégés' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.proteger_reference_rapport_visite() from public, anon, authenticated;
drop trigger if exists proteger_reference_rapport_visite on public.visites;
create trigger proteger_reference_rapport_visite before insert or update on public.visites
  for each row execute function public.proteger_reference_rapport_visite();

create or replace function public.supprimer_visite_brouillon(p_visite_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v public.visites%rowtype;
  nb integer;
begin
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
revoke all on function public.supprimer_visite_brouillon(uuid) from public, anon, service_role;
grant execute on function public.supprimer_visite_brouillon(uuid) to authenticated;
commit;
