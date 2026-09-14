-- Suivi séparé du constat figé : aucun historique de visite n'est réécrit.
begin;
set local lock_timeout='5s';
alter table public.ecarts drop constraint ecarts_statut_check;
alter table public.ecarts add constraint ecarts_statut_check check(statut in ('ouvert','en_cours_correction','a_verifier','corrige'));
create table public.ecart_suivis (
 ecart_id uuid primary key references public.ecarts(id),
 revision integer not null check(revision>0),
 responsable text not null check(char_length(responsable) between 2 and 200),
 echeance date not null check(echeance between date '2000-01-01' and date '2100-12-31'),
 preuve text, updated_at timestamptz not null,
 check(preuve is null or char_length(preuve) between 20 and 5000)
);
create table public.ecart_evenements (
 id uuid primary key, ecart_id uuid not null references public.ecarts(id),
 revision integer not null, auteur_id uuid not null, auteur_nom text not null,
 action text not null check(action in ('planifier','soumettre','valider','reprendre')),
 statut_avant text not null, statut_apres text not null,
 responsable text not null, echeance date not null, commentaire text,
 demande jsonb not null, created_at timestamptz not null default clock_timestamp(),
 unique(ecart_id,revision)
);
create index ecart_suivis_echeance_idx on public.ecart_suivis(echeance);
alter table public.ecart_suivis enable row level security;
alter table public.ecart_evenements enable row level security;
revoke all on public.ecart_suivis,public.ecart_evenements from public,anon,authenticated,service_role;
grant select on public.ecart_suivis,public.ecart_evenements to authenticated,service_role;
create policy lecture_ecart on public.ecart_suivis for select to authenticated using((select public.session_mfa_valide()) and public.dans_mon_entreprise('ecarts',ecart_id) and exists(select 1 from public.ecarts e where e.id=ecart_id));
create policy lecture_ecart on public.ecart_evenements for select to authenticated using((select public.session_mfa_valide()) and public.dans_mon_entreprise('ecarts',ecart_id) and exists(select 1 from public.ecarts e where e.id=ecart_id));
create trigger historique_immuable before update or delete on public.ecart_evenements for each row execute function public.refuser_mutation_version_rapport();

-- Invoker indispensable : le navigateur ne peut fabriquer une transition,
-- même en appelant directement PostgREST. La RPC contrôlée change de rôle.
create function public.proteger_cycle_ecart() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user in ('anon','authenticated','service_role') and
 ((tg_op='INSERT' and new.statut<>'ouvert') or (tg_op='UPDATE' and new.statut is distinct from old.statut)) then
  raise exception 'Utilisez le cycle des actions correctives' using errcode='42501';
 end if;
 if tg_op='UPDATE' and exists(select 1 from public.ecart_suivis where ecart_id=old.id) and
 (to_jsonb(new)-array['statut','updated_by','updated_at']) is distinct from (to_jsonb(old)-array['statut','updated_by','updated_at']) then
  raise exception 'Le constat engagé dans un cycle de correction est figé' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function public.proteger_cycle_ecart() from public,anon,authenticated,service_role;
create trigger a_proteger_cycle_ecart before insert or update on public.ecarts for each row execute function public.proteger_cycle_ecart();

