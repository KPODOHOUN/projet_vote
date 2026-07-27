# Candidate Photo Upload (Phase 2, Cloudinary) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à l'organisateur d'uploader une photo de candidat (fichier) via Cloudinary (upload signé par l'API), l'URL résultante alimentant le champ `photoUrl` existant — avec repli coller-URL.

**Architecture:** API NestJS : endpoint auth-gardé `POST /uploads/signature` qui renvoie une signature Cloudinary (sha1, crypto natif, sans SDK). Le navigateur uploade le fichier **directement** vers Cloudinary (les octets ne passent pas par Cloud Run) et reçoit `secure_url`, posée dans `photoUrl`. Dégrade proprement sans creds Cloudinary (upload masqué, coller-URL conservé).

**Tech Stack:** NestJS, Zod (env), crypto (sha1), Next.js (client components), node:test.

## Global Constraints

- ZERO fake data. TypeScript strict. Couche publique/app `vp-*` conservée.
- Tests API = **vraie DB** `votezpro_test` ; lancer un fichier en isolation : `cd apps/api && DATABASE_URL="postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test" npx tsx --test src/<file>.test.ts`.
- **Pas de SDK Cloudinary** : signature = `sha1(<params triés "k=v" joints par "&"> + CLOUDINARY_API_SECRET)`, hex.
- Creds Cloudinary **optionnelles** (`z.string().default("")`) ; si une manque → `ServiceUnavailableException("Upload non configuré.")`.
- Le champ `photoUrl` (Phase 1) et les endpoints candidats **ne changent pas**.
- Validation client upload : `image/*`, ≤ 5 Mo.
- Folder Cloudinary : `candidates`.
- Commits terminés par `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Env Cloudinary + UploadsService (signature) + test unitaire

**Files:**
- Modify: `apps/api/src/config/env.ts` (ajouter 3 vars dans `envSchema`)
- Create: `apps/api/src/uploads/uploads.service.ts`
- Create: `apps/api/src/uploads/uploads.service.test.ts`

**Interfaces:**
- Produces:
  - `env.CLOUDINARY_CLOUD_NAME | CLOUDINARY_API_KEY | CLOUDINARY_API_SECRET: string` (défaut `""`).
  - `UploadsService.computeSignature(params: Record<string, string | number>, apiSecret: string): string` (statique, pure).
  - `UploadsService.signUpload(): { cloudName: string; apiKey: string; timestamp: number; folder: string; signature: string }` — throw `ServiceUnavailableException` si creds manquantes.

- [ ] **Step 1: Écrire le test**

Create `apps/api/src/uploads/uploads.service.test.ts` :
```ts
import "reflect-metadata";
import { test } from "node:test";
import * as assert from "node:assert/strict";
import { createHash } from "crypto";
import { ServiceUnavailableException } from "@nestjs/common";
import { UploadsService } from "./uploads.service";

test("computeSignature: sha1 des params triés + secret (protocole Cloudinary)", () => {
  const params = { timestamp: 1_700_000_000, folder: "candidates" };
  const expected = createHash("sha1")
    .update("folder=candidates&timestamp=1700000000" + "the-secret")
    .digest("hex");
  assert.equal(UploadsService.computeSignature(params, "the-secret"), expected);
});

test("signUpload: 503 quand les creds Cloudinary sont absentes (défaut env de test)", () => {
  const service = new UploadsService();
  assert.throws(() => service.signUpload(), (e) => e instanceof ServiceUnavailableException);
});
```

- [ ] **Step 2: Lancer → échec**

Run: `cd apps/api && DATABASE_URL="postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test" npx tsx --test src/uploads/uploads.service.test.ts`
Expected: FAIL (`Cannot find module './uploads.service'`).

- [ ] **Step 3: Ajouter les vars d'env**

Dans `apps/api/src/config/env.ts`, à l'intérieur de `z.object({ … })` (après le bloc KkiaPay, avant la fin de l'objet) :
```ts
  // -- Cloudinary (Phase 2 upload photo candidat) --------------------------
  // Optionnelles : si l'une manque, l'upload est "non configuré" (l'app reste
  // fonctionnelle via le coller-URL). Le secret ne quitte jamais le serveur.
  CLOUDINARY_CLOUD_NAME: z.string().default(""),
  CLOUDINARY_API_KEY: z.string().default(""),
  CLOUDINARY_API_SECRET: z.string().default(""),
