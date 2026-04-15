-- Migration 028: Ajouter un champ remarques_generales sur les visites
-- Ce champ permet à l'inspecteur de saisir des remarques globales
-- qui apparaîtront dans le rapport PDF.

ALTER TABLE visites ADD COLUMN IF NOT EXISTS remarques_generales TEXT;
