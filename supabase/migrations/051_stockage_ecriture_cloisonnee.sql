-- 051 : SEC-01 (audit du 3 septembre 2026) — l'écriture dans le stockage est
-- cloisonnée par chantier
--
-- La migration 048 a cloisonné la **lecture** des buckets `rapports` et
-- `visite-photos`. Les politiques d'**écriture**, elles, dataient de mars
-- (023, reprises en 031) et disaient simplement `bucket_id = '…'`. Elles
-- existaient de surcroît en double : « Authenticated users can upload … » à
-- côté de `…_insert`, et « Authenticated users can delete own photos » à côté
-- de `photos_delete` — or une politique permissive ouverte annule les autres
-- sur la même commande (piège n° 44).
--
-- Conséquence, relevée sur la production : tout compte connecté — y compris
-- un compte créé à l'instant par `/register`, qui est publique — pouvait
--
--   • déposer un fichier sous le chantier de n'importe qui (INSERT) ;
--   • **remplacer** le PDF d'un rapport d'inspection existant (UPDATE sans
--     `WITH CHECK`), sur un document qui peut être produit après un accident ;
--   • supprimer **toutes** les photos de visite (« delete own photos » ne
--     vérifiait que le bucket).
--
-- Chemins réels, relevés avant d'écrire les règles (257 + 122 objets) :
--
--   visite-photos : toujours `<chantier>/…`
--   rapports      : `<chantier>/…`                  rapports de visite et de
--                                                    comparaison
--                   `chantiers/<chantier>/docs/…`    documents de chantier
--                   `base-documentaire/`, `points-controle/`, `logos/`
--                                                    référentiel partagé
--
-- Règle retenue : **on écrit là où on est rattaché, le référentiel appartient
-- à l'administrateur.** Même périmètre que la lecture de la 048 pour les
-- dossiers de chantier ; plus étroit pour le référentiel, qu'un inspecteur
-- consulte sans le modifier — les pages qui y écrivent sont toutes sous
-- `/admin`, gardé par le layout.
--
-- Le `service_role` n'est pas concerné : les routes serveur (PDF de visite,
-- rapport de comparaison, suppression de visite) contournent la RLS.

-- ---------------------------------------------------------------------------
-- 1. Les doublons hérités disparaissent.
-- ---------------------------------------------------------------------------

drop policy if exists "Authenticated users can upload photos"   on storage.objects;
drop policy if exists "Authenticated users can upload rapports" on storage.objects;
drop policy if exists "Authenticated users can delete own photos" on storage.objects;

-- ---------------------------------------------------------------------------
-- 2. visite-photos : dépôt et remplacement dans son chantier.
-- ---------------------------------------------------------------------------

drop policy if exists photos_insert on storage.objects;
drop policy if exists photos_update on storage.objects;

create policy photos_insert on storage.objects
  for insert to authenticated
  with check (
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

-- `USING` **et** `WITH CHECK` : sans le second, un `upsert` pourrait déplacer
-- un objet d'un chantier vers un autre.
create policy photos_update on storage.objects
  for update to authenticated
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
  )
  with check (
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

-- `photos_delete` (031) portait déjà ce périmètre : conservée telle quelle.
-- La suppression d'une photo par l'inspecteur est un geste de l'interface
-- (`use-photo-upload`), elle doit rester possible dans son chantier.

-- ---------------------------------------------------------------------------
-- 3. rapports : dossiers de chantier au rattaché, référentiel à l'admin.
-- ---------------------------------------------------------------------------

drop policy if exists rapports_insert on storage.objects;
drop policy if exists rapports_update on storage.objects;
drop policy if exists rapports_delete on storage.objects;

create policy rapports_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'rapports'
    and (
      user_role() = 'administrateur'
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

-- Le seul `upsert` de l'application sur ce bucket est le logo d'entreprise
-- (`logos/entreprise-logo.<ext>`, page `/admin/entreprise`) : administrateur.
-- Les rapports de visite sont régénérés par le `service_role`.
create policy rapports_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'rapports'
    and (
      user_role() = 'administrateur'
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
  )
  with check (
    bucket_id = 'rapports'
    and (
      user_role() = 'administrateur'
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

-- Suppression : administrateur seulement. La 031 l'accordait aussi à
-- l'inspecteur rattaché, mais plus rien dans l'application n'en a besoin :
--   • la suppression d'une visite passe désormais par le `service_role`
--     (route `DELETE /api/visites/[id]`, INT-01) ;
--   • la suppression d'un document de chantier est réservée à l'administrateur
--     par `documents_delete` — accorder le fichier à qui n'a pas la ligne ne
--     ferait que produire des documents cassés.
-- Un inspecteur ne peut donc plus effacer les rapports d'un collègue sur un
-- chantier partagé.
create policy rapports_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'rapports'
    and user_role() = 'administrateur'
  );

-- ---------------------------------------------------------------------------
-- Vérification, jouée en production dans une transaction annulée avant
-- application (rôle `authenticated` endossé, `request.jwt.claims` posés) :
--
--   invité (0 liaison)      INSERT photo et document de chantier : 42501
--                           UPDATE des rapports d'un chantier : 0 ligne
--   inspecteur rattaché     INSERT sous `<son chantier>/…`,
--   à un chantier           `chantiers/<son chantier>/docs/…` : accepté
--                           INSERT sous un autre chantier, `base-documentaire/`,
--                           `logos/` : 42501
--                           UPDATE des rapports d'un autre chantier : 0 ligne
--                           UPDATE qui déplace une photo vers un autre chantier
--                           (le `WITH CHECK`) : 42501
--   administrateur          INSERT référentiel, UPDATE logos : accepté
--   politiques restantes    8 (11 avant)
--
-- ⚠️ Les politiques DELETE ne peuvent pas s'éprouver en SQL : le trigger
-- `protect_objects_delete` de Supabase refuse toute suppression directe dans
-- `storage.objects` (« Use the Storage API instead »), quel que soit le rôle.
-- Elles ne s'exercent que par l'API Storage, donc depuis l'application.
--
-- Aucune donnée n'est modifiée par cette migration.
-- ---------------------------------------------------------------------------
