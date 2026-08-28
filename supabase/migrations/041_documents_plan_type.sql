-- 041: Typage des plans (PE / EXE) sur les documents de chantier
-- Permet de marquer un document comme « Plan d'enquête publique » (PE)
-- ou « Plan d'exécution » (EXE), de le versionner et de chaîner les versions
-- entre elles en vue d'une comparaison PE / EXE.

ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS plan_type         text,
    ADD COLUMN IF NOT EXISTS plan_version      integer,
    ADD COLUMN IF NOT EXISTS parent_version_id uuid REFERENCES documents(id) ON DELETE SET NULL;

-- plan_type : 'PE' | 'EXE' | NULL (document qui n'est pas un plan typé)
ALTER TABLE documents
    DROP CONSTRAINT IF EXISTS documents_plan_type_check;
ALTER TABLE documents
    ADD CONSTRAINT documents_plan_type_check
    CHECK (plan_type IS NULL OR plan_type IN ('PE', 'EXE'));

-- plan_version : numéro de version du plan, strictement positif quand renseigné
ALTER TABLE documents
    DROP CONSTRAINT IF EXISTS documents_plan_version_check;
ALTER TABLE documents
    ADD CONSTRAINT documents_plan_version_check
    CHECK (plan_version IS NULL OR plan_version > 0);

-- Un document ne peut pas être sa propre version précédente
ALTER TABLE documents
    DROP CONSTRAINT IF EXISTS documents_parent_version_self_check;
ALTER TABLE documents
    ADD CONSTRAINT documents_parent_version_self_check
    CHECK (parent_version_id IS NULL OR parent_version_id <> id);

-- Retrouver rapidement les plans typés d'un chantier
CREATE INDEX IF NOT EXISTS idx_documents_plan_type
    ON documents(chantier_id, plan_type)
    WHERE plan_type IS NOT NULL;

COMMENT ON COLUMN documents.plan_type IS 'PE (plan d''enquête publique) | EXE (plan d''exécution) | NULL';
COMMENT ON COLUMN documents.plan_version IS 'Numéro de version du plan (1, 2, 3...)';
COMMENT ON COLUMN documents.parent_version_id IS 'Document correspondant à la version précédente du plan';
