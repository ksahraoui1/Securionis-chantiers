-- 068 — Création d'un point de contrôle depuis le terrain.
--
-- L'insertion directe dans points_controle reste réservée à l'administrateur
-- (pc_insert_admin). Un inspecteur crée un point uniquement par cette procédure,
-- qui revérifie rôle, MFA et entreprise, range le point dans le thème
-- « Ajouts terrain » de la catégorie choisie (créé au besoin), enregistre son
-- auteur et journalise la création dans la même transaction.
--
-- Rejeu : p_id est l'identifiant du point, choisi par le client et conservé
-- après une réponse incertaine. Le même auteur, le même intitulé et la même
-- catégorie rendent le point déjà créé ; toute autre réutilisation est refusée.

create function public.creer_point_controle_terrain(
 p_id uuid, p_categorie_id uuid, p_intitule text, p_base_legale text, p_mots_cles text[]
) returns uuid language plpgsql security definer set search_path='' as $$
declare acteur public.profiles%rowtype; cat public.categories%rowtype; existant public.points_controle%rowtype;
 theme uuid; intitule text; base text; mots text[];
begin
 if auth.uid() is null or not coalesce(public.session_mfa_valide(),false) then raise exception 'Session requise' using errcode='42501'; end if;
 select * into acteur from public.profiles where id=auth.uid() for share;
 if acteur.role is null or acteur.role not in ('administrateur','inspecteur') or acteur.entreprise_id is null then raise exception 'Accès refusé' using errcode='42501'; end if;

 intitule:=btrim(regexp_replace(coalesce(p_intitule,''),'\s+',' ','g'));
 base:=nullif(btrim(coalesce(p_base_legale,'')),'');
 if p_id is null or char_length(intitule) not between 5 and 500 or coalesce(char_length(base),0)>300 then raise exception 'Intitulé ou base légale invalide' using errcode='22023'; end if;
 select coalesce(array_agg(distinct m order by m),'{}') into mots
  from unnest(coalesce(p_mots_cles,'{}')) m where char_length(m) between 1 and 60;
 if cardinality(coalesce(p_mots_cles,'{}'))>60 then raise exception 'Trop de mots-clés' using errcode='22023'; end if;

 select * into cat from public.categories where id=p_categorie_id and actif and entreprise_id=acteur.entreprise_id;
 if cat.id is null then raise exception 'Catégorie inconnue' using errcode='42501'; end if;

 select * into existant from public.points_controle where id=p_id;
 if found then
  if existant.created_by=acteur.id and existant.intitule=intitule and existant.categorie_id=cat.id then return existant.id; end if;
  raise exception 'Identifiant déjà utilisé' using errcode='40001';
 end if;

 if not public.consommer_quota('point-terrain:'||acteur.id::text,50,86400) then
  raise exception 'Trop de points créés aujourd’hui' using errcode='53400';
 end if;

 -- Un seul thème « Ajouts terrain » par catégorie, même sous création concurrente.
 perform pg_advisory_xact_lock(hashtextextended('theme-terrain:'||cat.id::text,0));
 select id into theme from public.themes where categorie_id=cat.id and libelle='Ajouts terrain' and entreprise_id=acteur.entreprise_id order by created_at limit 1;
 if theme is null then
  insert into public.themes(categorie_id,libelle,actif,entreprise_id) values (cat.id,'Ajouts terrain',true,acteur.entreprise_id) returning id into theme;
 end if;

 insert into public.points_controle(id,categorie_id,theme_id,intitule,base_legale,is_custom,actif,created_by,mots_cles,entreprise_id)
 values (p_id,cat.id,theme,intitule,base,true,true,acteur.id,mots,acteur.entreprise_id);

 insert into public.audit_logs(user_id,action,resource,resource_id,details)
 values (acteur.id,'create_point_controle_terrain','points_controle',p_id,
  jsonb_build_object('categorie_id',cat.id,'theme_id',theme,'intitule',intitule));
 return p_id;
end $$;

revoke all on function public.creer_point_controle_terrain(uuid,uuid,text,text,text[]) from public,anon,authenticated,service_role;
grant execute on function public.creer_point_controle_terrain(uuid,uuid,text,text,text[]) to authenticated;
