-- 054 : APP-04 (audit du 4 septembre 2026) — la bibliothèque documentaire
-- n'est plus lisible par tout compte connecté
--
-- `base_doc_select` disait `USING (true)` : n'importe quel compte
-- authentifié lisait l'intégralité du référentiel documentaire. Combiné à
-- APP-01 — l'envoi d'un document vers une adresse arbitraire, sans contrôle de
-- rôle — cela donnait à un compte « invité » le moyen d'extraire toute la
-- bibliothèque vers l'extérieur.
--
-- Les deux moitiés de ce risque sont traitées : APP-01 vérifie désormais le
-- rôle, et APP-02 a fermé l'inscription publique, si bien qu'un compte
-- « invité » est aujourd'hui créé délibérément par un administrateur. Reste le
-- principe : cette table n'a aucune raison d'être lisible par un rôle dont
-- l'application annonce une « vue limitée ».
--
-- Lecture réservée à `inspecteur` et `administrateur`. L'écriture était déjà
-- réservée à l'administrateur (`base_doc_insert/update/delete`), inchangée.

drop policy if exists base_doc_select on public.base_documentaire;

create policy base_doc_select on public.base_documentaire
  for select to authenticated
  using (user_role() in ('inspecteur', 'administrateur'));

-- ---------------------------------------------------------------------------
-- Effet sur les trois lecteurs, vérifié avant d'écrire cette politique
-- ---------------------------------------------------------------------------
--
--   /admin/documents         page réservée à l'administrateur par le layout —
--                            aucun changement
--   checklist de visite      `point_controle_doc_liens(*, base_documentaire(*))`
--                            un « invité » verra la liaison sans le document
--                            joint : dégradation silencieuse, pas d'erreur
--   assistant juridique      `recherche-corpus.ts` ne remontera aucun document
--                            de référence pour un « invité »
--
-- ⚠️ Les documents attachés directement à un point de contrôle
-- (`point_controle_documents`) restent lisibles par tous : ils font partie de
-- la checklist qu'un « invité » est autorisé à remplir. Restreindre les deux
-- lui retirerait toute documentation pendant une visite de démonstration.
--
-- ---------------------------------------------------------------------------
-- Vérification (transaction annulée)
-- ---------------------------------------------------------------------------
--
--   invité        → 0 document
--   inspecteur    → tous les documents
--   administrateur → tous les documents
-- ---------------------------------------------------------------------------
