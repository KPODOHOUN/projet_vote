# Polices du rendu des billets

Instances statiques (graisses 400 et 700) des polices variables de `app/fonts/*.woff2`, produites avec
`fontTools.varLib.instancer` : le moteur d'image (`next/og`) ne lit ni le woff2 ni les polices variables.
Toutes sous licence SIL Open Font License 1.1 :

| Fichiers | Police | Auteurs |
| --- | --- | --- |
| `Inter-*.ttf` | Inter | Rasmus Andersson |
| `PlusJakartaSans-*.ttf` | Plus Jakarta Sans | Tokotype |
| `PlayfairDisplay-*.ttf` | Playfair Display | Claus Eggers Sørensen |
| `Unbounded-*.ttf` | Unbounded | NaN |
| `JetBrainsMono-*.ttf` | JetBrains Mono | JetBrains |

Utilisées par `app/t/[ticketId]/image/route.tsx` ; l'éditeur affiche les mêmes polices (variables CSS
de `app/layout.tsx`), voir `TICKET_FONTS` dans `lib/ticket-design.ts`.
