-- 003: Create chantiers table
-- Represents a construction site under inspection.
-- created_by FK to profiles is added in migration 010.

CREATE TABLE chantiers (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    adresse         text        NOT NULL,
    nature_travaux  text        NOT NULL,
    ref_communale   text,
    numero_camac    text,
    numero_parcelle text,
    numero_eca      text,
    contact_nom     text,
    created_by      uuid        NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