```

- [ ] **Step 4: Implémenter le service**

Create `apps/api/src/uploads/uploads.service.ts` :
```ts
import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { createHash } from "crypto";
import { env } from "../config/env";

export type UploadSignature = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  signature: string;
};

@Injectable()
export class UploadsService {
  private readonly folder = "candidates";

  /** Signature Cloudinary : sha1(params triés "k=v"&… + api_secret). Pure/testable. */
  static computeSignature(params: Record<string, string | number>, apiSecret: string): string {
    const toSign = Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join("&");
    return createHash("sha1").update(toSign + apiSecret).digest("hex");
  }

  signUpload(): UploadSignature {
    const cloudName = env.CLOUDINARY_CLOUD_NAME;
    const apiKey = env.CLOUDINARY_API_KEY;
    const apiSecret = env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) {
      throw new ServiceUnavailableException("Upload non configuré.");
    }
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = UploadsService.computeSignature({ folder: this.folder, timestamp }, apiSecret);
    return { cloudName, apiKey, timestamp, folder: this.folder, signature };
  }
}
```

- [ ] **Step 5: Lancer → succès**

Run: `cd apps/api && DATABASE_URL="postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test" npx tsx --test src/uploads/uploads.service.test.ts`
Expected: PASS (2/2).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/config/env.ts apps/api/src/uploads/uploads.service.ts apps/api/src/uploads/uploads.service.test.ts
git commit -m "feat(api): Cloudinary upload signature service (sha1, no SDK)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: UploadsController + module + wiring + intégration (401/503)

**Files:**
- Create: `apps/api/src/uploads/uploads.controller.ts`
- Create: `apps/api/src/uploads/uploads.module.ts`
- Modify: `apps/api/src/app.module.ts` (imports + liste modules)
- Modify: `apps/api/src/app.integration.test.ts` (assertions 401 + 503)
- Modify: `apps/api/package.json` (ajouter le test compilé à `test` et `test:coverage`)

**Interfaces:**
- Consumes: `UploadsService.signUpload()` (Task 1).
- Produces: route `POST /uploads/signature` gardée `AuthGuard`+`RolesGuard` (`PLATFORM_ADMIN`, `ORGANIZER_OWNER`, `ORGANIZER_STAFF`).

- [ ] **Step 1: Écrire le test d'intégration (401 sans token, 503 sans creds)**

Dans `apps/api/src/app.integration.test.ts`, ajouter (après le bloc candidats, à un endroit où `authHeader` est défini) :
```ts
  // Phase 2 — endpoint de signature d'upload : gardé par auth, 503 si Cloudinary
  // non configuré (cas par défaut en test → prouve le wiring + le guard).
  const unauthSign = await request(app.getHttpServer()).post("/api/v1/uploads/signature");
  assert.equal(unauthSign.status, 401);
  const authedSign = await request(app.getHttpServer())
    .post("/api/v1/uploads/signature")
    .set("Authorization", authHeader);
  assert.equal(authedSign.status, 503);
```

- [ ] **Step 2: Implémenter le controller**

Create `apps/api/src/uploads/uploads.controller.ts` :
```ts
import { Controller, Post, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AuthGuard } from "../auth/auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { UploadsService } from "./uploads.service";

@Controller("uploads")
@UseGuards(AuthGuard, RolesGuard)
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post("signature")
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.ORGANIZER_OWNER, UserRole.ORGANIZER_STAFF)
  signature() {
    return this.uploadsService.signUpload();
  }
}
```

- [ ] **Step 3: Implémenter le module**

Create `apps/api/src/uploads/uploads.module.ts` :
```ts
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { UploadsController } from "./uploads.controller";
import { UploadsService } from "./uploads.service";

