-- 019: Archivage des chantiers terminés
-- Un chantier archivé n'apparaît plus dans les chantiers actifs ni le dashboard.

ALTER TABLE chantiers ADD COLUMN archived boolean NOT NULL DEFAULT false;
ALTER TABLE chantiers ADD COLUMN archived_at timestamptz;

CREATE INDEX idx_chantiers_archived ON chantiers(archived);

-- Policy UPDATE pour les inspecteurs (manquante)
CREATE POLICY chantiers_inspecteur_update ON chantiers
    FOR UPDATE TO authenticated
    USING (true)
    WITH CHECK (true);
