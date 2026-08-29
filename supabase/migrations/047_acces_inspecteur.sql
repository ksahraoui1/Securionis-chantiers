-- 047 : FONC-01 — un inspecteur ne voyait aucun chantier
--
-- Tout l'accès non-administrateur passe par `chantier_inspecteurs` : **21
-- politiques sur 8 tables** en dépendent (chantiers, visites, ecarts,
-- documents, destinataires, comparaisons, comparaison_annotations,
-- comparaison_nc_links). Or la table était **vide**, et trois défauts
-- concouraient à ce qu'elle le reste :
--
--   1. Aucune politique `INSERT` n'existait pour un inspecteur sur
--      `chantier_inspecteurs` — seulement `ci_inspecteur_select` (lecture) et
--      `ci_admin_all`. L'auto-rattachement écrit dans `chantier-form.tsx` était
--      donc *systématiquement* refusé par la RLS.
--   2. Ce refus n'était pas vérifié : le résultat de l'insertion était ignoré.
--   3. La lecture des chantiers n'avait aucun repli.
--
-- Mesuré avant correction : 12 chantiers, **0 visible** pour le profil
-- `inspecteur` qui existe en production. L'application était inutilisable pour
-- le métier auquel elle est destinée. Le défaut est passé au travers de quatre
-- audits parce que les 12 chantiers et les 90 visites ont tous été créés par le
-- compte administrateur, pour qui `chantiers_admin_all` ouvre tout.

-- ---------------------------------------------------------------------------
-- 1. Le rattachement du créateur devient automatique.
-- ---------------------------------------------------------------------------
--
-- Un trigger plutôt que la politique `INSERT` esquissée dans l'audit :
--
--   • il ne dépend pas du client, donc il ne peut être ni oublié ni échouer
--     en silence — c'est exactement le défaut n° 2 ci-dessus ;
--   • il s'applique à tous les chemins de création, présents et futurs ;
--   • il alimente la table de liaison dont dépendent les 20 autres politiques
--     (visites, ecarts, documents, destinataires, comparaisons…).
--
-- `SECURITY DEFINER` : l'inspecteur n'a toujours pas le droit d'écrire dans la
-- table de liaison — c'est le trigger qui écrit pour lui, et uniquement pour
-- le chantier qu'il vient de créer. L'attribution d'un *autre* inspecteur
-- reste réservée à l'administrateur (`ci_admin_all`).

create or replace function public.chantier_rattacher_createur()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.created_by is null then
    return new;
  end if;

  insert into public.chantier_inspecteurs (chantier_id, inspecteur_id)
  values (new.id, new.created_by)
  on conflict (chantier_id, inspecteur_id) do nothing;

  return new;
end;
$$;

drop trigger if exists chantier_rattacher_createur on public.chantiers;

create trigger chantier_rattacher_createur
  after insert on public.chantiers
  for each row
  execute function public.chantier_rattacher_createur();

-- Le privilège EXECUTE vient du pseudo-rôle PUBLIC : le révoquer au seul rôle
-- `anon` serait sans effet (cf. migration 040). La fonction n'a aucun sens
-- hors du trigger, on la retire de l'API.
revoke execute on function public.chantier_rattacher_createur() from public;
grant execute on function public.chantier_rattacher_createur() to service_role;

-- ---------------------------------------------------------------------------
-- 2. Rattrapage des chantiers existants.
-- ---------------------------------------------------------------------------
--
-- Les 12 chantiers de production n'ont aucune ligne de liaison. Vérifié :
-- aucun n'a de `created_by` orphelin.

