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
-- 009: Create indexes for query performance

-- chantier_inspecteurs
CREATE INDEX idx_ci_inspecteur ON chantier_inspecteurs(inspecteur_id);
CREATE INDEX idx_ci_chantier   ON chantier_inspecteurs(chantier_id);

-- visites
CREATE INDEX idx_visites_chantier    ON visites(chantier_id);
CREATE INDEX idx_visites_inspecteur  ON visites(inspecteur_id);

-- Partial unique index: only one non-terminee visite per chantier at a time
CREATE UNIQUE INDEX uq_visites_active ON visites(chantier_id) WHERE statut != 'terminee';

-- reponses
CREATE INDEX idx_reponses_visite ON reponses(visite_id);
CREATE INDEX idx_reponses_point  ON reponses(point_controle_id);

-- ecarts
CREATE INDEX idx_ecarts_chantier ON ecarts(chantier_id);
CREATE INDEX idx_ecarts_statut   ON ecarts(chantier_id, statut);

-- points_controle
CREATE INDEX idx_pc_phase     ON points_controle(phase_id);
CREATE INDEX idx_pc_categorie ON points_controle(categorie_id);
CREATE INDEX idx_pc_actif     ON points_controle(actif) WHERE actif = true;

-- destinataires
CREATE INDEX idx_dest_chantier ON destinataires(chantier_id);
-- 010: Create profiles table and add deferred FK constraints
-- Profiles are linked 1:1 with auth.users via the id column.

CREATE TABLE profiles (
    id         uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nom        text        NOT NULL,
    email      text        NOT NULL UNIQUE,
    role       text        NOT NULL DEFAULT 'inspecteur'
                           CHECK (role IN ('inspecteur', 'administrateur')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add deferred FK constraints from other tables to profiles

ALTER TABLE points_controle
    ADD CONSTRAINT fk_pc_created_by
    FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE chantiers
    ADD CONSTRAINT fk_chantiers_created_by
    FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE visites
    ADD CONSTRAINT fk_visites_inspecteur
    FOREIGN KEY (inspecteur_id) REFERENCES profiles(id);

ALTER TABLE ecarts
    ADD CONSTRAINT fk_ecarts_updated_by
    FOREIGN KEY (updated_by) REFERENCES profiles(id);

ALTER TABLE chantier_inspecteurs
    ADD CONSTRAINT fk_ci_inspecteur
    FOREIGN KEY (inspecteur_id) REFERENCES profiles(id);

-- Trigger: auto-create a profile row when a new user signs up
-- Uses SECURITY DEFINER to access auth.users from public schema

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, nom, email)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data ->> 'nom', NEW.raw_user_meta_data ->> 'full_name', 'Utilisateur'),
        NEW.email
    );
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();
-- 011: Enable RLS on all tables and create access policies

-- ============================================================
-- Enable RLS
-- ============================================================

ALTER TABLE profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE phases               ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories           ENABLE ROW LEVEL SECURITY;
ALTER TABLE points_controle      ENABLE ROW LEVEL SECURITY;
ALTER TABLE chantiers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE destinataires        ENABLE ROW LEVEL SECURITY;
ALTER TABLE visites              ENABLE ROW LEVEL SECURITY;
ALTER TABLE reponses             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ecarts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE chantier_inspecteurs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Helper function: returns the current user's role
-- Placed in PUBLIC schema (not auth) for Supabase cloud compat
-- ============================================================

CREATE OR REPLACE FUNCTION public.user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role FROM profiles WHERE id = auth.uid();
$$;

-- ============================================================
-- profiles
-- ============================================================

CREATE POLICY profiles_select_own ON profiles
    FOR SELECT USING (id = auth.uid());

CREATE POLICY profiles_select_admin ON profiles
    FOR SELECT USING (public.user_role() = 'administrateur');

CREATE POLICY profiles_update_own ON profiles
    FOR UPDATE USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- ============================================================
-- phases (read-only for all authenticated users)
-- ============================================================

CREATE POLICY phases_select ON phases
    FOR SELECT TO authenticated
    USING (true);

-- ============================================================
-- categories (read-only for all authenticated users)
-- ============================================================

CREATE POLICY categories_select ON categories
    FOR SELECT TO authenticated
    USING (true);

-- ============================================================
-- points_controle
-- ============================================================

CREATE POLICY pc_select_active ON points_controle
    FOR SELECT TO authenticated
    USING (actif = true);

CREATE POLICY pc_insert_admin ON points_controle
    FOR INSERT TO authenticated
    WITH CHECK (
        public.user_role() = 'administrateur'
        AND is_custom = true
    );

CREATE POLICY pc_update_admin ON points_controle
    FOR UPDATE TO authenticated
    USING (
        public.user_role() = 'administrateur'
        AND is_custom = true
    )
    WITH CHECK (
        public.user_role() = 'administrateur'
        AND is_custom = true
    );

-- ============================================================
-- chantiers
-- ============================================================

