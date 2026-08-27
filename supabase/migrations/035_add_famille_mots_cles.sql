-- 035 — Familles + mots-clés + recherche full-text sur les points de contrôle
--
-- 1. Colonne `famille` : regroupe les 28 catégories existantes en 12 familles
--    métier, pour offrir un premier niveau de filtre sur /admin/points-controle.
-- 2. Colonne `mots_cles` (text[]) : mots-clés dérivés de l'intitulé, du thème et
--    de la catégorie, indexés pour la recherche.
-- 3. Colonne générée `search_vector` (tsvector français) + index GIN, utilisée
--    par la recherche full-text instantanée côté client.

-- ---------------------------------------------------------------------------
-- 1. Colonnes
-- ---------------------------------------------------------------------------

alter table public.points_controle
  add column if not exists famille text,
  add column if not exists mots_cles text[] not null default '{}';

alter table public.points_controle
  drop constraint if exists points_controle_famille_check;

alter table public.points_controle
  add constraint points_controle_famille_check check (
    famille is null or famille in (
      'Protections antichute',
      'Électricité & Énergies',
      'Engins & Levage',
      'Fouilles & Terrasse',
      'Démolition & Désamiantage',
      'EPI & Santé',
      'Accès & Circulation',
      'Produits & Incendie',
      'Structures & Toitures',
      'Machines & Outils',
      'Dispositions générales',
      'Autres'
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Recherche full-text
-- ---------------------------------------------------------------------------

-- array_to_string est déclarée STABLE : on l'enveloppe pour pouvoir l'utiliser
-- dans une colonne générée (le comportement est de fait immuable pour du text[]).
create or replace function public.immutable_array_to_string(arr text[])
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select coalesce(array_to_string(arr, ' '), '')
$$;

alter table public.points_controle
  drop column if exists search_vector;

alter table public.points_controle
  add column search_vector tsvector generated always as (
    setweight(to_tsvector('french'::regconfig, coalesce(intitule, '')), 'A') ||
    setweight(to_tsvector('french'::regconfig, public.immutable_array_to_string(mots_cles)), 'A') ||
    setweight(to_tsvector('french'::regconfig, coalesce(famille, '')), 'B') ||
    setweight(to_tsvector('french'::regconfig, coalesce(critere, '')), 'C') ||
    setweight(to_tsvector('french'::regconfig, coalesce(objet, '')), 'C') ||
    setweight(to_tsvector('french'::regconfig, coalesce(base_legale, '')), 'C') ||
    setweight(to_tsvector('french'::regconfig, coalesce(explications, '')), 'D')
  ) stored;

create index if not exists points_controle_search_vector_idx
  on public.points_controle using gin (search_vector);

create index if not exists points_controle_mots_cles_idx
  on public.points_controle using gin (mots_cles);

create index if not exists points_controle_famille_idx
  on public.points_controle (famille);

-- ---------------------------------------------------------------------------
-- 3. Migration des catégories existantes vers les 12 familles
-- ---------------------------------------------------------------------------

update public.points_controle p
set famille = m.famille
from (values
  ('Échafaudages',             'Protections antichute'),
  ('Échafaudages roulants',    'Protections antichute'),
  ('Filets & Retenue',         'Protections antichute'),
  ('Protections Chutes',       'Protections antichute'),
  ('Échelles',                 'Protections antichute'),
  ('Électricité',              'Électricité & Énergies'),
  ('Installations & Énergie',  'Électricité & Énergies'),
  ('Installations Thermiques', 'Électricité & Énergies'),
  ('Laser',                    'Électricité & Énergies'),
  ('Engins Chantier',          'Engins & Levage'),
  ('Grues & Levage',           'Engins & Levage'),
  ('Fouilles & Talus',         'Fouilles & Terrasse'),
  ('Roches & Gravier',         'Fouilles & Terrasse'),
  ('Souterrains',              'Fouilles & Terrasse'),
  ('Coffrages',                'Fouilles & Terrasse'),
  ('Démolition & Désamiantage','Démolition & Désamiantage'),
  ('Santé et EPI',             'EPI & Santé'),
  ('Milieu de travail',        'EPI & Santé'),
  ('Accès & Sols',             'Accès & Circulation'),
  ('Postes & Passages',        'Accès & Circulation'),
  ('Produits & Inflammables',  'Produits & Incendie'),
  ('Toitures',                 'Structures & Toitures'),
  ('Éléments Préfabriqués',    'Structures & Toitures'),
  ('Arbres',                   'Structures & Toitures'),
  ('Machines Electriques',     'Machines & Outils'),
  ('Machines portatives',      'Machines & Outils'),
  ('Dispositions générales',   'Dispositions générales'),
  ('Test',                     'Autres')
) as m(libelle, famille)
join public.categories c on c.libelle = m.libelle
where p.categorie_id = c.id;

-- Tout point non rattaché à une catégorie connue tombe dans « Autres ».
update public.points_controle
set famille = 'Autres'
where famille is null;

-- ---------------------------------------------------------------------------
-- 4. Génération des mots-clés
-- ---------------------------------------------------------------------------

with mots as (
  select p.id, array_agg(distinct x.mot order by x.mot) as kws
  from public.points_controle p
  left join public.categories c on c.id = p.categorie_id
  left join public.themes t on t.id = p.theme_id
  cross join lateral (
    select trim(w) as mot
    from regexp_split_to_table(
      lower(
        coalesce(p.intitule, '') || ' ' ||
        coalesce(t.libelle, '') || ' ' ||
        coalesce(c.libelle, '')
      ),
      '[^[:alnum:]]+'
    ) as w
    where length(trim(w)) >= 4
      and trim(w) <> all (array[
        'avec','dans','pour','sont','sans','sous','être','etre','doit','doivent',
        'peut','peuvent','plus','tout','tous','toute','toutes','cette','ces',
        'leur','leurs','elle','elles','autre','autres','ainsi','afin','alors',
        'lors','lorsque','selon','comme','entre','contre','chaque','quand',
        'aussi','très','tres','même','meme','celui','celle','dont','elles'
      ])
  ) x
  group by p.id
)
update public.points_controle p
set mots_cles = coalesce(m.kws, '{}')
from mots m
where m.id = p.id;