insert into public.chantier_inspecteurs (chantier_id, inspecteur_id)
select c.id, c.created_by
from public.chantiers c
where c.created_by is not null
on conflict (chantier_id, inspecteur_id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Lecture : la liaison, **ou** le fait d'avoir créé le chantier.
-- ---------------------------------------------------------------------------
--
-- ⚠️ Le repli `created_by` n'est pas un confort, il est **indispensable**, et
-- ce n'est pas ce que j'avais supposé au départ. Mesuré sur la production :
--
--   trigger AFTER  + `insert ... returning` → ECHEC (violation RLS)
--   trigger AFTER  sans returning            → OK
--   trigger BEFORE + `insert ... returning` → ECHEC (clé étrangère)
--
-- `INSERT ... RETURNING` évalue la politique **SELECT** sur la ligne insérée,
-- et cette évaluation a lieu **avant** que le trigger `AFTER` n'ait créé la
-- liaison. En `BEFORE`, la ligne du chantier n'existe pas encore, donc la clé
-- étrangère de la liaison est violée. Aucune position de trigger ne fonctionne
-- avec `RETURNING` — or `chantier-form.tsx` fait exactement
-- `.insert(...).select("id").single()` pour savoir où rediriger.
--
-- Le message d'erreur est trompeur : PostgreSQL dit « new row violates
-- row-level security policy », ce qui fait penser au `WITH CHECK` de la
-- politique d'insertion, alors que c'est la politique de **lecture** qui
-- refuse.
--
-- Conséquence assumée : un inspecteur retiré d'un chantier qu'il a créé
-- continue de le **voir**. Il ne peut plus le **modifier** (voir 4), ni agir
-- sur ses visites, écarts ou documents, dont les politiques ne connaissent que
-- la table de liaison. Retirer entièrement l'accès au créateur demanderait de
-- réaffecter `created_by`, que le trigger de la migration 045 interdit.

drop policy if exists chantiers_inspecteur_select on public.chantiers;

create policy chantiers_inspecteur_select on public.chantiers
  for select to authenticated
  using (
    created_by = (select auth.uid())
    or exists (
      select 1 from public.chantier_inspecteurs ci
      where ci.chantier_id = chantiers.id
        and ci.inspecteur_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Écriture : la liaison seule.
-- ---------------------------------------------------------------------------
--
-- La migration 045 ouvrait l'écriture au créateur *ou* à l'inspecteur
-- rattaché. Le rattachement étant désormais garanti dès la création, la clause
-- `created_by` n'apporte plus rien en écriture — et elle nuit : un
-- administrateur qui retire un inspecteur attend qu'il perde la main sur le
-- chantier.
--
-- Le modèle devient donc : **on voit ce qu'on a créé, on ne modifie que ce à
-- quoi on est rattaché.** En pratique les deux coïncident, le trigger
-- rattachant le créateur ; ils ne divergent que si un administrateur retire
-- délibérément quelqu'un.

drop policy if exists chantiers_inspecteur_update on public.chantiers;

create policy chantiers_inspecteur_update on public.chantiers
  for update to authenticated
  using (
    exists (
      select 1 from public.chantier_inspecteurs ci
      where ci.chantier_id = chantiers.id
        and ci.inspecteur_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.chantier_inspecteurs ci
      where ci.chantier_id = chantiers.id
        and ci.inspecteur_id = (select auth.uid())
    )
  );

-- `enforce_chantier_owner_immutability` (migration 045) reste en place : il
-- interdit toujours de réaffecter `created_by`.

-- ---------------------------------------------------------------------------
-- 5. `auth.uid()` sous sous-select, sur les politiques touchées ici.
-- ---------------------------------------------------------------------------
--
-- Sans le sous-select, la fonction est réévaluée à chaque ligne examinée
-- (avertissement Supabase `auth_rls_initplan`).
--
-- ⚠️ Les autres occurrences restent à traiter, sur d'autres tables. C'est une
-- correction purement de performance, sans effet à l'échelle actuelle (487
-- lignes sur la plus grosse table) : elle mérite son propre passage, avec
-- relevé avant/après, plutôt que d'être glissée dans un correctif d'accès.

drop policy if exists ci_inspecteur_select on public.chantier_inspecteurs;

create policy ci_inspecteur_select on public.chantier_inspecteurs
  for select to authenticated
  using (inspecteur_id = (select auth.uid()));
