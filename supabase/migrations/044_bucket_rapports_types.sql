-- 044: Aligner le bucket `rapports` sur la whitelist de l'application
--
-- Le durcissement de juillet (audit v3) avait restreint `rapports` à
-- `application/pdf`. Or l'application autorise pdf, doc, docx, xls, xlsx, jpg,
-- jpeg et png (`src/lib/utils/file-validation.ts`) et écrit tous ces fichiers
-- dans ce bucket : documents de chantier, base documentaire et logo
-- d'entreprise. Tout envoi non-PDF était donc rejeté par le stockage avec un
-- 400 — l'upload de logo était cassé depuis juillet, et les documents de
-- chantier limités aux seuls PDF.
--
-- On ne relâche rien au-delà de ce que le code valide déjà : mêmes types que
-- `ALLOWED_MIME_TYPES`, en plus de la validation d'extension et des magic bytes
-- côté application.

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png'
]
WHERE id = 'rapports';