CREATE POLICY chantiers_inspecteur_select ON chantiers
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM chantier_inspecteurs ci
            WHERE ci.chantier_id = chantiers.id
              AND ci.inspecteur_id = auth.uid()
        )
    );

CREATE POLICY chantiers_inspecteur_insert ON chantiers
    FOR INSERT TO authenticated
    WITH CHECK (created_by = auth.uid());

CREATE POLICY chantiers_admin_all ON chantiers
    FOR ALL TO authenticated
    USING (public.user_role() = 'administrateur')
    WITH CHECK (public.user_role() = 'administrateur');

-- ============================================================
-- destinataires (access via chantier ownership)
-- ============================================================

CREATE POLICY destinataires_inspecteur_select ON destinataires
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM chantier_inspecteurs ci
            WHERE ci.chantier_id = destinataires.chantier_id
              AND ci.inspecteur_id = auth.uid()
        )
    );

CREATE POLICY destinataires_inspecteur_manage ON destinataires
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM chantier_inspecteurs ci
            WHERE ci.chantier_id = destinataires.chantier_id
              AND ci.inspecteur_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM chantier_inspecteurs ci
            WHERE ci.chantier_id = destinataires.chantier_id
              AND ci.inspecteur_id = auth.uid()
        )
    );

CREATE POLICY destinataires_admin_all ON destinataires
    FOR ALL TO authenticated
    USING (public.user_role() = 'administrateur')
    WITH CHECK (public.user_role() = 'administrateur');

-- ============================================================
-- visites
-- ============================================================

CREATE POLICY visites_inspecteur_select ON visites
    FOR SELECT TO authenticated
    USING (
        inspecteur_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM chantier_inspecteurs ci
            WHERE ci.chantier_id = visites.chantier_id
              AND ci.inspecteur_id = auth.uid()
        )
    );

CREATE POLICY visites_inspecteur_insert ON visites
    FOR INSERT TO authenticated
    WITH CHECK (
        inspecteur_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM chantier_inspecteurs ci
            WHERE ci.chantier_id = visites.chantier_id
              AND ci.inspecteur_id = auth.uid()
        )
    );

CREATE POLICY visites_inspecteur_update ON visites
    FOR UPDATE TO authenticated
    USING (inspecteur_id = auth.uid())
    WITH CHECK (inspecteur_id = auth.uid());

CREATE POLICY visites_admin_all ON visites
    FOR ALL TO authenticated
    USING (public.user_role() = 'administrateur')
    WITH CHECK (public.user_role() = 'administrateur');

-- ============================================================
-- reponses (access via visite ownership)
-- ============================================================

CREATE POLICY reponses_inspecteur_select ON reponses
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM visites v
            WHERE v.id = reponses.visite_id
              AND v.inspecteur_id = auth.uid()
        )
    );

CREATE POLICY reponses_inspecteur_insert ON reponses
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM visites v
            WHERE v.id = reponses.visite_id
              AND v.inspecteur_id = auth.uid()
        )
    );

CREATE POLICY reponses_inspecteur_update ON reponses
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM visites v
            WHERE v.id = reponses.visite_id
              AND v.inspecteur_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM visites v
            WHERE v.id = reponses.visite_id
              AND v.inspecteur_id = auth.uid()
        )
    );

CREATE POLICY reponses_admin_all ON reponses
    FOR ALL TO authenticated
    USING (public.user_role() = 'administrateur')
    WITH CHECK (public.user_role() = 'administrateur');

-- ============================================================
-- ecarts (access via chantier ownership)
-- ============================================================

CREATE POLICY ecarts_inspecteur_select ON ecarts
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM chantier_inspecteurs ci
            WHERE ci.chantier_id = ecarts.chantier_id
              AND ci.inspecteur_id = auth.uid()
        )
    );

CREATE POLICY ecarts_inspecteur_insert ON ecarts
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM chantier_inspecteurs ci
            WHERE ci.chantier_id = ecarts.chantier_id
              AND ci.inspecteur_id = auth.uid()
        )
    );

CREATE POLICY ecarts_inspecteur_update ON ecarts
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM chantier_inspecteurs ci
            WHERE ci.chantier_id = ecarts.chantier_id
              AND ci.inspecteur_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM chantier_inspecteurs ci
            WHERE ci.chantier_id = ecarts.chantier_id
              AND ci.inspecteur_id = auth.uid()
        )
    );

CREATE POLICY ecarts_admin_all ON ecarts
    FOR ALL TO authenticated
    USING (public.user_role() = 'administrateur')
    WITH CHECK (public.user_role() = 'administrateur');

-- ============================================================
-- chantier_inspecteurs
-- ============================================================

CREATE POLICY ci_inspecteur_select ON chantier_inspecteurs
    FOR SELECT TO authenticated
    USING (inspecteur_id = auth.uid());

CREATE POLICY ci_admin_all ON chantier_inspecteurs
    FOR ALL TO authenticated
    USING (public.user_role() = 'administrateur')
    WITH CHECK (public.user_role() = 'administrateur');
