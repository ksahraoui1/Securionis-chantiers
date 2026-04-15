-- Migration 029: Ajouter la valeur 'remarques' dans la contrainte CHECK de reponses.valeur
-- Permet un nouveau choix de réponse "Remarques" qui apparaît dans le rapport PDF
-- au même titre que les non-conformités, mais sans déclencher d'écart.

ALTER TABLE reponses DROP CONSTRAINT IF EXISTS reponses_valeur_check;
ALTER TABLE reponses ADD CONSTRAINT reponses_valeur_check
  CHECK (valeur = ANY (ARRAY['conforme'::text, 'non_conforme'::text, 'pas_necessaire'::text, 'remarques'::text]));
