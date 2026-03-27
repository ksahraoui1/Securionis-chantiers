-- 024: Rôle invité + table subscriptions Stripe
-- Modèle freemium : invité (gratuit, limité) → inspecteur (payant, complet)

-- 1. Ajouter le rôle "invité" aux profils
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('invité', 'inspecteur', 'administrateur'));

-- Mettre à jour la fonction user_role pour inclure invité
CREATE OR REPLACE FUNCTION public.user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

-- 2. Table subscriptions pour Stripe
CREATE TABLE subscriptions (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    stripe_customer_id  text        NOT NULL,
    stripe_subscription_id text,
    status              text        NOT NULL DEFAULT 'inactive',
    plan                text        NOT NULL DEFAULT 'monthly',
    current_period_start timestamptz,
    current_period_end  timestamptz,
    trial_end           timestamptz,
    cancel_at           timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_stripe_sub ON subscriptions(stripe_subscription_id);

-- RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- L'utilisateur ne voit que son propre abonnement
CREATE POLICY subscriptions_select_own ON subscriptions
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.user_role() = 'administrateur');

-- Seul le serveur (via service_role) peut insérer/modifier
CREATE POLICY subscriptions_insert ON subscriptions
    FOR INSERT TO authenticated
    WITH CHECK (false);

CREATE POLICY subscriptions_update ON subscriptions
    FOR UPDATE TO authenticated
    USING (false);

-- 3. Mettre à jour RLS profiles pour inclure invité
-- L'invité a les mêmes droits de lecture que l'inspecteur
-- (les limites sont gérées côté application)

-- 4. Nouveau profil par défaut = invité (au lieu d'inspecteur)
-- Le trigger handle_new_user doit créer avec role='invité'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, nom, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nom', ''),
    NEW.email,
    'invité'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

COMMENT ON TABLE subscriptions IS 'Abonnements Stripe par utilisateur';
COMMENT ON COLUMN subscriptions.status IS 'active | trialing | past_due | canceled | inactive';
COMMENT ON COLUMN subscriptions.plan IS 'monthly | yearly';
