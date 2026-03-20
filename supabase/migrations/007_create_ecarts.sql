-- 007: Create ecarts table
-- An ecart (non-conformity) is raised when a reponse is 'non_conforme'.
-- updated_by FK to profiles is added in migration 010.

CREATE TABLE ecarts (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    chantier_id uuid        NOT NULL REFERENCES chantiers(id),
    reponse_id  uuid        NOT NULL REFERENCES reponses(id),
    description text        NOT NULL,
    delai       text,
    statut      text        NOT NULL DEFAULT 'ouvert'
                            CHECK (statut IN ('ouvert', 'en_cours_correction', 'corrige')),
    updated_by  uuid,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);
