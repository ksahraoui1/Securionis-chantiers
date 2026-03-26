-- 021: Base documentaire réglementaire
-- Bibliothèque centralisée de documents (PDF, schémas JPEG/JPG)
-- liés aux points de contrôle.

CREATE TABLE base_documentaire (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    titre          text        NOT NULL,
    source         text        NOT NULL DEFAULT 'autre',
    reference      text,
    description    text,
    fichier_url    text        NOT NULL,
    fichier_nom    text        NOT NULL,
    fichier_taille bigint,
    type_fichier   text        NOT NULL DEFAULT 'pdf',
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_base_doc_source ON base_documentaire(source);
CREATE INDEX idx_base_doc_titre ON base_documentaire USING gin(to_tsvector('french', titre));

-- Table de liaison N-N entre documents et points de contrôle
CREATE TABLE point_controle_doc_liens (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id       uuid        NOT NULL REFERENCES base_documentaire(id) ON DELETE CASCADE,
    point_controle_id uuid        NOT NULL REFERENCES points_controle(id) ON DELETE CASCADE,
    created_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE(document_id, point_controle_id)
);

CREATE INDEX idx_doc_liens_document ON point_controle_doc_liens(document_id);
CREATE INDEX idx_doc_liens_point ON point_controle_doc_liens(point_controle_id);

-- RLS base_documentaire
ALTER TABLE base_documentaire ENABLE ROW LEVEL SECURITY;

CREATE POLICY base_doc_select ON base_documentaire
    FOR SELECT TO authenticated USING (true);
CREATE POLICY base_doc_insert ON base_documentaire
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY base_doc_update ON base_documentaire
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY base_doc_delete ON base_documentaire
    FOR DELETE TO authenticated USING (true);

-- RLS point_controle_doc_liens
ALTER TABLE point_controle_doc_liens ENABLE ROW LEVEL SECURITY;

CREATE POLICY doc_liens_select ON point_controle_doc_liens
    FOR SELECT TO authenticated USING (true);
CREATE POLICY doc_liens_insert ON point_controle_doc_liens
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY doc_liens_delete ON point_controle_doc_liens
    FOR DELETE TO authenticated USING (true);

COMMENT ON TABLE base_documentaire IS 'Bibliothèque de documents réglementaires (PDF, schémas JPEG/JPG) liés aux points de contrôle';
COMMENT ON COLUMN base_documentaire.source IS 'suva | otconst | sia | oibt | co | rpac | autre';
COMMENT ON COLUMN base_documentaire.type_fichier IS 'pdf | jpeg | jpg | png';