@Module({
  imports: [AuthModule],
  controllers: [UploadsController],
  providers: [UploadsService]
})
export class UploadsModule {}
```
> Vérifier que `AuthModule` exporte ce dont `AuthGuard` a besoin (suivre le pattern d'un module existant qui utilise `AuthGuard`, ex. comment `EventsModule` accède au guard). Si `AuthGuard` est auto-suffisant (lit le JWT), `imports: [AuthModule]` suffit ; sinon répliquer les imports d'`EventsModule`.

- [ ] **Step 4: Enregistrer le module**

Dans `apps/api/src/app.module.ts` : ajouter `import { UploadsModule } from "./uploads/uploads.module";` et ajouter `UploadsModule` dans le tableau `imports` (après `NotificationsModule`).

- [ ] **Step 5: Ajouter le test à la suite compilée**

Dans `apps/api/package.json`, scripts `test` ET `test:coverage` : ajouter ` dist/uploads/uploads.service.test.js` à la fin de la liste des fichiers `node --test …`.

- [ ] **Step 6: Lancer la suite compilée → succès**

Run: `cd apps/api && npm test 2>&1 | tail -8`
Expected: PASS (la suite passe, dont l'intégration 401/503 et `uploads.service` 2/2).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/uploads apps/api/src/app.module.ts apps/api/src/app.integration.test.ts apps/api/package.json
git commit -m "feat(api): POST /uploads/signature (auth-guarded) + wiring

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Frontend — `lib/upload.ts`

**Files:**
- Create: `apps/web/lib/upload.ts`

**Interfaces:**
- Consumes: `apiFetch` (`apps/web/lib/api.ts`), endpoint `POST /uploads/signature`.
- Produces:
  - `type CloudinarySignature = { cloudName: string; apiKey: string; timestamp: number; folder: string; signature: string }`
  - `cloudinaryConfigured(): boolean`
  - `uploadCandidatePhoto(file: File, token: string): Promise<string>` (renvoie `secure_url`).

- [ ] **Step 1: Écrire le module**

Create `apps/web/lib/upload.ts` :
```ts
import { apiFetch } from "./api";

export type CloudinarySignature = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  signature: string;
};

/** Le client connaît le cloud name via une var publique ; sinon upload indisponible. */
export function cloudinaryConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME);
}

export async function uploadCandidatePhoto(file: File, token: string): Promise<string> {
  const sig = await apiFetch<CloudinarySignature>("/uploads/signature", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });

  const form = new FormData();
  form.append("file", file);
  form.append("api_key", sig.apiKey);
  form.append("timestamp", String(sig.timestamp));
  form.append("folder", sig.folder);
  form.append("signature", sig.signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, {
    method: "POST",
    body: form
  });
  if (!res.ok) {
    throw new Error("Échec de l'upload de l'image.");
  }
  const data = (await res.json()) as { secure_url?: string };
  if (!data.secure_url) {
    throw new Error("Réponse d'upload invalide.");
  }
  return data.secure_url;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/upload.ts
git commit -m "feat(web): cloudinary upload client (signed)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Frontend — composant `PhotoUploadField`

**Files:**
- Create: `apps/web/components/photo-upload-field.tsx`
- Modify: `apps/web/app/globals.css` (petit style, après le bloc `.vp-candidate-thumb`)

**Interfaces:**
- Consumes: `uploadCandidatePhoto`, `cloudinaryConfigured` (Task 3), `CandidatePhoto`.
- Produces: `PhotoUploadField({ value, onChange, token, label, fullName }: { value: string; onChange: (url: string) => void; token: string; label: string; fullName: string })`.

- [ ] **Step 1: Écrire le composant**

