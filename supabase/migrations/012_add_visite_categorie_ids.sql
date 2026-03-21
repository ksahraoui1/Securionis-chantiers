-- 012: Add categorie_ids column to visites
-- Stores the selected category IDs when creating a visite,
-- so they persist when resuming a draft visite.

ALTER TABLE visites
    ADD COLUMN categorie_ids text[] DEFAULT '{}';
