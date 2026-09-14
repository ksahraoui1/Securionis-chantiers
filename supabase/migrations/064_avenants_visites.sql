-- Avenants explicites, numérotés et immuables ; jamais de réouverture de visite.
begin;
create table public.visite_avenants (
 id uuid primary key, visite_id uuid not null references public.visites(id),
 archive_id uuid not null references public.visite_archives(id), archive_sha256 text not null,
 numero integer not null check(numero>0), precedent_id uuid references public.visite_avenants(id),
 auteur_id uuid not null, auteur_nom text not null,
 objet text not null check(char_length(objet) between 5 and 200),
 motif text not null check(char_length(motif) between 5 and 1000),
 contenu text not null check(char_length(contenu) between 20 and 20000),
 rapport_reference text not null, storage_path text not null unique,
 sha256 text not null check(sha256~'^[0-9a-f]{64}$'),
 valide_le timestamptz not null, created_at timestamptz not null default clock_timestamp(),
 unique(visite_id,numero)
);
alter table public.visite_avenants enable row level security;
revoke all on public.visite_avenants from public,anon,authenticated,service_role;
grant select on public.visite_avenants to authenticated,service_role;
create policy lecture_visite on public.visite_avenants for select to authenticated using(exists(select 1 from public.visites v where v.id=visite_id));
create policy session_mfa_requise on public.visite_avenants as restrictive for all to authenticated using((select public.session_mfa_valide())) with check((select public.session_mfa_valide()));
create policy entreprise_requise on public.visite_avenants as restrictive for all to authenticated using(public.dans_mon_entreprise('visites',visite_id)) with check(public.dans_mon_entreprise('visites',visite_id));
create trigger avenant_immuable before update or delete on public.visite_avenants for each row execute function public.refuser_mutation_version_rapport();

