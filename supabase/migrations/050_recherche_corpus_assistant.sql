-- 050 : recherche pondérée du corpus, pour l'assistant juridique
--
-- La recherche de la page d'administration joint les termes par **ET** : c'est
-- ce qu'on veut d'une barre de recherche, où l'utilisateur tape « garde corps »
-- et attend les points qui contiennent les deux mots.
--
-- L'assistant, lui, reçoit une **question en langue naturelle** — « Quelle est
-- la réglementation applicable aux garde-corps d'échafaudage ? ». Avec un ET,
-- il faudrait qu'un point de contrôle contienne aussi « réglementation » et
-- « applicable » : mesuré, la recherche ne rend alors **aucun point**, alors
-- que le corpus en contient plusieurs dizaines de pertinents.
--
-- Il faut donc un **OU**, et dès lors un classement : sans lui, « OU » rend
-- n'importe quel point contenant un mot courant. `ts_rank_cd` fait remonter
-- ceux qui couvrent le plus de termes, et les termes les plus rares.
--
-- `SECURITY INVOKER` : la fonction s'exécute avec les droits de l'appelant, donc
-- la RLS de `points_controle` s'applique normalement. Aucune élévation.

create or replace function public.rechercher_points_controle(
  p_termes  text[],
  p_limite  integer default 8
)
returns table (
  id           uuid,
  intitule     text,
  critere      text,
  base_legale  text,
  objet        text,
  explications text,
  categorie    text,
  theme        text,
  pertinence   real
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with requete as (
    -- Chaque terme en préfixe, joints par OU. Le tableau arrive déjà nettoyé
    -- par l'appelant (mots d'au moins deux caractères, sans ponctuation), ce
    -- qui neutralise les opérateurs de la syntaxe tsquery.
    select to_tsquery(
      'french_unaccent',
      array_to_string(
        array(select t || ':*' from unnest(p_termes) as t where length(t) >= 2),
        ' | '
      )
    ) as q
  )
  select
    p.id,
    p.intitule,
    p.critere,
    p.base_legale,
    p.objet,
    p.explications,
    c.libelle as categorie,
    t.libelle as theme,
    ts_rank_cd(p.search_vector, requete.q) as pertinence
  from public.points_controle p
  cross join requete
  left join public.categories c on c.id = p.categorie_id
  left join public.themes     t on t.id = p.theme_id
  where p.actif
    and requete.q is not null
    and p.search_vector @@ requete.q
  order by pertinence desc, p.intitule
  limit greatest(1, least(p_limite, 20));
$$;

-- Appelée depuis une route serveur avec le client de l'utilisateur : c'est
-- `authenticated` qui doit pouvoir l'exécuter, et la RLS fait le reste.
-- `anon` n'a rien à y faire.
revoke execute on function public.rechercher_points_controle(text[], integer) from public, anon;
grant  execute on function public.rechercher_points_controle(text[], integer) to authenticated, service_role;
