-- 016: Documents par chantier (gestion documentaire)
-- Chaque document est versionné et lié à un chantier.

CREATE TABLE documents (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    chantier_id   uuid        NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
    nom           text        NOT NULL,
    categorie     text        NOT NULL DEFAULT 'autre',
    description   text,
    fichier_url   text        NOT NULL,
    fichier_nom   text        NOT NULL,
    fichier_taille bigint,
    version       integer     NOT NULL DEFAULT 1,
    uploaded_by   uuid        REFERENCES auth.users(id),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Index pour requêtes fréquentes
CREATE INDEX idx_documents_chantier ON documents(chantier_id);
CREATE INDEX idx_documents_categorie ON documents(chantier_id, categorie);

-- RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY documents_select ON documents
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY documents_insert ON documents
    FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY documents_update ON documents
    FOR UPDATE TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY documents_delete ON documents
    FOR DELETE TO authenticated
    USING (true);

COMMENT ON TABLE documents IS 'Documents liés aux chantiers : permis, plans, rapports, certificats';
COMMENT ON COLUMN documents.categorie IS 'permis | plan | rapport_eca | autorisation | certificat | autre';
COMMENT ON COLUMN documents.version IS 'Numéro de version incrémenté à chaque remplacement';
