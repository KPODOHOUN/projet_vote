## ADR-011 : Realtime (WebSocket vs SSE vs polling)
**Statut** : Accepté  
**Date** : 2026-04-28

### Décision
WebSocket pour dashboards organisateurs/admin + fallback SSE pour vues publiques à faible coût.

### Règles
- Polling uniquement en dernier recours.
- Reconnexion exponentielle et throttling client obligatoires.
