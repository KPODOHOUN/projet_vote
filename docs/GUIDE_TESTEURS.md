# Guide du testeur — SHADOMA Votes (version de test)

Merci de participer au test de **SHADOMA Votes**, la plateforme de vote payant par Mobile Money.
Ce guide vous explique quoi tester et comment. Comptez **15 à 20 minutes**.

> ⚠️ **Aucun argent réel n'est débité** sur cette version de test.
> Les paiements de vote peuvent échouer volontairement (prestataire non configuré) — c'est normal.

---

## Liens

| Espace | Lien |
| --- | --- |
| Site (accueil) | https://shadoma-votes.vercel.app |
| Inscription | https://shadoma-votes.vercel.app/register |
| Connexion | https://shadoma-votes.vercel.app/login |
| Tableau de bord (après connexion) | https://shadoma-votes.vercel.app/dashboard |
| Concours de démo | https://shadoma-votes.vercel.app/e/miss-campus-2026 |
| Résultats du concours démo | https://shadoma-votes.vercel.app/e/miss-campus-2026/results |

Pour une candidate du concours démo : ouvrez le concours → cliquez sur une candidate → vous obtenez son **lien direct** (partageable).

---

## Avant de commencer — ce qu'il faut savoir

### Environnement de test

- **Aucun argent réel** n'est débité. C'est une démonstration, pas la version commerciale.
- Les **votes payants** (Mobile Money) peuvent **échouer** ou rester en attente — c'est **attendu** (prestataire en mode test, clés factices).
- L'**activation d'un concours** est **gratuite (0 FCFA)** : vous pouvez publier un concours sans payer.
- Le concours démo **Miss Campus 2026** a déjà des votes et un classement — utile pour tester l'affichage sans payer.

### Premier chargement parfois lent

L'API tourne sur un hébergeur gratuit qui **s'endort** après ~15 minutes sans visite.

- Le **premier clic** après une pause peut prendre **30 à 60 secondes**.
- Si une page reste blanche ou charge longtemps : **attendez**, puis **rafraîchissez** une fois.
- Les pages suivantes sont en général **rapides**.

### Données et confidentialité

- Environnement de **test** : les données peuvent être **réinitialisées** sans préavis.
- Ne saisissez pas de **vrais numéros Mobile Money** si vous voulez éviter toute confusion (même sans débit réel).
- Créez un **mot de passe de test** — ne réutilisez pas un mot de passe personnel.

---

## Comptes

### Option recommandée : créez le vôtre

1. Allez sur **/register**
2. Choisissez un **nom d'organisation**, votre **e-mail** et un **mot de passe** (8 caractères min.)
3. Acceptez la politique de confidentialité → vous êtes **organisateur** de votre propre espace

> Pas de vérification d'e-mail pour les comptes démo pré-créés. Les **nouveaux comptes** reçoivent un e-mail de confirmation à l'inscription.

### Comptes de démo (optionnels)

Mot de passe : **`SecurePass123!`**

| Rôle | E-mail | Usage |
| --- | --- | --- |
| Organisateur | `organisateur@demovote.africa` | Concours « Miss Campus » déjà prêt |
| Équipe (staff) | `equipe@demovote.africa` | Tester les droits limités d'un membre d'équipe |

> Pour voter en tant que **votant**, aucun compte n'est nécessaire.

---

## Ce qui fonctionne / ce qui peut échouer

### Fonctionne normalement (à tester en priorité)

- Navigation sur **mobile** (portrait) et **ordinateur**
- **Inscription** et **connexion**
- Création d'un concours, ajout de candidat(e)s (photo par URL)
- **Activation** du concours (gratuite, immédiate)
- Page publique du concours, **classement**, **résultats**
- Tableau de bord organisateur
- Invitation d'un membre d'équipe (menu Équipe)
- Compte **staff** avec droits limités

### Peut échouer (comportement attendu, pas un bug bloquant)

- **Paiement d'un vote** via Mobile Money → message d'erreur ou échec possible
- **Confirmation de paiement** en temps réel → parfois lente ou incomplète en mode test

Si le paiement échoue mais que le reste du parcours est fluide, **notez le message affiché** — c'est un retour utile.

---

## Ce que nous vous demandons de tester

### 1. Parcours VOTANT

