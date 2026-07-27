# feat: multi-PSP + payouts, organizer suite, candidate profiles & sharing, photo upload + UX elevations

> Branche `feat/multi-psp-payouts` → `main` · 79 commits · 173 fichiers · +17 852 / −1 102

## Résumé

Branche de fond regroupant plusieurs blocs, chacun conçu (spec) → planifié → exécuté
tâche-par-tâche en TDD, avec review ; specs/plans sous `docs/superpowers/`.

1. **Multi-PSP + payouts** — socle paiements provider-neutre, 3 PSP, service de versement.
2. **Suite organisateur** — invitations, réglages compte, recherche globale, notifications.
3. **Profils candidats & partage par candidat** — pages publiques par candidat (photo + votes).
4. **Upload de photo candidat (Cloudinary)** — upload signé, dégradation propre.
5. **Durcissement, design-QA & élévations UX** — a11y, états honnêtes, mobile, cohérence.

---

## 1. Paiements multi-PSP + payouts
- Port neutre `PspGateway` + types, **registry** + routing par organisateur/événement.
- Adaptateurs **FeexPay / FedaPay / KkiaPay** (payin + payout + status). `PaymentProvider` enum + colonnes de routing `Tenant`/`Event`.
- **Payouts** : `PayoutPeriod`/`Payout`/`PayoutLine`/`PayoutJobLock` + service (balance, job-lock, destination chiffrée AES-256-GCM, 6 couches anti-double-versement).
- **verify-by-pull** (ADR-017) — statut autoritatif par appel serveur→serveur, jamais le corps du webhook. KkiaPay payout = `UNCERTAIN` fail-safe (résolution admin).

## 2. Suite organisateur
- **Invitations** : `/dashboard/team` (créer/lister/révoquer) + lien d'acceptation à usage unique ; page publique `/accept-invitation/[token]`. e2e 3/3.
- **Réglages compte** : module `account` (mot de passe, email avec réémission JWT, **sessions actives** appareil/IP + révocation/« déconnecter les autres »). Migration `AuthSession.userAgent/ipAddress`. Changement mdp/email révoque les autres sessions (garde la courante).
- **Recherche globale** : `GET /search?q=` ILIKE **scopé tenant** (events/candidats/membres/paiements), gating membres+paiements hors `ORGANIZER_STAFF`. Palette typeahead header + page dédiée.
- **Notifications** : modèle `Notification` + module **cycle-safe** ; `create()` **best-effort** (ne casse jamais le métier) ; 4 déclencheurs (paiement, invitation, activation, payout). Cloche header (polling 30 s) + page.

## 3. Profils candidats & partage par candidat
- `Candidate.photoUrl` (migration). Compteur de votes **PAID-only** par candidat.
- `/e/{slug}` devient un **hub annuaire** (cartes-liens) ; **`/e/{slug}/c/{number}`** = profil + **cible du lien partagé**, grande photo, compteur, **vote verrouillé**, **OG = photo du candidat**.
- Endpoint public par-candidat + PATCH candidat (édition). Flux de paiement public extrait en hook partagé. e2e (annuaire→profil, deep-link, 404).

## 4. Upload de photo candidat (Phase 2, Cloudinary)
- `POST /uploads/signature` (auth-gardé) : signature **sha1 en crypto natif, sans SDK**. Le navigateur uploade le fichier **directement** vers Cloudinary (octets hors Cloud Run) → `secure_url` dans `photoUrl` (champ inchangé).
- Front : `PhotoUploadField` (upload + validation image/≤5 Mo + **repli coller-URL**) ; `CandidatePhoto` sert des images dimensionnées (`f_auto,q_auto`). **Dégrade proprement sans creds Cloudinary** (upload masqué, paste OK).

## 5. Durcissement, design-QA & élévations UX
- États d'erreur honnêtes (clé i18n revoke, surfaçage « tout marquer lu », EmptyState sessions).
- Mobile : `dvh` sur les shells (barre d'URL), reduced-motion sur les auto-rotations JS de la landing + témoignages **suspendables** (WCAG 2.2.2).
- Tunnel de vote élevé (cartes-radio candidats à l'origine, accent par-événement, suivi paiement humanisé).
- Aperçu dashboard élevé (skeleton, évènements récents, état vide) ; **cohérence loading-skeleton** sur 6 sous-pages.

---

## Sécurité & qualité
- **Isolation tenant** prouvée (recherche, notifications, candidats) ; **IDOR-safe** (sessions, notifications, markRead) ; upload **signé + auth-gardé** (pas de preset public).
- Bugs réels attrapés en review/TDD et corrigés (ex. `revokeOthers`, a11y palette, clé i18n revoke).
- **Suite backend 161/161** ; e2e par feature verts ; typecheck + lint (0 erreur) + build prod verts.

## Décisions / suivis pour les reviewers
- **Migrations à déployer staging/prod** : `AuthSession` device meta, `Notification`, **`candidate_photo_url`**, + migrations PSP/payouts. (Appliquées dev+test.)
- **Env Cloudinary** (pour activer l'upload) : `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET` (serveur) + `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` (client). Sans elles, l'app reste fonctionnelle via coller-URL.
- Cookie `vp_refresh` : `sameSite=lax` partout. Passer à `none` **uniquement** si web/API sur domaines racine différents (cross-site) + contrôle Origin sur `POST /auth/refresh`.
- KkiaPay payout = `UNCERTAIN` à valider avant prod.
- **e2e pré-existant** `organizer-flow.spec.ts` cassé (sélecteurs périmés, labels non accentués) — antérieur à cette branche, à corriger séparément.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
