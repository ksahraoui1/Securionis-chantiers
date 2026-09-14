-- Preuves privées, rattachées atomiquement à une soumission du cycle.
begin;
set local lock_timeout='5s';
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('ecart-preuves','ecart-preuves',false,5242880,array['image/jpeg','image/png','application/pdf']);
-- Le téléchargement passe par l’API autorisée, avec vérification du hash.
create policy preuves_api_seulement on storage.objects as restrictive for all to anon,authenticated
using(bucket_id<>'ecart-preuves') with check(bucket_id<>'ecart-preuves');
create table public.ecart_pieces (
 id uuid primary key, ecart_id uuid not null references public.ecarts(id),
 auteur_id uuid not null, revision_preparation integer not null check(revision_preparation>0),
 nom text not null check(char_length(nom) between 1 and 180),
 mime text not null check(mime in ('image/jpeg','image/png','application/pdf')),
 taille integer not null check(taille between 1 and 5242880),
 sha256 text not null check(sha256~'^[0-9a-f]{64}$'), storage_path text not null unique,
 evenement_id uuid references public.ecart_evenements(id), created_at timestamptz not null default clock_timestamp()
);
create index ecart_pieces_evenement_idx on public.ecart_pieces(evenement_id);
create index ecart_pieces_ecart_idx on public.ecart_pieces(ecart_id);
alter table public.ecart_pieces enable row level security;
revoke all on public.ecart_pieces from public,anon,authenticated,service_role;
grant select on public.ecart_pieces to authenticated,service_role;
create policy lecture_piece on public.ecart_pieces for select to authenticated
using((select public.session_mfa_valide()) and public.dans_mon_entreprise('ecarts',ecart_id)
 and exists(select 1 from public.ecarts e where e.id=ecart_id)
 and (evenement_id is not null or auteur_id=(select auth.uid())));
create function public.proteger_piece_ecart() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='DELETE' or current_user in ('anon','authenticated','service_role') or old.evenement_id is not null
 or new.evenement_id is null or (to_jsonb(new)-'evenement_id') is distinct from (to_jsonb(old)-'evenement_id') then
 raise exception 'La pièce de preuve est immuable' using errcode='42501'; end if;
 return new;
end $$;
revoke all on function public.proteger_piece_ecart() from public,anon,authenticated,service_role;
create trigger piece_immuable before update or delete on public.ecart_pieces for each row execute function public.proteger_piece_ecart();
alter table public.ecart_suivis add column soumission_id uuid references public.ecart_evenements(id);
update public.ecart_suivis s set soumission_id=(select id from public.ecart_evenements e where e.ecart_id=s.ecart_id and e.action='soumettre' order by revision desc limit 1);