1. Ouvrez le **concours de démo** (ou le lien public de votre propre concours).
2. Choisissez une candidate → cliquez sur **Voter**.
3. Testez le parcours de paiement (il peut échouer sur cette version — notez le message affiché).
4. Vérifiez l'affichage des **résultats** : https://shadoma-votes.vercel.app/e/miss-campus-2026/results
5. Testez le **partage du lien d'une candidate**.

Testez aussi :
- l'affichage sur **téléphone** (portrait) et sur **ordinateur** ;
- navigateurs : Chrome, Safari ou Firefox.

### 2. Parcours ORGANISATEUR

1. **Inscrivez-vous** sur `/register` *(ou connectez-vous avec le compte démo organisateur)*.
2. Créez un **nouveau concours** (titre, prix du vote, dates).
3. Ajoutez **2–3 candidat(e)s** (nom, photo par URL).
4. Personnalisez la page (couleur, logo) et **activez** le concours (gratuit, 0 FCFA).
5. Ouvrez le **lien public** et testez un vote.
6. Consultez le **tableau de bord**.
7. Testez l'**invitation d'un membre d'équipe** (menu Équipe).

### 3. Parcours ÉQUIPE (staff)

1. Connectez-vous avec `equipe@demovote.africa` / `SecurePass123!`
2. Vérifiez que vous voyez les concours de l'organisateur démo **avec des droits limités**.

Vous devez pouvoir :
- voir les concours, candidates et résultats ;

Vous ne devez **pas** pouvoir :
- modifier les réglages sensibles de l'organisation ;
- accéder aux reversements / paiements plateforme ;
- supprimer l'organisation ou des données critiques.

Si vous accédez à quelque chose qui devrait être interdit → **signalez-le immédiatement** (bug de sécurité).

---

## Appareils et navigateurs

Testez de préférence sur :

- **Téléphone** — Android (Chrome) ou iPhone (Safari), mode portrait
- **Ordinateur** — Chrome, Firefox ou Safari

Sur mobile, surveillez :
- textes lisibles, boutons cliquables ;
- rien qui déborde horizontalement ;
- formulaire de vote utilisable au pouce.

---

## Comment nous remonter un problème

Pour **chaque bug ou remarque**, notez si possible :

1. **Rôle utilisé** (votant / organisateur / équipe).
2. **Appareil** (téléphone Android/iPhone, ordinateur) + navigateur (Chrome, Safari…).
3. **URL** de la page (copier-coller la barre d'adresse).
4. **Ce que vous faisiez** (les étapes, dans l'ordre).
5. **Ce que vous attendiez** vs **ce qui s'est passé**.
6. Une **capture d'écran** ou courte vidéo si possible.

Envoyez le tout à : **[à compléter — e-mail ou groupe WhatsApp / Telegram]**

---

## Checklist rapide

- [ ] Le site s'affiche bien sur mon téléphone (rien qui déborde).
- [ ] Le premier chargement lent (cold start) se résout après attente + refresh.
- [ ] Je peux m'inscrire et accéder au tableau de bord.
- [ ] En tant qu'organisateur, je peux créer et **activer gratuitement** un concours.
- [ ] Le concours démo affiche les candidates et un classement.
- [ ] La page **résultats** du concours démo fonctionne.
- [ ] Le compte staff a des droits **limités** (pas d'accès admin complet).
- [ ] Si le paiement vote échoue, un **message clair** s'affiche.
- [ ] Les textes sont clairs, sans faute, cohérents (« SHADOMA Votes » partout).
- [ ] Je n'ai jamais été bloqué sans message d'explication.

---

## Message court à copier-coller (pour inviter un testeur)

```
Salut ! On teste SHADOMA Votes (plateforme de vote en ligne).

🔗 Site : https://shadoma-votes.vercel.app
🗳️ Concours démo : https://shadoma-votes.vercel.app/e/miss-campus-2026

⏱️ 15–20 min. Pas d'argent réel débité.
Le 1er chargement peut être lent (30–60 s) — c'est normal, rafraîchis si besoin.

Tu peux t'inscrire librement sur /register
ou utiliser le compte démo : organisateur@demovote.africa / SecurePass123!

Guide complet : [joindre ce fichier ou le lien]

Retours bugs → [ton contact]
Merci !
```

---

Merci beaucoup — vos retours rendent la plateforme meilleure.
