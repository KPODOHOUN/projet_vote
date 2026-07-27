# Spec — Phase 2 : upload de photo candidat (Cloudinary)

**Date :** 2026-06-23
**Branche :** `feat/multi-psp-payouts`
**Statut :** design validé (brainstorming), à transformer en plan.

## Contexte & intention

Phase 1 ([[candidate-profiles-feature]]) a livré le champ `Candidate.photoUrl` alimenté
par une **URL collée**. Phase 2 ajoute l'**upload de fichier** : l'organisateur choisit
une image depuis son appareil, elle est stockée, et son URL alimente le **même champ
`photoUrl`**. Aucun changement du modèle ni des endpoints candidats : Phase 2 change
seulement la *source* de l'URL.

L'API tourne sur **GCP Cloud Run** (instances éphémères → pas de disque persistant). Le
stockage objet retenu est **Cloudinary** (CDN + optimisation auto, le plus simple à
opérer, un seul domaine connu). Upload **signé via l'API** (auth-gardé) pour éviter
l'abus d'un preset public.

## Décisions verrouillées (brainstorming)

1. **Stockage = Cloudinary.** Pas de bucket/IAM/CORS à provisionner.
2. **Upload signé via l'API** : endpoint auth-gardé renvoie une signature ; le navigateur
   uploade ensuite directement vers Cloudinary. Pas d'upload non signé.
3. **Signature en crypto natif** (sha1), **sans SDK Cloudinary** — déterministe, testable
   sans réseau, zéro nouvelle dépendance lourde.
4. **UI = upload + repli coller-URL.** Le paste reste (flexible + dégrade proprement si
   Cloudinary non configuré).
5. **`photoUrl` inchangé** (Phase 1) : l'upload remplit ce champ.

## Architecture

### Backend — `UploadsModule` (NestJS)

**Env** (`config/env.ts`) : `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
`CLOUDINARY_API_SECRET` (toutes optionnelles ; si l'une manque → upload « non configuré »).

**`UploadsService.signUpload()`** — pure, sans réseau :
- Paramètres signés : `{ timestamp: <now en s>, folder: "candidates" }`.
- `signature = sha1( "folder=candidates&timestamp=<ts>" + CLOUDINARY_API_SECRET )`
  (params triés alphabétiquement, joints par `&`, conformément au protocole Cloudinary).
- Retourne `{ cloudName, apiKey, timestamp, folder, signature }`.
- Si une creds manque → lève `ServiceUnavailableException("Upload non configuré.")`.

**`UploadsController`** : `POST /uploads/signature`, gardé par `AuthGuard` + `RolesGuard`
(`PLATFORM_ADMIN`, `ORGANIZER_OWNER`, `ORGANIZER_STAFF`) — seul un organisateur connecté
obtient une signature. Pas de body. Retourne l'objet ci-dessus.

> Le fichier ne transite **pas** par l'API : le navigateur POST le fichier directement à
> `https://api.cloudinary.com/v1_1/{cloudName}/image/upload` avec `api_key`, `timestamp`,
> `folder`, `signature`. Cloud Run ne voit jamais les octets.

### Frontend

**`lib/upload.ts`**
- `requestSignature(token)` → `POST /uploads/signature` → `CloudinarySignature`.
- `uploadCandidatePhoto(file, token)` : appelle `requestSignature`, construit le
  `FormData` (file + api_key + timestamp + folder + signature), POST à Cloudinary, renvoie
  `secure_url`. Lève une erreur claire si non-OK / non configuré.

**`PhotoUploadField`** (composant client)
- `<input type="file" accept="image/*">` + aperçu (via `CandidatePhoto`) + état
  (idle/uploading/done/error) + bouton.
- **Validation client avant upload** : type `image/*`, taille ≤ 5 Mo (sinon message, pas
  d'upload).
- Au succès : appelle `onUploaded(secure_url)` → le parent met `photoUrl`.
- **Repli** : un champ « ou coller une URL » reste visible. Si la config Cloudinary est
  absente (détectée via `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` vide), le bloc upload est
  désactivé avec une note, le paste reste utilisable.

**Intégration** : `dashboard/events/[eventId]/candidates/page.tsx` — remplace le champ
« URL de la photo » par `PhotoUploadField` (création + édition inline), qui pilote toujours
`photoUrl`. Le POST/PATCH candidats est **inchangé** (envoie `photoUrl`).

**`CandidatePhoto`** : si l'URL est une URL Cloudinary, insérer une transformation
(`/upload/w_<n>,f_auto,q_auto/`) pour servir une image dimensionnée/optimisée (sm→160,
lg→640). Les URLs non-Cloudinary (paste, Phase 1) sont rendues telles quelles. Reste un
`<img>` (URLs d'hôtes variés possibles).

### Config / env

- Serveur : `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
- Client : `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` (pour construire l'URL d'upload + détecter
  la disponibilité). `api_key`/signature viennent de l'endpoint signé (jamais le secret au
  client).
- Documenter ces variables (`.env.example` si présent ; sinon README/commentaire env.ts).

## Unités (responsabilité unique)

| Unité | Rôle | Dépend de |
|---|---|---|
| `UploadsService.signUpload` | produit signature sha1 + params | env, crypto |
| `UploadsController` | endpoint auth-gardé | UploadsService, AuthGuard |
| `lib/upload.ts` | signature + POST Cloudinary → secure_url | apiFetch, fetch |
| `PhotoUploadField` | UI upload + validation + repli paste | lib/upload, CandidatePhoto |
| `CandidatePhoto` (maj) | transform Cloudinary pour images légères | — |

## Gestion d'erreurs

- Creds manquantes → `signUpload` 503 ; côté front, bloc upload désactivé + paste-URL OK
  (dev/test fonctionnent sans Cloudinary).
- Fichier non-image ou > 5 Mo → message client, pas d'appel réseau.
- Échec Cloudinary (4xx/5xx) → message + possibilité de réessayer ; `photoUrl` non modifié.
- Endpoint signature sans auth → 401 (guard).

## Tests

- **Backend (unitaire/vraie DB)** : `signUpload` renvoie une signature sha1 **déterministe**
  pour un timestamp/secret donnés (vérifiée contre un calcul de référence) ; lève 503 si
  une cred manque. Endpoint : **401 sans token**, 200 avec token organisateur.
- **Front** : l'upload réel Cloudinary n'est **pas** e2e-testé (dépendance externe, comme
  le PSP). La validation client (type/taille) peut être testée unitairement si utile.

## Hors périmètre (YAGNI)

- Crop/rotation/édition d'image, galerie, suppression des anciennes images sur Cloudinary.
- Migration des `photoUrl` Phase 1, modération de contenu, upload multiple.
- next/image (le `<img>` + transformation URL Cloudinary suffit ; Cloudflare Pages
  compliquerait le loader).

## Références
[[candidate-profiles-feature]] (Phase 1, champ photoUrl), [[multi-psp-three-providers]]
(pattern « creds en env, dégradation si absentes »).
