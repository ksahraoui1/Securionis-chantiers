-- 005: Create visites table
-- Each visite is an inspection session on a chantier.
-- inspecteur_id FK to profiles is added in migration 010.

CREATE TABLE visites (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    chantier_id    uuid        NOT NULL REFERENCES chantiers(id),
    inspecteur_id  uuid        NOT NULL,
    date_visite    date        NOT NULL DEFAULT CURRENT_DATE,
    heure_visite   time,
    statut         text        NOT NULL DEFAULT 'brouillon'
                               CHECK (statut IN ('brouillon', 'en_cours', 'terminee')),
    rapport_url    text,
    email_envoye   boolean     NOT NULL DEFAULT false,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);
