-- 052 : INT-02 (audit du 3 septembre 2026) — les réponses suivent la règle
-- d'accès des visites
--
-- Trois tables décrivaient trois périmètres différents pour la même chose :
--
--   visites   lecture : inspecteur de la visite **ou** rattaché au chantier
--             écriture : inspecteur de la visite seulement
--   reponses  lecture et écriture : inspecteur de la visite seulement
--   ecarts    lecture et écriture : rattaché au chantier seulement
--
-- Un second inspecteur rattaché au même chantier voyait donc la visite d'un
-- collègue, mais **aucune de ses réponses** : page rapport vide, PDF vide,
-- et l'envoi par email réussissait sans jamais marquer la visite
-- (`email_envoye`), l'`UPDATE` ne touchant aucune ligne sans lever d'erreur
-- (piège n° 43). Invisible en production parce qu'un seul compte a tout créé.
--
-- Modèle retenu, le même que celui de la 047 pour les chantiers :
-- **on voit ce à quoi on est rattaché ou ce qu'on a fait soi-même, on ne
-- modifie que ce à quoi on est rattaché.** Un inspecteur retiré d'un chantier
-- par l'administrateur garde la lecture de ses propres visites et perd
-- l'écriture — sur la visite, ses réponses et ses écarts, désormais d'un
-- seul tenant.
--
-- `canAccessVisite()` (`src/lib/utils/security.ts`) appliquait déjà cette
-- règle côté API ; la base la contredisait.

-- ---------------------------------------------------------------------------
-- 1. visites : l'écriture suit le rattachement.
-- ---------------------------------------------------------------------------

drop policy if exists visites_inspecteur_update on public.visites;

create policy visites_inspecteur_update on public.visites
  for update to authenticated
  using (
    exists (
      select 1 from public.chantier_inspecteurs ci
      where ci.chantier_id = visites.chantier_id
        and ci.inspecteur_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.chantier_inspecteurs ci
      where ci.chantier_id = visites.chantier_id
        and ci.inspecteur_id = (select auth.uid())
    )
  );

-- `visites_inspecteur_select` (inspecteur **ou** rattaché) et
-- `visites_inspecteur_insert` (inspecteur **et** rattaché) sont inchangées.
-- Aucune politique DELETE pour l'inspecteur : la suppression d'une visite
-- passe par la route serveur, qui vérifie le statut et nettoie le stockage.

-- ---------------------------------------------------------------------------
-- 2. reponses : même périmètre que la visite qui les porte.
-- ---------------------------------------------------------------------------
--
-- Le sous-select sur `visites` est lui-même soumis à la RLS de `visites`,
-- donc à `visites_inspecteur_select` : les deux règles ne peuvent pas
-- diverger.

drop policy if exists reponses_inspecteur_select on public.reponses;
drop policy if exists reponses_inspecteur_insert on public.reponses;
drop policy if exists reponses_inspecteur_update on public.reponses;

create policy reponses_inspecteur_select on public.reponses
  for select to authenticated
  using (
    exists (
      select 1 from public.visites v
      where v.id = reponses.visite_id
        and (
          v.inspecteur_id = (select auth.uid())
          or exists (
            select 1 from public.chantier_inspecteurs ci
            where ci.chantier_id = v.chantier_id
              and ci.inspecteur_id = (select auth.uid())
          )
        )
    )
  );

create policy reponses_inspecteur_insert on public.reponses
  for insert to authenticated
  with check (
    exists (
      select 1 from public.visites v
      join public.chantier_inspecteurs ci on ci.chantier_id = v.chantier_id
      where v.id = reponses.visite_id
        and ci.inspecteur_id = (select auth.uid())
    )
  );

create policy reponses_inspecteur_update on public.reponses
  for update to authenticated
  using (
    exists (
      select 1 from public.visites v
      join public.chantier_inspecteurs ci on ci.chantier_id = v.chantier_id
      where v.id = reponses.visite_id
        and ci.inspecteur_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.visites v
      join public.chantier_inspecteurs ci on ci.chantier_id = v.chantier_id
      where v.id = reponses.visite_id
        and ci.inspecteur_id = (select auth.uid())
    )
  );

-- `reponses_admin_all` et `visites_admin_all` restent en place.

-- ---------------------------------------------------------------------------
-- Vérification (transaction annulée, jouée avant application) : un inspecteur
-- rattaché à un chantier qu'il n'a pas créé lit les visites et les réponses
-- de ce chantier, y écrit une réponse, marque `email_envoye` ; le même
-- inspecteur, non rattaché, lit ses propres visites et 0 réponse d'autrui,
-- et ses écritures touchent 0 ligne ; l'administrateur voit tout.
-- Aucune donnée n'est modifiée par cette migration.
-- ---------------------------------------------------------------------------
