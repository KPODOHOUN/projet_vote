# Auth OTP — Design

**Date :** 2026-07-29  
**Statut :** Approuvé

## Objectif

Remplacer les magic links (`AuthEmailToken`) par un **OTP e-mail à 6 chiffres** pour la vérification d’inscription et la réinitialisation de mot de passe. Après OTP d’inscription réussi → **session automatique** (pas de re-login).

## Non-objectifs

- Ne pas toucher au vault OTP super-admin (`VaultUnlockChallenge`).
- OAuth Google/Facebook inchangé (email déjà prouvé par le provider).

## Modèle

```prisma
enum AuthOtpPurpose {
  EMAIL_VERIFICATION
  PASSWORD_RESET
}

model AuthOtpChallenge {
  id           String
  userId       String
  purpose      AuthOtpPurpose
  codeHash     String   // SHA-256 du code, jamais le brut
  expiresAt    DateTime
  attempts     Int      @default(0)
  maxAttempts  Int      @default(5)
  consumedAt   DateTime?
  lastSentAt   DateTime
  createdAt    DateTime
}
```

Settings `PlatformSetting` :
- `otp_ttl_seconds` (défaut 600)
- `otp_resend_delay_seconds` (défaut 60)

## API

| Endpoint | Comportement |
|----------|----------------|
| `POST /auth/register` | Crée tenant+user (offre incluse) ; envoie OTP ; **pas de session** |
| `POST /auth/verify-otp` | Vérifie code ; si EMAIL_VERIFICATION → `emailVerifiedAt` + **crée session** |
| `POST /auth/resend-otp` | Respecte délai renvoi ; anti-énumération |
| `POST /auth/login` | Si non vérifié → `EMAIL_NOT_VERIFIED` (front ouvre OTP) |
| `POST /auth/forgot-password` | Envoie OTP PASSWORD_RESET si compte vérifié |
| `POST /auth/reset-password` | Après OTP consommé (token de reset court) ou body `{ email, otp, password }` ; révoque sessions |

## Sécurité

- Code hashé SHA-256 ; TTL admin ; max 5 tentatives ; throttle Nest
- Mots de passe bcrypt cost 12
- Audit : `auth.login`, `auth.otp_verified`, `auth.otp_failed`

## UI

- Écran OTP unique (inscription, login non vérifié, forgot)
- Plus de dépendance `?token=` magic link
- Admin : TTL / délai renvoi ; users + vérifié ; historique connexions (AuditLog)

## États UI

loading / empty / error / success sur OTP, renvoi, reset.
