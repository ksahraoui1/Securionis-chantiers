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
