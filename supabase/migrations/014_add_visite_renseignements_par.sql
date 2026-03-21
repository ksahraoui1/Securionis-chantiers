-- 014: Add renseignements_par to visites
-- Person who provided information on site during this specific visit
ALTER TABLE visites ADD COLUMN renseignements_par text;
