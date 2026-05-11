-- Table des subscriptions Web Push (PWA notifications)
-- Une entrée par device/navigateur d'un utilisateur.
-- L'endpoint est unique : un utilisateur peut s'abonner depuis plusieurs devices.
--
-- Idempotente : tous les CREATE supportent IF NOT EXISTS et les policies sont
-- DROP IF EXISTS avant CREATE (PostgreSQL ne supporte pas CREATE POLICY IF NOT
-- EXISTS avant PG 17).

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint    text        NOT NULL UNIQUE,
    p256dh      text        NOT NULL,
    auth        text        NOT NULL,
    user_agent  text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_select_own ON push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_insert_own ON push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_update_own ON push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_delete_own ON push_subscriptions;

-- Un utilisateur gère uniquement ses propres subscriptions.
CREATE POLICY push_subscriptions_select_own ON push_subscriptions
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY push_subscriptions_insert_own ON push_subscriptions
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY push_subscriptions_update_own ON push_subscriptions
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY push_subscriptions_delete_own ON push_subscriptions
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());
