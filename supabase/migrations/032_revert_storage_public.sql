-- Migration 032: Revenir à des buckets publics
-- La migration 030 a rendu les buckets privés, mais plusieurs parties du code
-- (upload logo entreprise, documents chantier, photos de visite, documents
-- points de contrôle) utilisent encore `getPublicUrl()` et stockent l'URL
-- publique complète en base. Avec des buckets privés, ces URLs renvoient
-- "Bucket not found" (comportement Supabase : les buckets privés sont masqués
-- au endpoint public).
--
-- Tant que le code n'est pas entièrement migré vers des signed URLs
-- (getPublicUrl → createSignedUrl partout, format path au lieu d'URL complète,
-- rafraîchissement côté client/serveur), on rétablit les buckets publics
-- pour restaurer le fonctionnement complet de l'app.

UPDATE storage.buckets
SET public = true
WHERE id IN ('rapports', 'visite-photos');
