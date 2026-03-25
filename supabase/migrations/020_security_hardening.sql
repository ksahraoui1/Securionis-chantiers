-- 020: Renforcement sécurité — RLS entreprises

-- RLS sur la table entreprises (manquant)
ALTER TABLE entreprises ENABLE ROW LEVEL SECURITY;

-- Les utilisateurs ne voient que leur propre entreprise
CREATE POLICY entreprises_select_own ON entreprises
    FOR SELECT TO authenticated
    USING (
        id IN (SELECT entreprise_id FROM profiles WHERE id = auth.uid())
    );

-- Seuls les admins peuvent modifier leur entreprise
CREATE POLICY entreprises_update_admin ON entreprises
    FOR UPDATE TO authenticated
    USING (
        id IN (
            SELECT entreprise_id FROM profiles
            WHERE id = auth.uid() AND role = 'administrateur'
        )
    )
    WITH CHECK (
        id IN (
            SELECT entreprise_id FROM profiles
            WHERE id = auth.uid() AND role = 'administrateur'
        )
    );