Create `apps/web/components/photo-upload-field.tsx` :
```tsx
"use client";

import { useRef, useState } from "react";
import { useI18n } from "../lib/i18n-provider";
import { cloudinaryConfigured, uploadCandidatePhoto } from "../lib/upload";
import { CandidatePhoto } from "./candidate-photo";

const MAX_BYTES = 5 * 1024 * 1024;

export function PhotoUploadField({
  value,
  onChange,
  token,
  label,
  fullName
}: {
  value: string;
  onChange: (url: string) => void;
  token: string;
  label: string;
  fullName: string;
}) {
  const { locale } = useI18n();
  const isEn = locale === "en";
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canUpload = cloudinaryConfigured();

  async function onPick(file: File | undefined) {
    if (!file) return;
    setError("");
    if (!file.type.startsWith("image/")) {
      setError(isEn ? "Please choose an image file." : "Choisissez un fichier image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(isEn ? "Image must be 5 MB or smaller." : "L'image doit faire 5 Mo maximum.");
      return;
    }
    setBusy(true);
    try {
      const url = await uploadCandidatePhoto(file, token);
      onChange(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : isEn ? "Upload failed." : "Échec de l'upload.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="vp-upload-field">
      <span className="vp-label">{label}</span>
      <div className="vp-upload-row">
        <span className="vp-upload-preview">
          <CandidatePhoto photoUrl={value || null} fullName={fullName || "?"} size="sm" />
        </span>
        {canUpload ? (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => void onPick(e.target.files?.[0])}
            />
            <button type="button" className="vp-ui vp-button vp-button-secondary" disabled={busy} onClick={() => inputRef.current?.click()}>
              {busy ? (isEn ? "Uploading…" : "Envoi…") : isEn ? "Upload a photo" : "Téléverser une photo"}
            </button>
          </>
        ) : (
          <span className="vp-muted">{isEn ? "Upload not configured — paste a URL." : "Upload non configuré — collez une URL."}</span>
        )}
      </div>
      <input
        type="url"
        className="vp-upload-url"
        placeholder={isEn ? "…or paste an image URL" : "…ou collez une URL d'image"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {error ? <p className="vp-error" role="alert">{error}</p> : null}
    </div>
  );
}
```

- [ ] **Step 2: Ajouter le CSS**

Dans `apps/web/app/globals.css`, après `.vp-candidate-thumb .vp-candidate-photo { … }` :
```css
.vp-upload-field { display: grid; gap: 8px; }
.vp-upload-row { display: flex; align-items: center; gap: 12px; }
.vp-upload-preview { width: 56px; flex: none; }
.vp-upload-preview .vp-candidate-photo { max-width: 56px; font-size: 16px; }
.vp-upload-url { width: 100%; }
```

- [ ] **Step 3: Typecheck + build**

Run: `cd apps/web && npm run typecheck && npm run build 2>&1 | grep -iE "Compiled successfully|error"`
Expected: PASS / Compiled successfully.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/photo-upload-field.tsx apps/web/app/globals.css
git commit -m "feat(web): PhotoUploadField (upload + paste fallback + validation)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Intégrer `PhotoUploadField` dans le formulaire candidats

**Files:**
- Modify: `apps/web/app/dashboard/events/[eventId]/candidates/page.tsx`

**Interfaces:**
- Consumes: `PhotoUploadField` (Task 4). Le POST/PATCH candidats reste inchangé (envoie `photoUrl`).

- [ ] **Step 1: Remplacer le champ photo de création**

Dans `candidates/page.tsx` : importer `import { PhotoUploadField } from "../../../../../components/photo-upload-field";`. Remplacer le `<Input id="photoUrl" … />` du formulaire de création par :
```tsx
        <PhotoUploadField
          value={photoUrl}
          onChange={setPhotoUrl}
          token={getStoredToken() ?? ""}
          label={isEn ? "Photo (required)" : "Photo (requise)"}
          fullName={fullName}
        />
```

- [ ] **Step 2: Remplacer l'édition inline par l'upload**