create function public.avancer_cycle_ecart(p_ecart_id uuid,p_operation_id uuid,p_revision integer,p_action text,p_responsable text,p_echeance date,p_commentaire text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.ecarts%rowtype; s public.ecart_suivis%rowtype; acteur public.profiles%rowtype;
 evenement public.ecart_evenements%rowtype; demande jsonb; suivant text; visite uuid;
begin
 if auth.uid() is null or not coalesce(public.session_mfa_valide(),false) then raise exception 'Session requise' using errcode='42501'; end if;
 select * into acteur from public.profiles where id=auth.uid() for share;
 if acteur.role is null or acteur.role not in ('administrateur','inspecteur') or not public.dans_mon_entreprise('ecarts',p_ecart_id) then raise exception 'Accès refusé' using errcode='42501'; end if;
 -- Ordre identique à la clôture et à la synchronisation : visite puis NC.
 select r.visite_id into visite from public.ecarts x join public.reponses r on r.id=x.reponse_id where x.id=p_ecart_id;
 if visite is not null then perform 1 from public.visites where id=visite for update; end if;
 select * into e from public.ecarts where id=p_ecart_id for update;
 if e.id is null then raise exception 'Accès refusé' using errcode='42501'; end if;
 if acteur.role<>'administrateur' then
  perform 1 from public.chantier_inspecteurs where chantier_id=e.chantier_id and inspecteur_id=acteur.id for share;
  if not found then raise exception 'Affectation actuelle requise' using errcode='42501'; end if;
 end if;
 if p_operation_id is null or p_revision is null or p_revision<0 or p_revision>=2147483647 or p_action is null or p_action not in ('planifier','soumettre','valider','reprendre') then raise exception 'Demande invalide' using errcode='22023'; end if;
 p_responsable:=btrim(p_responsable); p_commentaire:=nullif(btrim(p_commentaire),'');
 if coalesce(char_length(p_responsable),0) not between 2 and 200 or p_echeance is null or p_echeance not between date '2000-01-01' and date '2100-12-31' or coalesce(char_length(p_commentaire),0)>5000 then raise exception 'Responsable, échéance ou commentaire invalide' using errcode='22023'; end if;
 demande:=jsonb_build_object('revision',p_revision,'action',p_action,'responsable',p_responsable,'echeance',p_echeance,'commentaire',p_commentaire);
 select * into evenement from public.ecart_evenements where id=p_operation_id;
 if found then
  if evenement.ecart_id=e.id and evenement.auteur_id=acteur.id and evenement.demande=demande then return jsonb_build_object('operation_id',evenement.id,'revision',evenement.revision,'rejeu',true); end if;
  raise exception 'Identifiant déjà utilisé' using errcode='40001';
 end if;
 select * into s from public.ecart_suivis where ecart_id=e.id;
 if coalesce(s.revision,0)<>p_revision then raise exception 'Le suivi a changé. Relisez son état avant de continuer.' using errcode='40001'; end if;
 suivant:=e.statut;
 case p_action
 when 'planifier' then
  if e.statut not in ('ouvert','en_cours_correction') or p_commentaire is not null then raise exception 'Planification indisponible' using errcode='22023'; end if;
  suivant:='en_cours_correction';
 when 'soumettre' then
  if e.statut<>'en_cours_correction' or coalesce(char_length(p_commentaire),0)<20 then raise exception 'Une preuve écrite de 20 caractères minimum est requise' using errcode='22023'; end if;
  suivant:='a_verifier';
 when 'valider' then
  if e.statut<>'a_verifier' or coalesce(char_length(p_commentaire),0)<10 then raise exception 'Une conclusion de vérification est requise' using errcode='22023'; end if;
  suivant:='corrige';
 when 'reprendre' then
  if e.statut<>'a_verifier' or coalesce(char_length(p_commentaire),0)<10 then raise exception 'Un motif de reprise est requis' using errcode='22023'; end if;
  suivant:='en_cours_correction';
 end case;
 if p_action<>'planifier' and (s.responsable is distinct from p_responsable or s.echeance is distinct from p_echeance) then raise exception 'Relisez la planification avant de continuer' using errcode='40001'; end if;
 insert into public.ecart_suivis(ecart_id,revision,responsable,echeance,preuve,updated_at)
 values(e.id,p_revision+1,p_responsable,p_echeance,case when p_action='soumettre' then p_commentaire else s.preuve end,clock_timestamp())
 on conflict(ecart_id) do update set revision=excluded.revision,responsable=excluded.responsable,echeance=excluded.echeance,preuve=excluded.preuve,updated_at=excluded.updated_at;
 update public.ecarts set statut=suivant,updated_by=acteur.id,updated_at=clock_timestamp() where id=e.id;
 insert into public.ecart_evenements(id,ecart_id,revision,auteur_id,auteur_nom,action,statut_avant,statut_apres,responsable,echeance,commentaire,demande)
 values(p_operation_id,e.id,p_revision+1,acteur.id,coalesce(acteur.nom,'Utilisateur'),p_action,e.statut,suivant,p_responsable,p_echeance,p_commentaire,demande);
 insert into public.audit_logs(user_id,entreprise_id,action,resource,resource_id,details)
 values(acteur.id,acteur.entreprise_id,'advance_ecart_cycle','ecart',e.id,jsonb_build_object('operation_id',p_operation_id,'revision',p_revision+1,'action',p_action,'statut_avant',e.statut,'statut_apres',suivant));
 return jsonb_build_object('operation_id',p_operation_id,'revision',p_revision+1,'rejeu',false);
end $$;
revoke all on function public.avancer_cycle_ecart(uuid,uuid,integer,text,text,date,text) from public,anon,service_role;
grant execute on function public.avancer_cycle_ecart(uuid,uuid,integer,text,text,date,text) to authenticated;
commit;
