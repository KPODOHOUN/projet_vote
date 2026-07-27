## ADR-012 : File storage
**Statut** : Accepté  
**Date** : 2026-04-28

### Décision
Cloudflare R2 (S3-compatible) pour logos d’événements, médias et exports.

### Règles
- URLs signées temporaires pour lecture/écriture.
- Validation MIME + taille max côté API avant upload.
