# Cahier des charges — nouvelle page d'accueil SHADOMA Votes

## Le produit (faits réels, ne rien inventer)
SHADOMA Votes est une plateforme de **concours à vote payant** pour l'Afrique francophone (Bénin d'abord), montants en **FCFA (XOF)**.
- Un **organisateur** (comité Miss/Mister campus, festival, école, chorale, foire, média…) crée un compte, crée son concours (titre, dates, prix d'une voix), ajoute ses candidats, puis partage un lien.
- Chaque concours a son **mini-site public** : page d'accueil du concours, profil de chaque candidat, résultats en direct, billetterie. L'organisateur choisit l'apparence parmi **17 styles de page** (Affiche, Soirée, Billet, Couronne, Magazine, Pop, Terroir, Stade, Line-up, Diplôme, Marché, Menu, Wax, Campus, Badge, Story, Sanctuaire) et 88 modèles, avec son logo et sa couleur.
- Le **votant n'a pas de compte** : il choisit un candidat, un nombre de voix, saisit son numéro **Mobile Money** (MTN, Moov, Celtiis…) et confirme sur son téléphone. La voix compte seulement quand le paiement est confirmé.
- **SHADOMA encaisse** pour l'organisateur. L'argent arrive dans son **portefeuille** (une partie en réserve jusqu'à la clôture). L'organisateur **demande un retrait** ; un administrateur SHADOMA le valide et envoie l'argent sur son Mobile Money. Pas de virement automatique.
- Billetterie : billets avec QR code, payés en Mobile Money.
- Paiement : FeexPay et FedaPay (KkiaPay et SebPay : bientôt).

## Interdits
- Aucun chiffre inventé, aucun témoignage, aucun logo client.
- Pas de promesse fausse (pas de « virement automatique »).
- Pas de dégradé violet générique, pas d'emoji en icône, pas de faux téléphone dessiné à la main : utiliser les vraies captures fournies, posées avec un léger contour/ombre.
- Texte court, compréhensible sans réfléchir. Français, vouvoiement.

## Charte (DESIGN.md du projet)
- Polices : **Plus Jakarta Sans** (titres 700–800, jamais d'italique) + **Inter** (texte), via Google Fonts.
- Action `#4F46E5` ; encre `#0F172A` ; texte d'appui `#475569` ; fond `#F8FAFC` ; filets `#E2E8F0` ; or `#D97706` réservé au « premier / classement » ; succès `#047857`.
- Arrondis 6–12 px, filets 1 px plutôt que des cartes partout, ombres légères.
- Contraste ≥ 4,5:1, corps ≥ 16 px, cibles tactiles ≥ 44 px.

## Contenu (ordre libre)
1. En-tête : « SHADOMA », liens « Comment ça marche », « Tarifs », « Se connecter », bouton « Créer un compte ».
2. Accroche en une phrase sur ce que fait la plateforme + une phrase d'appui + bouton « Créer mon concours » + lien « Voir un exemple ».
3. Montrer le produit avec les **vraies captures** des mini-sites : chaque concours a sa propre page, au style choisi (atout visuel n°1).
4. Comment ça marche en 3–4 étapes courtes (créer → partager → on vote en Mobile Money → vous retirez).
5. L'argent en clair : SHADOMA encaisse, portefeuille, retrait validé par un humain, la voix compte une fois payée.
6. Pour qui : Miss/Mister campus, festivals, écoles, chorales, foires, médias.
7. Trois questions : votant sans compte (un numéro Mobile Money suffit) ; quand la voix compte (paiement confirmé) ; quand je reçois l'argent (après ma demande de retrait, validée par SHADOMA).
8. Appel final + pied de page (Mentions légales, Confidentialité, Conditions, Cookies, © 2026 SHADOMA).

## Images réelles (`assets/`)
`couronne-home.jpg`, `soiree-home.jpg`, `affiche-home.jpg`, `wax-home.jpg`, `stade-home.jpg` (accueils de concours, pleine page, 1200 px de large), `couronne-results.jpg` (résultats), `campus-mobile.jpg` (mini-site sur téléphone). Recadrer via `object-fit`/`object-position`, jamais déformer.

## Livraison
- Un fichier HTML autonome dans `design-demos/accueil/`, images en chemins relatifs `assets/...`.
- Conçu pour 1440 px, propre à 390 px (aucun défilement horizontal).
- Captures : `npx playwright screenshot --full-page --viewport-size=1440,900 file://<fichier> <nom>-1440.png` et `--viewport-size=390,844` → `<nom>-390.png`. Les regarder, corriger, puis rendre.
