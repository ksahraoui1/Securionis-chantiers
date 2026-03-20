-- 008: Create chantier_inspecteurs junction table
-- Links inspectors to the chantiers they are assigned to.
-- inspecteur_id FK to profiles is added in migration 010.

CREATE TABLE chantier_inspecteurs (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    chantier_id    uuid        NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
    inspecteur_id  uuid        NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_chantier_inspecteur UNIQUE (chantier_id, inspecteur_id)
);
