-- =====================================================================
-- FIX IMMÉDIAT — Erreur "Bucket not found" lors de la génération du PDF
-- =====================================================================
-- À copier-coller dans le SQL Editor de Supabase (Dashboard > SQL Editor),
-- puis cliquer sur "Run". Script 100% idempotent, peut être exécuté plusieurs fois.
--
-- Ce script crée (ou réactive) les deux buckets Storage nécessaires :
--   - rapports      : PDFs de rapports de visite
--   - visite-photos : photos prises lors des visites
-- ... et applique les policies RLS associées.
--
-- Une fois exécuté, les boutons "Régénérer le PDF" et l'upload de photos
-- doivent refonctionner immédiatement.
-- =====================================================================

-- 1. Création des buckets (privés)
INSERT INTO storage.buckets (id, name, public)
VALUES ('rapports', 'rapports', false)
ON CONFLICT (id) DO UPDATE SET public = false;

INSERT INTO storage.buckets (id, name, public)
VALUES ('visite-photos', 'visite-photos', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- 2. Policies bucket "rapports"
DROP POLICY IF EXISTS "rapports_insert" ON storage.objects;
CREATE POLICY "rapports_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'rapports');

DROP POLICY IF EXISTS "rapports_select" ON storage.objects;
CREATE POLICY "rapports_select" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'rapports');

DROP POLICY IF EXISTS "rapports_update" ON storage.objects;
CREATE POLICY "rapports_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'rapports');

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

-- 3. Policies bucket "visite-photos"
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

-- 4. Vérification (doit retourner 2 lignes : rapports + visite-photos, public=false)
SELECT id, name, public FROM storage.buckets
WHERE id IN ('rapports', 'visite-photos');