Dans la liste, remplacer le bloc d'édition inline (le `<Input id={`edit-photo-${candidate.id}`} … />` + boutons) par un `PhotoUploadField` piloté par `editUrl` :
```tsx
                <div className="vp-inline">
                  <PhotoUploadField
                    value={editUrl}
                    onChange={setEditUrl}
                    token={getStoredToken() ?? ""}
                    label={isEn ? "Photo URL" : "Photo"}
                    fullName={candidate.fullName}
                  />
                  <button type="button" className="vp-ui vp-button vp-button-secondary" onClick={() => void onUpdatePhoto(candidate.id, editUrl)}>
                    {isEn ? "Save" : "Enregistrer"}
                  </button>
                  <button type="button" className="vp-ui vp-button vp-button-ghost" onClick={() => { setEditingId(null); setEditUrl(""); }}>
                    {isEn ? "Cancel" : "Annuler"}
                  </button>
                </div>
```
> Conserver `Button` du design-system si déjà importé ; sinon les classes `vp-ui vp-button …` sont équivalentes (déjà utilisées dans le fichier). Garder `onUpdatePhoto`, `editingId`, `editUrl` (Phase 1).

- [ ] **Step 3: Typecheck + build**

Run: `cd apps/web && npm run typecheck && npm run build 2>&1 | grep -iE "Compiled successfully|error|candidates"`
Expected: PASS / route candidates listée.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/dashboard/events/[eventId]/candidates/page.tsx"
git commit -m "feat(web): use PhotoUploadField in candidate create + edit

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: `CandidatePhoto` — transformation Cloudinary (images légères)

**Files:**
- Modify: `apps/web/components/candidate-photo.tsx`

**Interfaces:**
- Produces: rendu d'une URL dimensionnée pour les URLs Cloudinary (`/upload/` présent) ; autres URLs inchangées.

- [ ] **Step 1: Insérer la transformation**

Dans `candidate-photo.tsx`, avant le `return` de l'image, calculer une URL transformée :
```tsx
  const width = size === "lg" ? 640 : 160;
  const src =
    photoUrl && photoUrl.includes("/upload/") && photoUrl.includes("res.cloudinary.com")
      ? photoUrl.replace("/upload/", `/upload/w_${width},c_fill,f_auto,q_auto/`)
      : photoUrl;
```
et utiliser `src` dans `<img … src={src!} … />` (le `broken`/fallback initiales reste inchangé ; ne transformer que quand `photoUrl` est non nul et Cloudinary).

- [ ] **Step 2: Typecheck + build**

Run: `cd apps/web && npm run typecheck && npm run build 2>&1 | grep -iE "Compiled successfully|error"`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/candidate-photo.tsx
git commit -m "perf(web): serve Cloudinary candidate photos sized + auto format/quality

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage :** env+signature service → T1 ; endpoint auth-gardé + wiring + test 401/503 → T2 ; `lib/upload.ts` → T3 ; `PhotoUploadField` (validation type/taille + repli paste + dégradation) → T4 ; intégration form candidats → T5 ; transform Cloudinary `CandidatePhoto` → T6. Dégradation sans creds : `cloudinaryConfigured()` (T3/T4) + 503 (T1/T2). ✅

**Placeholders :** aucun « TODO/TBD ». Une seule note de vérification (T2 Step 3 : confirmer les imports d'`AuthModule` selon le pattern d'`EventsModule`) — c'est une vérification de pattern existant, pas un placeholder de code.

**Cohérence des types :** `UploadSignature`/`CloudinarySignature` mêmes champs (`cloudName, apiKey, timestamp, folder, signature`) ; `uploadCandidatePhoto(file, token) → string` consommé par `PhotoUploadField` ; `signUpload()` shape == ce que `lib/upload.ts` parse. `photoUrl` inchangé. ✅

## Ordre & dépendances
T1 → T2 (backend). T3 dépend de l'endpoint (T2). T4 dépend de T3. T5 dépend de T4. T6 indépendant (peut se faire après T4). Ordre : 1, 2, 3, 4, 5, 6.
