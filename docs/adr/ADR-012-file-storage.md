## ADR-012 : File storage
**Statut** : Remplacé (2026-10-25) — voir « Mise à jour » en fin de document  
**Date** : 2026-04-28

### Décision
Cloudflare R2 (S3-compatible) pour logos d’événements, médias et exports.

### Règles
- URLs signées temporaires pour lecture/écriture.
- Validation MIME + taille max côté API avant upload.

### Mise à jour (2026-10-25)
R2 n'a pas été retenu. Le code en vigueur utilise **Cloudinary** en upload signé
(`apps/api/src/uploads/`, `apps/web/lib/upload.ts`) : l'API signe, le navigateur envoie
directement à Cloudinary, l'API valide l'URL renvoyée. Un stockage disque local existe
uniquement pour le développement. Les règles de validation (MIME, taille) restent valables.

