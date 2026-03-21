-- 015: Create entreprises table and link to profiles
-- Each inspector belongs to an entreprise (inspection company)

CREATE TABLE entreprises (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    nom         text        NOT NULL,
    adresse     text,
    npa         text,
    ville       text,
    telephone   text,
    email       text,
    logo_url    text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Add entreprise_id to profiles
ALTER TABLE profiles ADD COLUMN entreprise_id uuid REFERENCES entreprises(id);

-- RLS
ALTER TABLE entreprises ENABLE ROW LEVEL SECURITY;

CREATE POLICY entreprises_select ON entreprises
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY entreprises_admin_all ON entreprises
    FOR ALL TO authenticated
    USING (public.user_role() = 'administrateur')
    WITH CHECK (public.user_role() = 'administrateur');
