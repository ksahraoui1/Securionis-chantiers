-- 048 : SEC-03 — les buckets ne sont plus lisibles par le monde entier
--
-- `rapports` (241 objets, 258 Mo) et `visite-photos` (120 objets, 115 Mo)
-- étaient `public = true` : n'importe qui connaissant une URL pouvait
-- télécharger un rapport d'inspection ou une photo de chantier — donc, en
-- pratique, des personnes au travail identifiables, associées à un employeur,
-- une date, un lieu et un constat de non-conformité.
--
-- Le risque était atténué par des chemins en UUID et l'absence de politique
-- `anon` (donc pas d'énumération), mais il n'y avait aucun contrôle d'accès :
-- une URL ayant fuité restait valable indéfiniment.
--
-- ⚠️ **Cette migration doit être appliquée APRÈS le déploiement du code.**
-- Les URL stockées en base sont de la forme publique ; c'est le code qui les
-- retraduit en URL signées à la lecture (`src/lib/utils/url-signee.ts`). Sur
-- l'ancien code, tout affichage d'image ou de document casserait.
--
-- Deux constats ont simplifié le chantier par rapport à ce qu'annonçait
-- l'audit :
--
--   • **Aucun email ne contient d'URL de stockage.** Les rapports et les
--     documents partent en pièce jointe, et le seul lien présent pointe vers
--     l'application. Rien ne casse rétroactivement pour les destinataires.
--   • **Le logo n'est utilisé dans aucun email**, contrairement à ce que
--     supposait la décision de juillet — c'était l'argument qui avait fait
--     renoncer au passage en privé. Il n'est affiché qu'aux utilisateurs
--     connectés et intégré aux PDF côté serveur. Aucun bucket public
--     « assets » n'est donc nécessaire.

-- ---------------------------------------------------------------------------
-- 1. Les buckets deviennent privés.
-- ---------------------------------------------------------------------------

update storage.buckets set public = false where id in ('rapports', 'visite-photos');

-- ---------------------------------------------------------------------------
-- 2. La lecture est cloisonnée par chantier.
-- ---------------------------------------------------------------------------
--
-- Rendre les buckets privés empêche l'accès anonyme, mais les politiques de
-- lecture existantes disaient simplement `bucket_id = '…'` : tout compte
-- connecté pouvait signer n'importe quel objet, y compris les photos d'un
-- chantier qui ne le concerne pas. Un bucket privé mal cloisonné ne protège
-- que des inconnus.
--
-- ⚠️ Il y avait **deux** politiques `SELECT` par bucket — une héritée
-- (`Authenticated users can view …`) et une plus récente (`…_select`) — toutes
-- deux permissives. Les politiques permissives s'additionnent en OU : en
-- laisser une seule en place annulerait tout le cloisonnement. Les deux sont
-- supprimées.

drop policy if exists "Authenticated users can view photos"   on storage.objects;
drop policy if exists "Authenticated users can view rapports" on storage.objects;
drop policy if exists photos_select   on storage.objects;
drop policy if exists rapports_select on storage.objects;

-- `visite-photos` : le premier dossier est **toujours** un identifiant de
-- chantier (vérifié sur les 120 objets). Même périmètre que la politique de
-- suppression déjà en place.
create policy photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'visite-photos'
    and (
      user_role() = 'administrateur'
      or (storage.foldername(name))[1] in (
        select ci.chantier_id::text
        from public.chantier_inspecteurs ci
        where ci.inspecteur_id = (select auth.uid())
      )
    )
  );

-- `rapports` mélange trois natures de fichiers (relevé sur les 241 objets) :
--   • du **référentiel partagé** — `base-documentaire/`, `points-controle/`,
--     `logos/` — que tout inspecteur doit pouvoir consulter ;
--   • des **documents de chantier**, sous `chantiers/<id>/…` : l'identifiant
--     est au **deuxième** niveau ;
--   • des **rapports de visite**, sous `<id>/…` : identifiant au premier.
create policy rapports_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'rapports'
    and (
      user_role() = 'administrateur'
      or (storage.foldername(name))[1] in ('base-documentaire', 'points-controle', 'logos')
      or (storage.foldername(name))[1] in (
        select ci.chantier_id::text
        from public.chantier_inspecteurs ci
        where ci.inspecteur_id = (select auth.uid())
      )
      or (
        (storage.foldername(name))[1] = 'chantiers'
        and (storage.foldername(name))[2] in (
          select ci.chantier_id::text
          from public.chantier_inspecteurs ci
          where ci.inspecteur_id = (select auth.uid())
        )
      )
    )
  );
