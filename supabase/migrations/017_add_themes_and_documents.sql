-- 017: Ajout thèmes, documents PDF sur points de contrôle, restructuration
-- Nouvelle hiérarchie : Catégorie → Thème → Point de contrôle
-- Ajout de pièces jointes PDF (max 5) par point de contrôle

-- 1. Rendre phase_id optionnel sur categories (nouvelles catégories sans phase)
ALTER TABLE categories ALTER COLUMN phase_id DROP NOT NULL;

-- 2. Table thèmes (sous-catégories)
CREATE TABLE themes (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    categorie_id uuid        NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    libelle      text        NOT NULL,
    actif        boolean     NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_themes_categorie ON themes(categorie_id);

-- 3. Enrichir points_controle
ALTER TABLE points_controle ALTER COLUMN phase_id DROP NOT NULL;
ALTER TABLE points_controle ALTER COLUMN categorie_id DROP NOT NULL;
ALTER TABLE points_controle ADD COLUMN theme_id uuid REFERENCES themes(id);
ALTER TABLE points_controle ADD COLUMN explications text;

CREATE INDEX idx_points_controle_theme ON points_controle(theme_id);

-- 4. Documents PDF attachés aux points de contrôle (max 5 par point)
CREATE TABLE point_controle_documents (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    point_controle_id uuid        NOT NULL REFERENCES points_controle(id) ON DELETE CASCADE,
    nom               text        NOT NULL,
    fichier_url       text        NOT NULL,
    fichier_nom       text        NOT NULL,
    fichier_taille    bigint,
    ordre             smallint    NOT NULL DEFAULT 1,
    created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pc_docs_point ON point_controle_documents(point_controle_id);

-- 5. RLS sur themes
ALTER TABLE themes ENABLE ROW LEVEL SECURITY;

CREATE POLICY themes_select ON themes
    FOR SELECT TO authenticated USING (true);

CREATE POLICY themes_insert ON themes
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY themes_update ON themes
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY themes_delete ON themes
    FOR DELETE TO authenticated USING (true);

-- 6. RLS sur point_controle_documents
ALTER TABLE point_controle_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY pc_docs_select ON point_controle_documents
    FOR SELECT TO authenticated USING (true);

CREATE POLICY pc_docs_insert ON point_controle_documents
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY pc_docs_update ON point_controle_documents
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY pc_docs_delete ON point_controle_documents
    FOR DELETE TO authenticated USING (true);

COMMENT ON TABLE themes IS 'Thèmes regroupant les points de contrôle au sein d''une catégorie';
COMMENT ON TABLE point_controle_documents IS 'Documents PDF réglementaires attachés aux points de contrôle (max 5)';