create function public.enregistrer_piece_ecart(p_id uuid,p_ecart_id uuid,p_acteur uuid,p_revision integer,p_nom text,p_mime text,p_taille integer,p_sha256 text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.ecarts%rowtype; acteur public.profiles%rowtype; piece public.ecart_pieces%rowtype; revision integer; chemin text; ext text; visite uuid;
begin
 select * into acteur from public.profiles where id=p_acteur for share;
 if acteur.id is null or acteur.role not in ('administrateur','inspecteur') or acteur.entreprise_id is distinct from securionis_prive.entreprise_ligne('ecarts',p_ecart_id) then raise exception 'Accès refusé' using errcode='42501'; end if;
 select r.visite_id into visite from public.ecarts x join public.reponses r on r.id=x.reponse_id where x.id=p_ecart_id;
 if visite is not null then perform 1 from public.visites where id=visite for update; end if;
 select * into e from public.ecarts where id=p_ecart_id for update;
 if e.id is null then raise exception 'Accès refusé' using errcode='42501'; end if;
 if acteur.role<>'administrateur' then perform 1 from public.chantier_inspecteurs where chantier_id=e.chantier_id and inspecteur_id=acteur.id for share; if not found then raise exception 'Affectation requise' using errcode='42501'; end if; end if;
 if p_id is null or p_revision is null or p_revision<1 or p_nom is null or char_length(p_nom) not between 1 and 180 or p_nom~'[[:cntrl:]/\\]' or p_taille is null or p_taille not between 1 and 5242880 or coalesce(p_sha256,'')!~'^[0-9a-f]{64}$' or p_mime is null or p_mime not in ('image/jpeg','image/png','application/pdf') then raise exception 'Pièce invalide' using errcode='22023'; end if;
 ext:=case p_mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' else 'pdf' end;
 chemin:=acteur.entreprise_id::text||'/'||e.id::text||'/'||p_id::text||'/'||p_sha256||'.'||ext;
 select * into piece from public.ecart_pieces where id=p_id;
 if found then
  if piece.ecart_id=e.id and piece.auteur_id=acteur.id and piece.revision_preparation=p_revision and piece.nom=p_nom and piece.mime=p_mime and piece.taille=p_taille and piece.sha256=p_sha256 and piece.storage_path=chemin then return to_jsonb(piece); end if;
  raise exception 'Identifiant déjà utilisé' using errcode='40001';
 end if;
 select s.revision into revision from public.ecart_suivis s where s.ecart_id=e.id;
 if e.statut<>'en_cours_correction' or revision is distinct from p_revision then raise exception 'Le suivi a changé' using errcode='40001'; end if;
 if not exists(select 1 from storage.objects where bucket_id='ecart-preuves' and name=chemin) then raise exception 'Fichier absent' using errcode='22023'; end if;
 insert into public.ecart_pieces(id,ecart_id,auteur_id,revision_preparation,nom,mime,taille,sha256,storage_path)
 values(p_id,e.id,acteur.id,p_revision,p_nom,p_mime,p_taille,p_sha256,chemin) returning * into piece;
 return to_jsonb(piece);
end $$;
revoke all on function public.enregistrer_piece_ecart(uuid,uuid,uuid,integer,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.enregistrer_piece_ecart(uuid,uuid,uuid,integer,text,text,integer,text) to service_role;

create function public.avancer_cycle_ecart_v2(p_ecart_id uuid,p_operation_id uuid,p_revision integer,p_action text,p_responsable text,p_echeance date,p_commentaire text,p_pieces uuid[])
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
 if p_pieces is null or cardinality(p_pieces)>5 or array_position(p_pieces,null) is not null then raise exception 'Sélection de pièces invalide' using errcode='22023'; end if;
 select coalesce(array_agg(x order by x),'{}'::uuid[]) into p_pieces from unnest(p_pieces) x;
 demande:=jsonb_build_object('revision',p_revision,'action',p_action,'responsable',p_responsable,'echeance',p_echeance,'commentaire',p_commentaire)||case when cardinality(p_pieces)=0 then '{}'::jsonb else jsonb_build_object('pieces',p_pieces) end;
 select * into evenement from public.ecart_evenements where id=p_operation_id;
 if found then
  if evenement.ecart_id=e.id and evenement.auteur_id=acteur.id and evenement.demande=demande then return jsonb_build_object('operation_id',evenement.id,'revision',evenement.revision,'rejeu',true); end if;
  raise exception 'Identifiant déjà utilisé' using errcode='40001';
 end if;
 select * into s from public.ecart_suivis where ecart_id=e.id;
 if coalesce(s.revision,0)<>p_revision then raise exception 'Le suivi a changé. Relisez son état avant de continuer.' using errcode='40001'; end if;
 if p_pieces is null or cardinality(p_pieces)>5 or array_position(p_pieces,null) is not null or cardinality(p_pieces)<>(select count(distinct id) from unnest(p_pieces) id) or (p_action<>'soumettre' and cardinality(p_pieces)>0) then raise exception 'Sélection de pièces invalide' using errcode='22023'; end if;
 if cardinality(p_pieces)>0 then
  perform 1 from public.ecart_pieces where id=any(p_pieces) order by id for update;
  if (select count(*) from public.ecart_pieces where id=any(p_pieces) and ecart_id=e.id and auteur_id=acteur.id and revision_preparation=p_revision and evenement_id is null)<>cardinality(p_pieces) then raise exception 'Une pièce ne correspond plus à cette soumission' using errcode='40001'; end if;
 end if;
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
 update public.ecart_pieces set evenement_id=p_operation_id where id=any(p_pieces);
 if p_action='soumettre' then update public.ecart_suivis set soumission_id=p_operation_id where ecart_id=e.id; end if;
 insert into public.audit_logs(user_id,entreprise_id,action,resource,resource_id,details)
 values(acteur.id,acteur.entreprise_id,'advance_ecart_cycle','ecart',e.id,jsonb_build_object('operation_id',p_operation_id,'revision',p_revision+1,'action',p_action,'statut_avant',e.statut,'statut_apres',suivant));
 return jsonb_build_object('operation_id',p_operation_id,'revision',p_revision+1,'rejeu',false);
end $$;
revoke all on function public.avancer_cycle_ecart_v2(uuid,uuid,integer,text,text,date,text,uuid[]) from public,anon,service_role;
grant execute on function public.avancer_cycle_ecart_v2(uuid,uuid,integer,text,text,date,text,uuid[]) to authenticated;
-- Compatibilité des demandes textuelles et de leurs UUID déjà enregistrés.
create or replace function public.avancer_cycle_ecart(p_ecart_id uuid,p_operation_id uuid,p_revision integer,p_action text,p_responsable text,p_echeance date,p_commentaire text)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if p_action in ('valider','reprendre') and exists(select 1 from public.ecart_suivis s join public.ecart_pieces p on p.evenement_id=s.soumission_id where s.ecart_id=p_ecart_id) then
  raise exception 'Rechargez une interface qui affiche les pièces de preuve' using errcode='22023';
 end if;
 return public.avancer_cycle_ecart_v2(p_ecart_id,p_operation_id,p_revision,p_action,p_responsable,p_echeance,p_commentaire,'{}'::uuid[]);
end $$;
revoke all on function public.avancer_cycle_ecart(uuid,uuid,integer,text,text,date,text) from public,anon,service_role;
grant execute on function public.avancer_cycle_ecart(uuid,uuid,integer,text,text,date,text) to authenticated;
commit;
