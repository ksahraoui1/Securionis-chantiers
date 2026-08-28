-- 042: Annotations sur la comparaison des plans PE / EXE
-- Une « session de comparaison » identifie le couple de plans réellement
-- affichés (documents + pages) : c'est elle qui porte les annotations, afin
-- qu'elles réapparaissent exactement au même endroit au rechargement.

CREATE TABLE comparaisons (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    chantier_id     uuid        NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
    document_pe_id  uuid        NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    document_exe_id uuid        NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    page_pe         integer     NOT NULL DEFAULT 1 CHECK (page_pe > 0),
    page_exe        integer     NOT NULL DEFAULT 1 CHECK (page_exe > 0),
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        REFERENCES auth.users(id),
    UNIQUE (chantier_id, document_pe_id, document_exe_id, page_pe, page_exe)
);

CREATE INDEX idx_comparaisons_chantier ON comparaisons(chantier_id);

CREATE TABLE comparaison_annotations (
    id             uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
    comparaison_id uuid             NOT NULL REFERENCES comparaisons(id) ON DELETE CASCADE,
    type           text             NOT NULL CHECK (type IN ('arrow', 'circle', 'rect', 'text', 'highlight')),
    x              double precision NOT NULL,
    y              double precision NOT NULL,
    width          double precision NOT NULL DEFAULT 0,
    height         double precision NOT NULL DEFAULT 0,
    color          text             NOT NULL DEFAULT 'red' CHECK (color IN ('red', 'orange', 'green', 'yellow')),
    commentaire    text,
    created_at     timestamptz      NOT NULL DEFAULT now(),
    created_by     uuid             REFERENCES auth.users(id)
);

CREATE INDEX idx_comparaison_annotations_comparaison
    ON comparaison_annotations(comparaison_id, created_at);

-- ============================================================
-- RLS : même périmètre que les documents du chantier
-- ============================================================
ALTER TABLE comparaisons ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparaison_annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY comparaisons_select ON comparaisons
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM chantier_inspecteurs ci
            WHERE ci.chantier_id = comparaisons.chantier_id
              AND ci.inspecteur_id = auth.uid()
        )
        OR public.user_role() = 'administrateur'
    );

CREATE POLICY comparaisons_insert ON comparaisons
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM chantier_inspecteurs ci
            WHERE ci.chantier_id = comparaisons.chantier_id
              AND ci.inspecteur_id = auth.uid()
        )
        OR public.user_role() = 'administrateur'
    );

CREATE POLICY annotations_select ON comparaison_annotations
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM comparaisons c
            WHERE c.id = comparaison_annotations.comparaison_id
              AND (
                  EXISTS (
                      SELECT 1 FROM chantier_inspecteurs ci
                      WHERE ci.chantier_id = c.chantier_id
                        AND ci.inspecteur_id = auth.uid()
                  )
                  OR public.user_role() = 'administrateur'
              )
        )
    );

CREATE POLICY annotations_insert ON comparaison_annotations
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM comparaisons c
            WHERE c.id = comparaison_annotations.comparaison_id
              AND (
                  EXISTS (
                      SELECT 1 FROM chantier_inspecteurs ci
                      WHERE ci.chantier_id = c.chantier_id
                        AND ci.inspecteur_id = auth.uid()
                  )
                  OR public.user_role() = 'administrateur'
              )
        )
    );

CREATE POLICY annotations_update ON comparaison_annotations
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM comparaisons c
            WHERE c.id = comparaison_annotations.comparaison_id
              AND (
                  EXISTS (
                      SELECT 1 FROM chantier_inspecteurs ci
                      WHERE ci.chantier_id = c.chantier_id
                        AND ci.inspecteur_id = auth.uid()
                  )
                  OR public.user_role() = 'administrateur'
              )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM comparaisons c
            WHERE c.id = comparaison_annotations.comparaison_id
              AND (
                  EXISTS (
                      SELECT 1 FROM chantier_inspecteurs ci
                      WHERE ci.chantier_id = c.chantier_id
                        AND ci.inspecteur_id = auth.uid()
                  )
                  OR public.user_role() = 'administrateur'
              )
        )
    );

CREATE POLICY annotations_delete ON comparaison_annotations
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM comparaisons c
            WHERE c.id = comparaison_annotations.comparaison_id
              AND (
                  EXISTS (
                      SELECT 1 FROM chantier_inspecteurs ci
                      WHERE ci.chantier_id = c.chantier_id
                        AND ci.inspecteur_id = auth.uid()
                  )
                  OR public.user_role() = 'administrateur'
              )
        )
    );

COMMENT ON TABLE comparaisons IS 'Session de comparaison : couple de plans PE/EXE et pages effectivement comparés';
COMMENT ON TABLE comparaison_annotations IS 'Annotations posées sur une comparaison de plans';
COMMENT ON COLUMN comparaison_annotations.x IS 'Coordonnées en unités monde OpenSeadragon (le plan de référence fait 1 de large) — indépendantes du zoom et de la taille d''écran';
