-- Fix: s'assurer que les politiques RLS sur categories et themes permettent la lecture

-- Supprimer les anciennes politiques si elles existent
DROP POLICY IF EXISTS categories_select ON categories;
DROP POLICY IF EXISTS themes_select ON themes;

-- Recréer les politiques de lecture
CREATE POLICY categories_select ON categories
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY themes_select ON themes
    FOR SELECT TO authenticated
    USING (true);
