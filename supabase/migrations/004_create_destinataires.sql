-- 004: Create destinataires table
-- Recipients who receive inspection reports for a given chantier.

CREATE TABLE destinataires (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    chantier_id uuid        NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
    nom         text        NOT NULL,
    organisation text,
    email       text        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);
