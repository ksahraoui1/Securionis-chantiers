-- 002: Create points_controle table
-- Each control point belongs to a phase and a category.
-- created_by FK to profiles is added in migration 010.

CREATE TABLE points_controle (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    phase_id     uuid        NOT NULL REFERENCES phases(id),
    categorie_id uuid        NOT NULL REFERENCES categories(id),
    intitule     text        NOT NULL,
    critere      text,
    base_legale  text,
    objet        text,
    is_custom    boolean     NOT NULL DEFAULT false,
    actif        boolean     NOT NULL DEFAULT true,
    created_by   uuid,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);
