## ADR-018 : Vérification e-mail — grandfathering des comptes antérieurs

**Statut** : Accepté
**Date** : 2026-07-07
**Décideurs** : Tech Lead, Security Engineer
**Lié à** : [ADR-013](./ADR-013-email.md) (e-mail), [ADR-004](./ADR-004-auth-rbac.md) (auth/RBAC)

### Contexte

La vérification d'adresse e-mail après inscription a été introduite par la
migration `20260706180000_auth_email_tokens`. Le login est désormais bloqué
tant que `User.emailVerifiedAt` est `null` (`auth.service.ts#login`).

Cette migration inclut un **backfill** :

```sql
UPDATE "User" SET "emailVerifiedAt" = "createdAt" WHERE "emailVerifiedAt" IS NULL;
```

Conséquence : **tous les comptes créés avant la feature sont marqués vérifiés**
rétroactivement. Ils peuvent donc se connecter sans jamais avoir confirmé leur
e-mail. L'audit du flux d'authentification a signalé ce point comme une
incohérence potentielle : la contrainte de vérification n'est pas appliquée
uniformément à toute la base d'utilisateurs.

### Options évaluées

| Option | Pros | Cons |
|---|---|---|
| A — **Grandfathering assumé** : les comptes antérieurs restent vérifiés | Aucun utilisateur bloqué ; aucune dépendance à la fiabilité de l'envoi e-mail ; zéro code supplémentaire | La contrainte n'est pas rétroactive (asymétrie documentée) |
| B — Forcer la re-vérification : repasser les comptes non confirmés à `null` | Contrainte uniforme | Bloque des utilisateurs existants si Resend est indisponible ; l'envoi e-mail est best-effort, pas garanti |

### Décision

**Option A retenue : grandfathering assumé.**

Les comptes créés avant l'introduction de la feature restent vérifiés et peuvent
se connecter sans re-vérification. **Tout nouveau compte** passe par le flux
normal : e-mail de vérification à l'inscription, login bloqué tant que
`emailVerifiedAt` est `null`.

Justification :
- La plateforme est en phase de **déploiement test** (seed multi-rôles récent) :
  le volume de comptes réels antérieurs est faible ou nul.
- Forcer une re-vérification dépendrait de la fiabilité de l'envoi e-mail
  (Resend), qui est **best-effort** : `MailService.send()` ne lève jamais et
  logge les échecs en niveau `error`. Bloquer des comptes sur un canal non
  garanti créerait un risque de verrouillage sans recours.

### Conséquences

- Aucun code de migration supplémentaire n'est ajouté.
- L'envoi d'e-mail reste best-effort ; la page `check-email` offre un renvoi
  throttlé (5/min via `POST /auth/resend-verification`).
- Si un afflux de comptes réels antérieurs posait problème à l'avenir, un script
  ciblé pourrait repasser des comptes **précis** à non-vérifié (hors périmètre
  de cet ADR).
- La politique de mot de passe renforcée (10+ caractères, 2 classes) s'applique
  uniquement aux **nouveaux** mots de passe (inscription, reset, invitation) ;
  le login continue d'accepter les mots de passe existants.