create function public.preparer_avenant_visite(p_visite_id uuid,p_id uuid,p_archive_id uuid,p_rapport_reference text,p_precedent_id uuid,p_objet text,p_motif text,p_contenu text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.visites%rowtype; a public.visite_archives%rowtype; existant public.visite_avenants%rowtype; precedent public.visite_avenants%rowtype; nom_acteur text;
begin
 v:=public.verrouiller_visite_cloture(p_visite_id);
 if public.user_role() not in ('administrateur','inspecteur') then raise exception 'Validation réservée aux inspecteurs et administrateurs' using errcode='42501'; end if;
 if v.statut<>'terminee' then raise exception 'Visite terminée requise' using errcode='22023'; end if;
 if p_id is null or p_archive_id is null or p_rapport_reference is null or char_length(p_rapport_reference)>2048
   or coalesce(char_length(btrim(p_objet)),0) not between 5 and 200 or coalesce(char_length(btrim(p_motif)),0) not between 5 and 1000 or coalesce(char_length(btrim(p_contenu)),0) not between 20 and 20000 then raise exception 'Avenant incomplet ou trop volumineux' using errcode='22023'; end if;
 select * into existant from public.visite_avenants where id=p_id;
 if found then
  if existant.visite_id=v.id and existant.auteur_id=auth.uid() and existant.archive_id=p_archive_id and existant.rapport_reference=p_rapport_reference and existant.precedent_id is not distinct from p_precedent_id and existant.objet=btrim(p_objet) and existant.motif=btrim(p_motif) and existant.contenu=btrim(p_contenu) then return jsonb_build_object('existant',to_jsonb(existant)); end if;
  raise exception 'Cet identifiant d’avenant a déjà été utilisé' using errcode='40001';
 end if;
 select * into a from public.visite_archives where id=p_archive_id and visite_id=v.id;
 if not found then raise exception 'Archive des sources requise' using errcode='22023'; end if;
 if v.rapport_url is null or v.rapport_url is distinct from p_rapport_reference then raise exception 'Le rapport a changé. Rechargez avant de valider l’avenant.' using errcode='40001'; end if;
 select * into precedent from public.visite_avenants where visite_id=v.id order by numero desc limit 1;
 if precedent.id is distinct from p_precedent_id then raise exception 'Un avenant a été ajouté. Relisez l’historique avant de valider.' using errcode='40001'; end if;
 select nom into nom_acteur from public.profiles where id=auth.uid();
 return jsonb_build_object('id',p_id,'visite_id',v.id,'archive_id',a.id,'archive_sha256',a.sha256,'numero',coalesce(precedent.numero,0)+1,'precedent_id',precedent.id,
 'auteur_id',auth.uid(),'auteur_nom',nom_acteur,'objet',btrim(p_objet),'motif',btrim(p_motif),'contenu',btrim(p_contenu),'rapport_reference',p_rapport_reference,
 'valide_le',clock_timestamp(),'date_visite',v.date_visite,'chantier_adresse',a.contenu::jsonb->'source'->'chantier'->>'adresse','archive_mode',a.mode);
end;
$$;
revoke all on function public.preparer_avenant_visite(uuid,uuid,uuid,text,uuid,text,text,text) from public,anon,service_role;
grant execute on function public.preparer_avenant_visite(uuid,uuid,uuid,text,uuid,text,text,text) to authenticated;

create function public.publier_avenant_visite(p_plan jsonb,p_sha256 text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v public.visites%rowtype; a public.visite_archives%rowtype; acteur public.profiles%rowtype; precedent public.visite_avenants%rowtype; existant public.visite_avenants%rowtype; chemin text; id_avenant uuid; id_auteur uuid; valide timestamptz;
begin
 if p_plan is null or jsonb_typeof(p_plan)<>'object' or octet_length(p_plan::text)>100000 or coalesce(p_sha256,'') !~ '^[0-9a-f]{64}$' then raise exception 'Publication invalide' using errcode='22023'; end if;
 id_avenant:=(p_plan->>'id')::uuid; id_auteur:=(p_plan->>'auteur_id')::uuid;
 select * into v from public.visites where id=(p_plan->>'visite_id')::uuid for update;
 select * into acteur from public.profiles where id=id_auteur for share;
 if v.id is null or acteur.id is null or acteur.role not in ('administrateur','inspecteur') or acteur.entreprise_id is distinct from securionis_prive.entreprise_ligne('visites',v.id) then raise exception 'Accès refusé' using errcode='42501'; end if;
 if acteur.role<>'administrateur' then perform 1 from public.chantier_inspecteurs where chantier_id=v.chantier_id and inspecteur_id=acteur.id for share; if not found then raise exception 'Affectation actuelle requise' using errcode='42501'; end if; end if;
 select * into existant from public.visite_avenants where id=id_avenant;
 if found then
  if existant.visite_id=v.id and existant.auteur_id=acteur.id and existant.archive_id::text=p_plan->>'archive_id' and existant.rapport_reference=p_plan->>'rapport_reference' and existant.precedent_id::text is not distinct from p_plan->>'precedent_id' and existant.objet=p_plan->>'objet' and existant.motif=p_plan->>'motif' and existant.contenu=p_plan->>'contenu' then return existant.id; end if;
  raise exception 'Identifiant déjà utilisé' using errcode='40001';
 end if;
 if v.statut<>'terminee' or v.rapport_url is null or v.rapport_url is distinct from p_plan->>'rapport_reference' then raise exception 'Le rapport a changé' using errcode='40001'; end if;
 select * into a from public.visite_archives where id=(p_plan->>'archive_id')::uuid and visite_id=v.id;
 if not found or a.sha256 is distinct from p_plan->>'archive_sha256' or acteur.nom is distinct from p_plan->>'auteur_nom' then raise exception 'Les références de l’avenant ont changé' using errcode='40001'; end if;
 select * into precedent from public.visite_avenants where visite_id=v.id order by numero desc limit 1;
 if precedent.id::text is distinct from p_plan->>'precedent_id' or coalesce(precedent.numero,0)+1 is distinct from (p_plan->>'numero')::integer then raise exception 'Un avenant a été publié en parallèle' using errcode='40001'; end if;
 valide:=(p_plan->>'valide_le')::timestamptz;
 if valide is null or valide>clock_timestamp()+interval '1 minute' or valide<clock_timestamp()-interval '15 minutes' then raise exception 'Préparation expirée' using errcode='22023'; end if;
 chemin:=v.chantier_id::text||'/visites/'||v.id::text||'/avenants/'||id_avenant::text||'/'||p_sha256||'.pdf';
 if not exists(select 1 from storage.objects where bucket_id='rapports' and name=chemin) then raise exception 'PDF d’avenant absent' using errcode='22023'; end if;
 insert into public.visite_avenants(id,visite_id,archive_id,archive_sha256,numero,precedent_id,auteur_id,auteur_nom,objet,motif,contenu,rapport_reference,storage_path,sha256,valide_le)
 values(id_avenant,v.id,a.id,a.sha256,(p_plan->>'numero')::integer,precedent.id,acteur.id,acteur.nom,p_plan->>'objet',p_plan->>'motif',p_plan->>'contenu',v.rapport_url,chemin,p_sha256,valide);
 -- La trace et la publication réussissent ou échouent ensemble.
 insert into public.audit_logs(user_id,action,resource,resource_id,details) values(acteur.id,'publish_visite_avenant','visite',v.id,jsonb_build_object('avenant_id',id_avenant,'numero',(p_plan->>'numero')::integer,'archive_id',a.id,'sha256',p_sha256));
 update public.visites set email_envoye=false,updated_at=clock_timestamp() where id=v.id;
 return id_avenant;
end;
$$;
revoke all on function public.publier_avenant_visite(jsonb,text) from public,anon,authenticated;
grant execute on function public.publier_avenant_visite(jsonb,text) to service_role;
-- Marquer uniquement le dossier réellement envoyé, sous le verrou partagé
-- avec la publication d'avenant et la nouvelle édition de rapport.
create function public.confirmer_envoi_rapport(p_visite_id uuid,p_auteur_id uuid,p_rapport_reference text,p_dernier_avenant uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v public.visites%rowtype; acteur public.profiles%rowtype; dernier uuid;
begin
 select * into v from public.visites where id=p_visite_id for update;
 select * into acteur from public.profiles where id=p_auteur_id for share;
 if v.id is null or acteur.id is null or acteur.role not in ('administrateur','inspecteur') or acteur.entreprise_id is distinct from securionis_prive.entreprise_ligne('visites',v.id) then raise exception 'Accès refusé' using errcode='42501'; end if;
 if acteur.role<>'administrateur' then perform 1 from public.chantier_inspecteurs where chantier_id=v.chantier_id and inspecteur_id=acteur.id for share; if not found then raise exception 'Affectation actuelle requise' using errcode='42501'; end if; end if;
 select id into dernier from public.visite_avenants where visite_id=v.id order by numero desc limit 1;
 if v.statut<>'terminee' or v.rapport_url is distinct from p_rapport_reference or dernier is distinct from p_dernier_avenant then return false; end if;
 update public.visites set email_envoye=true,updated_at=clock_timestamp() where id=v.id;
 return true;
end;
$$;
revoke all on function public.confirmer_envoi_rapport(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.confirmer_envoi_rapport(uuid,uuid,text,uuid) to service_role;
notify pgrst,'reload schema';
commit;
