-- Les refus ne peuvent pas faire déborder un compteur ; les entrées sont bornées.
begin;
create or replace function public.consommer_quota(p_cle text,p_max integer,p_fenetre_s integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare compteur_courant integer;
begin
 if coalesce(char_length(p_cle),0) not between 1 and 256 or p_max is null or p_max not between 1 and 100000 or p_fenetre_s is null or p_fenetre_s not between 1 and 86400 then
  raise exception 'Quota invalide' using errcode='22023';
 end if;
 insert into public.rate_limits as r(cle,compteur,fenetre_fin)
 values(p_cle,1,clock_timestamp()+make_interval(secs=>p_fenetre_s))
 on conflict(cle) do update set
 compteur=case when r.fenetre_fin<=clock_timestamp() then 1 else least(r.compteur::bigint+1,100001)::integer end,
 fenetre_fin=case when r.fenetre_fin<=clock_timestamp() then clock_timestamp()+make_interval(secs=>p_fenetre_s) else r.fenetre_fin end
 returning compteur into compteur_courant;
 if random()<0.01 then delete from public.rate_limits where fenetre_fin<clock_timestamp()-interval '1 day'; end if;
 return compteur_courant<=p_max;
end;
$$;
revoke all on function public.consommer_quota(text,integer,integer) from public,anon,authenticated;
grant execute on function public.consommer_quota(text,integer,integer) to service_role;
commit;
