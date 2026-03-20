-- 006: Create reponses table
-- Stores the inspector's answer for each control point during a visite.

CREATE TABLE reponses (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    visite_id         uuid        NOT NULL REFERENCES visites(id) ON DELETE CASCADE,
    point_controle_id uuid        NOT NULL REFERENCES points_controle(id),
    valeur            text        NOT NULL
                                  CHECK (valeur IN ('conforme', 'non_conforme', 'pas_necessaire')),
    remarque          text,
    photos            text[]      DEFAULT '{}',
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_reponse_visite_point UNIQUE (visite_id, point_controle_id),
    CONSTRAINT chk_photos_max CHECK (array_length(photos, 1) <= 10 OR photos = '{}')
);
