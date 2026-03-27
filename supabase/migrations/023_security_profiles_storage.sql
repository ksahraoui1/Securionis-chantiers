-- 023: Sécurité renforcée — profiles (bloquer changement de rôle) + Storage RLS

-- ============================================================
-- 1. Empêcher les utilisateurs de modifier leur propre rôle
-- ============================================================
-- Remplacer la politique profiles_update_own trop permissive
-- par une politique qui exclut le champ "role" et "entreprise_id"

DROP POLICY IF EXISTS profiles_update_own ON profiles;

-- L'utilisateur peut modifier son profil MAIS PAS son rôle ni son entreprise
-- On utilise WITH CHECK pour garantir que role et entreprise_id restent inchangés
CREATE POLICY profiles_update_own ON profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (
        id = auth.uid()
        AND role = (SELECT role FROM profiles WHERE id = auth.uid())
        AND (
            entreprise_id IS NOT DISTINCT FROM
            (SELECT entreprise_id FROM profiles WHERE id = auth.uid())
        )
    );

-- ============================================================
-- 2. Storage RLS — bucket rapports
-- ============================================================
-- Note: Ces politiques doivent être appliquées via le dashboard Supabase
-- ou via l'API. Les instructions SQL ci-dessous sont pour documentation.
-- Supabase Storage utilise la table storage.objects avec des policies.

-- Politique SELECT : tout utilisateur authentifié peut lire les fichiers
-- (les URLs publiques sont déjà accessibles sans auth)
INSERT INTO storage.buckets (id, name, public)
VALUES ('rapports', 'rapports', true)
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public)
VALUES ('visite-photos', 'visite-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Policies sur le bucket rapports
-- Upload : authentifié uniquement
DROP POLICY IF EXISTS "rapports_insert" ON storage.objects;
CREATE POLICY "rapports_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'rapports');

-- Read : public (bucket public)
DROP POLICY IF EXISTS "rapports_select" ON storage.objects;
CREATE POLICY "rapports_select" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'rapports');

-- Update : authentifié
DROP POLICY IF EXISTS "rapports_update" ON storage.objects;
CREATE POLICY "rapports_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'rapports');

-- Delete : admin uniquement
DROP POLICY IF EXISTS "rapports_delete" ON storage.objects;
CREATE POLICY "rapports_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'rapports'
        AND (
            public.user_role() = 'administrateur'
            OR (storage.foldername(name))[1] IN (
                SELECT ci.chantier_id::text FROM chantier_inspecteurs ci
                WHERE ci.inspecteur_id = auth.uid()
            )
        )
    );

-- Policies sur le bucket visite-photos
DROP POLICY IF EXISTS "photos_insert" ON storage.objects;
CREATE POLICY "photos_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'visite-photos');

DROP POLICY IF EXISTS "photos_select" ON storage.objects;
CREATE POLICY "photos_select" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'visite-photos');

DROP POLICY IF EXISTS "photos_update" ON storage.objects;
CREATE POLICY "photos_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'visite-photos');

DROP POLICY IF EXISTS "photos_delete" ON storage.objects;
CREATE POLICY "photos_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'visite-photos'
        AND (
            public.user_role() = 'administrateur'
            OR (storage.foldername(name))[1] IN (
                SELECT ci.chantier_id::text FROM chantier_inspecteurs ci
                WHERE ci.inspecteur_id = auth.uid()
            )
        )
    );
