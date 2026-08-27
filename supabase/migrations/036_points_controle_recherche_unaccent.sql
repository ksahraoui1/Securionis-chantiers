-- 036 — Recherche full-text insensible aux accents sur les points de contrôle.
--
-- La colonne générée créée en 035 utilisait la configuration `french`, qui reste
-- sensible aux accents : « echa » ne remontait aucun résultat là où « écha » en
-- remontait 57. On ajoute une configuration `french_unaccent` (unaccent +
-- french_stem) et on régénère le vecteur de recherche avec.

create extension if not exists unaccent with schema extensions;

drop text search configuration if exists public.french_unaccent;

create text search configuration public.french_unaccent (copy = french);

alter text search configuration public.french_unaccent
  alter mapping for hword, hword_part, word
  with extensions.unaccent, french_stem;

alter table public.points_controle drop column if exists search_vector;

alter table public.points_controle
  add column search_vector tsvector generated always as (
    setweight(to_tsvector('public.french_unaccent'::regconfig, coalesce(intitule, '')), 'A') ||
    setweight(to_tsvector('public.french_unaccent'::regconfig, public.immutable_array_to_string(mots_cles)), 'A') ||
    setweight(to_tsvector('public.french_unaccent'::regconfig, coalesce(famille, '')), 'B') ||
    setweight(to_tsvector('public.french_unaccent'::regconfig, coalesce(critere, '')), 'C') ||
    setweight(to_tsvector('public.french_unaccent'::regconfig, coalesce(objet, '')), 'C') ||
    setweight(to_tsvector('public.french_unaccent'::regconfig, coalesce(base_legale, '')), 'C') ||
    setweight(to_tsvector('public.french_unaccent'::regconfig, coalesce(explications, '')), 'D')
  ) stored;

create index if not exists points_controle_search_vector_idx
  on public.points_controle using gin (search_vector);
