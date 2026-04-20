-- 030: Storage — rendre les buckets privés
-- Les PDFs de rapports et les photos de visite contiennent des données sensibles.
-- Accès uniquement via signed URLs générées server-side (durée max 1h).
-- Les rapport_url stockées en base passent du format URL publique au format chemin (CHANTIER_ID/filename).

UPDATE storage.buckets
SET public = false
WHERE id IN ('rapports', 'visite-photos');
