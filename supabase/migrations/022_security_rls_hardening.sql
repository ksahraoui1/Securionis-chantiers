-- 022: Renforcement sécurité RLS — restreindre les tables permissives
-- Corrige les politiques USING(true) sur documents, themes,
-- base_documentaire, point_controle_documents, point_controle_doc_liens.
-- Principe : lecture pour tous les authentifiés, écriture réservée aux admins.

-- ============================================================
-- 1. TABLE documents (liée à chantier_id)
-- ============================================================
-- Remplacer les politiques permissives par des politiques scopées au chantier

DROP POLICY IF EXISTS documents_select ON documents;
DROP POLICY IF EXISTS documents_insert ON documents;
DROP POLICY IF EXISTS documents_update ON documents;
DROP POLICY IF EXISTS documents_delete ON documents;

-- SELECT : inspecteur assigné au chantier OU admin
CREATE POLICY documents_select ON documents
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM chantier_inspecteurs ci
            WHERE ci.chantier_id = documents.chantier_id
              AND ci.inspecteur_id = auth.uid()
        )
        OR public.user_role() = 'administrateur'
    );

-- INSERT : inspecteur assigné au chantier OU admin
CREATE POLICY documents_insert ON documents
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM chantier_inspecteurs ci
            WHERE ci.chantier_id = documents.chantier_id
              AND ci.inspecteur_id = auth.uid()
        )
        OR public.user_role() = 'administrateur'
    );

-- UPDATE : inspecteur assigné au chantier OU admin
CREATE POLICY documents_update ON documents
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM chantier_inspecteurs ci
            WHERE ci.chantier_id = documents.chantier_id
              AND ci.inspecteur_id = auth.uid()
        )
        OR public.user_role() = 'administrateur'
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM chantier_inspecteurs ci
            WHERE ci.chantier_id = documents.chantier_id
              AND ci.inspecteur_id = auth.uid()
        )
        OR public.user_role() = 'administrateur'
    );

-- DELETE : admin uniquement
CREATE POLICY documents_delete ON documents
    FOR DELETE TO authenticated
    USING (public.user_role() = 'administrateur');

-- ============================================================
-- 2. TABLE themes (données de référence)
-- ============================================================
-- Lecture pour tous, écriture admin uniquement

DROP POLICY IF EXISTS themes_select ON themes;
DROP POLICY IF EXISTS themes_insert ON themes;
DROP POLICY IF EXISTS themes_update ON themes;
DROP POLICY IF EXISTS themes_delete ON themes;

CREATE POLICY themes_select ON themes
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY themes_insert ON themes
    FOR INSERT TO authenticated
    WITH CHECK (public.user_role() = 'administrateur');

CREATE POLICY themes_update ON themes
    FOR UPDATE TO authenticated
    USING (public.user_role() = 'administrateur')
    WITH CHECK (public.user_role() = 'administrateur');

CREATE POLICY themes_delete ON themes
    FOR DELETE TO authenticated
    USING (public.user_role() = 'administrateur');

-- ============================================================
-- 3. TABLE point_controle_documents (pièces jointes des points)
-- ============================================================
-- Lecture pour tous, écriture admin uniquement

DROP POLICY IF EXISTS pc_docs_select ON point_controle_documents;
DROP POLICY IF EXISTS pc_docs_insert ON point_controle_documents;
DROP POLICY IF EXISTS pc_docs_update ON point_controle_documents;
DROP POLICY IF EXISTS pc_docs_delete ON point_controle_documents;

CREATE POLICY pc_docs_select ON point_controle_documents
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY pc_docs_insert ON point_controle_documents
    FOR INSERT TO authenticated
    WITH CHECK (public.user_role() = 'administrateur');

CREATE POLICY pc_docs_update ON point_controle_documents
    FOR UPDATE TO authenticated
    USING (public.user_role() = 'administrateur')
    WITH CHECK (public.user_role() = 'administrateur');

CREATE POLICY pc_docs_delete ON point_controle_documents
    FOR DELETE TO authenticated
    USING (public.user_role() = 'administrateur');

-- ============================================================
-- 4. TABLE base_documentaire (bibliothèque réglementaire)
-- ============================================================
-- Lecture pour tous, écriture admin uniquement

DROP POLICY IF EXISTS base_doc_select ON base_documentaire;
DROP POLICY IF EXISTS base_doc_insert ON base_documentaire;
DROP POLICY IF EXISTS base_doc_update ON base_documentaire;
DROP POLICY IF EXISTS base_doc_delete ON base_documentaire;

CREATE POLICY base_doc_select ON base_documentaire
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY base_doc_insert ON base_documentaire
    FOR INSERT TO authenticated
    WITH CHECK (public.user_role() = 'administrateur');

CREATE POLICY base_doc_update ON base_documentaire
    FOR UPDATE TO authenticated
    USING (public.user_role() = 'administrateur')
    WITH CHECK (public.user_role() = 'administrateur');

CREATE POLICY base_doc_delete ON base_documentaire
    FOR DELETE TO authenticated
    USING (public.user_role() = 'administrateur');

-- ============================================================
-- 5. TABLE point_controle_doc_liens (liaison docs <-> points)
-- ============================================================
-- Lecture pour tous, écriture admin uniquement

DROP POLICY IF EXISTS doc_liens_select ON point_controle_doc_liens;
DROP POLICY IF EXISTS doc_liens_insert ON point_controle_doc_liens;
DROP POLICY IF EXISTS doc_liens_delete ON point_controle_doc_liens;

CREATE POLICY doc_liens_select ON point_controle_doc_liens
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY doc_liens_insert ON point_controle_doc_liens
    FOR INSERT TO authenticated
    WITH CHECK (public.user_role() = 'administrateur');

CREATE POLICY doc_liens_delete ON point_controle_doc_liens
    FOR DELETE TO authenticated
    USING (public.user_role() = 'administrateur');

-- ============================================================
-- 6. TABLE entreprises — supprimer l'ancienne politique trop permissive
-- ============================================================
-- La migration 015 a créé entreprises_select USING(true)
-- La migration 020 a ajouté entreprises_select_own correctement scopée
-- On supprime l'ancienne pour éviter le conflit (OR implicite entre policies)

DROP POLICY IF EXISTS entreprises_select ON entreprises;

-- ============================================================
-- 7. Table audit_logs pour la traçabilité
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        REFERENCES auth.users(id),
    action      text        NOT NULL,
    resource    text        NOT NULL,
    resource_id text,
    details     jsonb,
    ip_address  text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Seuls les admins peuvent lire les logs d'audit
CREATE POLICY audit_logs_select ON audit_logs
    FOR SELECT TO authenticated
    USING (public.user_role() = 'administrateur');

-- Tout utilisateur authentifié peut insérer (pour logger ses propres actions)
CREATE POLICY audit_logs_insert ON audit_logs
    FOR INSERT TO authenticated
    WITH CHECK (true);

COMMENT ON TABLE audit_logs IS 'Journal d''audit des actions sensibles (création utilisateur, envoi email, etc.)';
