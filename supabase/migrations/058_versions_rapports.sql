begin;
create table if not exists public.rapport_versions (
  id uuid primary key default gen_random_uuid(),
  visite_id uuid not null references public.visites(id),
  storage_path text not null unique,
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  auteur_id uuid,
  auteur_nom text,
  motif text not null check (char_length(motif) between 1 and 1000),
  source jsonb,
  historique boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  check (historique or (sha256 is not null and auteur_id is not null and source is not null))
);
create index if not exists rapport_versions_visite_date on public.rapport_versions(visite_id,created_at desc);
alter table public.rapport_versions enable row level security;
revoke all on public.rapport_versions from anon, authenticated, service_role;
grant select on public.rapport_versions to authenticated, service_role;
drop policy if exists versions_lecture_visite on public.rapport_versions;
create policy versions_lecture_visite on public.rapport_versions for select to authenticated
using (exists (select 1 from public.visites v where v.id = visite_id));
drop policy if exists session_mfa_requise on public.rapport_versions;
create policy session_mfa_requise on public.rapport_versions as restrictive for all to authenticated
using ((select public.session_mfa_valide())) with check ((select public.session_mfa_valide()));

-- Conserver les anciennes références sans inventer d'empreinte ni de date
-- de génération : created_at indique ici la date de reprise de l'historique.
insert into public.rapport_versions(visite_id,storage_path,motif,historique)
select id, chemin, 'Rapport antérieur au suivi des versions', true from (
  select id,chantier_id,date_visite,
    split_part(regexp_replace(rapport_url, '^https://[^/]+/storage/v1/object/(public|sign)/rapports/', ''), '?', 1) as chemin
  from public.visites where rapport_url is not null
) r where chemin = chantier_id::text || '/rapport_' || to_char(date_visite,'YYYYMMDD') || '_' || left(id::text,8) || '.pdf'
  or chemin = chantier_id::text || '/visites/' || id::text || '/rapport.pdf'
on conflict (storage_path) do nothing;

create or replace function public.refuser_mutation_version_rapport()
returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'Une version de rapport conservée ne peut être modifiée ou supprimée' using errcode='42501'; end;
$$;
revoke all on function public.refuser_mutation_version_rapport() from public, anon, authenticated;
drop trigger if exists versions_immuables on public.rapport_versions;
create trigger versions_immuables before update or delete on public.rapport_versions
for each row execute function public.refuser_mutation_version_rapport();

-- Appel réservé au serveur après Auth + MFA ; vérifie à nouveau le rôle et
-- l'affectation, puis publie la référence et l'historique dans une transaction.
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
revoke all on function public.publier_version_rapport(uuid,uuid,uuid,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.publier_version_rapport(uuid,uuid,uuid,text,text,text,jsonb) to service_role;
commit;
