-- Migration 031: Garantir l'existence des buckets Storage (idempotent)
-- Correction du bug "Bucket not found" lors de la génération du PDF de rapport.
-- Les migrations 023 (création) et 030 (passage en privé) peuvent ne pas avoir
-- été appliquées sur certaines instances (Supabase hébergé). Cette migration
-- garantit que les deux buckets existent, en privé, avec toutes les policies RLS.

-- ============================================================
-- 1. Création / mise à jour des buckets (privés, PDFs et photos sensibles)
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('rapports', 'rapports', false)
ON CONFLICT (id) DO UPDATE SET public = false;

INSERT INTO storage.buckets (id, name, public)
VALUES ('visite-photos', 'visite-photos', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- ============================================================
-- 2. Policies RLS — bucket rapports
-- ============================================================

-- Upload : authentifié uniquement
DROP POLICY IF EXISTS "rapports_insert" ON storage.objects;
CREATE POLICY "rapports_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'rapports');

-- Lecture : authentifié (accès via signed URL depuis le serveur)
DROP POLICY IF EXISTS "rapports_select" ON storage.objects;
CREATE POLICY "rapports_select" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'rapports');

-- Update : authentifié (upsert lors de la régénération)
DROP POLICY IF EXISTS "rapports_update" ON storage.objects;
CREATE POLICY "rapports_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'rapports');

-- Delete : admin ou inspecteur assigné au chantier
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

-- ============================================================
-- 3. Policies RLS — bucket visite-photos
-- ============================================================

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
