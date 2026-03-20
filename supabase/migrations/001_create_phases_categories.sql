-- 001: Create phases and categories tables
-- Phases represent construction stages; categories group control points within a phase.

CREATE TABLE phases (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    numero     smallint    NOT NULL UNIQUE,
    libelle    text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE categories (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    phase_id   uuid        NOT NULL REFERENCES phases(id),
    libelle    text        NOT NULL,
    is_custom  boolean     NOT NULL DEFAULT false,
    actif      boolean     NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);
