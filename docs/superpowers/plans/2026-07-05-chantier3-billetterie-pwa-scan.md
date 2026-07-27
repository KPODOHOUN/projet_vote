# Chantier 3 — Billetterie légère + PWA de scan — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vendre des billets payants (QR signé) pour un event et les contrôler à l'entrée via une PWA de scan fonctionnant offline (queue + sync), sans jamais émettre un billet non payé ni accepter un QR forgé.

**Architecture:** Deux modèles (`TicketType`, `Ticket`) rattachés à `Event` ; émission gated par le **seam de paiement existant** (verify-by-pull ADR-017, PSP registry) — un `Ticket` ne passe `ISSUED` qu'après paiement `SUCCEEDED` ; QR = token HMAC-signé (secret de scan par event) vérifiable offline ; endpoint `POST /tickets/scan` autorité du single-scan côté serveur ; PWA `/scan` avec file IndexedDB + sync.

**Tech Stack:** NestJS 11, Prisma/PostgreSQL, Zod, crypto (HMAC), Next.js 15 (App Router, PWA), IndexedDB, une lib de décodage QR (à choisir en Task 7), node:test + Playwright.

## Global Constraints

- **Émission gated paiement** : `Ticket.status = ISSUED` uniquement après `PaymentTransaction` `SUCCEEDED` (même discipline que les votes payés). Aucun billet gratuit non honoré.
- **Anti-forge** : le QR est un token **HMAC-signé** (payload `ticketId|eventId`, secret de scan par event). La signature est vérifiable **offline** ; l'unicité (single-scan) reste **arbitrée par le serveur** (premier check-in gagne).
- **Anti-survente** : décrément de quota transactionnel à l'émission.
- **PII** : `buyerPhone` **jamais** stocké en clair — `buyerPhoneHash` + `buyerPhoneLast4` (cohérent avec la politique vote `apps/api/src/common/voter-phone.ts`).
- **Isolation** : la clé de scan est scoppée à l'event ; un scanner ne valide que les tickets de son event (`wrong_event`) ; RBAC sur l'ouverture de session de scan.
- **Multi-devise** : `TicketType.priceMinor` + `currency` (réutilise `formatMoney` du Chantier 2 côté web ; encaissement XOF en V1, garde-fou du Chantier 2).
- Tests API contre la vraie base `votezpro_test` ; ajouter `TicketType` et `Ticket` à `TABLES` dans `apps/api/src/test-utils/db.ts`.
- **Dépend de** : Chantier 2 (Task 1 `Money`/`formatMoney`, garde-fou devise). Peut se faire après le Chantier 1 ou indépendamment.

---

### Task 1: DB — modèles `TicketType` + `Ticket`

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (nouveaux modèles + enum + relation sur `Event`)
- Modify: `apps/api/src/test-utils/db.ts` (ajouter `"Ticket"`, `"TicketType"` en tête de `TABLES`)
- Create: migration générée

**Interfaces:**
- Produces:
  ```prisma
  enum TicketStatus { PENDING ISSUED CHECKED_IN VOID }
  model TicketType { id, eventId, name, priceMinor Int, currency String @default("XOF"), quota Int?, salesStart DateTime?, salesEnd DateTime? }
  model Ticket { id, ticketTypeId, eventId, buyerName, buyerEmail, buyerPhoneHash, buyerPhoneLast4, token String @unique, status TicketStatus, checkedInAt, checkedInBy, paymentTransactionId, createdAt }
  ```

- [ ] **Step 1: Ajouter enum + modèles au schéma**

Dans `packages/db/prisma/schema.prisma`, ajouter :

```prisma
enum TicketStatus {
  PENDING
  ISSUED
  CHECKED_IN
  VOID
}

model TicketType {
  id         String   @id @default(cuid())
  eventId    String
  name       String
  priceMinor Int
  currency   String   @default("XOF")
  quota      Int?
  salesStart DateTime?
  salesEnd   DateTime?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  event   Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  tickets Ticket[]

  @@index([eventId])
}

model Ticket {
  id                   String       @id @default(cuid())
  ticketTypeId         String
  eventId              String
  buyerName            String
  buyerEmail           String
  buyerPhoneHash       String
  buyerPhoneLast4      String
  token                String       @unique
  status               TicketStatus @default(PENDING)
  checkedInAt          DateTime?
  checkedInBy          String?
  paymentTransactionId String?
  createdAt            DateTime     @default(now())
  updatedAt            DateTime     @updatedAt

  ticketType TicketType @relation(fields: [ticketTypeId], references: [id], onDelete: Cascade)
  event      Event      @relation(fields: [eventId], references: [id], onDelete: Cascade)

  @@index([eventId, status])
}
```

Dans `model Event`, ajouter les relations inverses :

```prisma
  ticketTypes TicketType[]
  tickets     Ticket[]
```

- [ ] **Step 2: Enregistrer les tables de test**

Dans `apps/api/src/test-utils/db.ts`, ajouter en tête du tableau `TABLES` (avant `"Vote"`, pour respecter l'ordre de troncature FK) :

```ts
  "Ticket",
  "TicketType",
```

- [ ] **Step 3: Générer + appliquer (dev & test)**

Run: `npm run db:generate && npx prisma migrate dev --name tickets --schema packages/db/prisma/schema.prisma`
Run (test): `TEST_DATABASE_URL=postgresql://votezpro@localhost:5433/votezpro_test npx prisma migrate deploy --schema packages/db/prisma/schema.prisma`
Expected: migration appliquée ; `prisma` regénéré expose `ticket`/`ticketType`.

- [ ] **Step 4: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations apps/api/src/test-utils/db.ts
git commit -m "feat(db): TicketType + Ticket models (paid ticketing)"
```

---

### Task 2: API — util token HMAC de billet (sign/verify)

**Files:**
- Create: `apps/api/src/common/ticket-token.ts`
- Test: `apps/api/src/common/ticket-token.test.ts`

**Interfaces:**
- Produces:
  ```ts
  function signTicketToken(input: { ticketId: string; eventId: string; secret: string }): string;
  function verifyTicketToken(token: string, secret: string): { ticketId: string; eventId: string } | null; // null si signature invalide/altérée
  ```

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `apps/api/src/common/ticket-token.test.ts` :

```ts
import { test } from "node:test";
import * as assert from "node:assert/strict";
import { signTicketToken, verifyTicketToken } from "./ticket-token";

const secret = "scan-secret-event-1";

test("sign puis verify restitue le payload", () => {
  const token = signTicketToken({ ticketId: "tk_1", eventId: "ev_1", secret });
  assert.deepEqual(verifyTicketToken(token, secret), { ticketId: "tk_1", eventId: "ev_1" });
});

test("token altéré => null", () => {
  const token = signTicketToken({ ticketId: "tk_1", eventId: "ev_1", secret });
  assert.equal(verifyTicketToken(token + "x", secret), null);
});

test("mauvais secret => null", () => {
  const token = signTicketToken({ ticketId: "tk_1", eventId: "ev_1", secret });
  assert.equal(verifyTicketToken(token, "autre-secret"), null);
});
```

- [ ] **Step 2: Lancer — doit échouer**

Run: `npm --prefix apps/api run test -- --test-name-pattern "token"`
Expected: FAIL (module absent).

- [ ] **Step 3: Implémenter**

Créer `apps/api/src/common/ticket-token.ts` :

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function signTicketToken(input: { ticketId: string; eventId: string; secret: string }): string {
  const payload = b64url(Buffer.from(`${input.ticketId}.${input.eventId}`, "utf8"));
  const sig = b64url(createHmac("sha256", input.secret).update(payload).digest());
  return `${payload}.${sig}`;
}

export function verifyTicketToken(token: string, secret: string): { ticketId: string; eventId: string } | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = b64url(createHmac("sha256", secret).update(payload).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const decoded = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  const [ticketId, eventId] = decoded.split(".");
  if (!ticketId || !eventId) return null;
  return { ticketId, eventId };
}
```

- [ ] **Step 4: Lancer — doit passer**

Run: `npm --prefix apps/api run test -- --test-name-pattern "token"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/ticket-token.ts apps/api/src/common/ticket-token.test.ts
git commit -m "feat(api): HMAC ticket token sign/verify (offline-verifiable, tamper-proof)"
```

---

### Task 3: API — module billetterie + gestion des `TicketType` (organisateur)

**Files:**
- Create: `apps/api/src/tickets/tickets.module.ts`, `tickets.service.ts`, `tickets.controller.ts`
- Modify: `apps/api/src/app.module.ts` (importer `TicketsModule`)
- Test: `apps/api/src/tickets/tickets.service.test.ts`

**Interfaces:**
- Consumes: `Event`, `TicketType` (Task 1).
- Produces:
  ```ts
  createTicketType(user: AuthUser, eventId: string, body: unknown): Promise<TicketType>; // RBAC owner du tenant de l'event
  listTicketTypes(eventId: string): Promise<TicketType[]>;
  ```
  Routes : `POST /events/:eventId/ticket-types` (auth), `GET /events/:eventId/ticket-types` (public lecture).

- [ ] **Step 1: Écrire le test qui échoue**

Créer `apps/api/src/tickets/tickets.service.test.ts` :

```ts
test("createTicketType attache un type de billet à l'event du owner", async () => {
  const { user, event } = await seedOwnerEvent();
  const tt = await tickets.createTicketType(user, event.id, { name: "Standard", priceMinor: 5000, currency: "XOF", quota: 100 });
  assert.equal(tt.name, "Standard");
  assert.equal(tt.priceMinor, 5000);
  assert.equal(tt.eventId, event.id);
});

test("createTicketType refuse un event d'un autre tenant", async () => {
  const { user } = await seedOwnerEvent();
  const other = await seedOwnerEvent(); // autre tenant/event
  await assert.rejects(() => tickets.createTicketType(user, other.event.id, { name: "X", priceMinor: 1, currency: "XOF" }));
});
```

> Reprendre le pattern RBAC/isolation des tests de `events.service.test.ts`.

- [ ] **Step 2: Lancer — doit échouer**

Run: `npm --prefix apps/api run test -- --test-name-pattern "TicketType"`
Expected: FAIL.

- [ ] **Step 3: Implémenter service + controller + module**

`tickets.service.ts` (extrait clé — valider l'appartenance au tenant du user avant écriture) :

```ts
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/auth.types"; // aligner sur le type réel

const createTicketTypeSchema = z.object({
  name: z.string().min(1).max(120),
  priceMinor: z.number().int().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  quota: z.number().int().positive().optional(),
  salesStart: z.string().datetime().optional(),
  salesEnd: z.string().datetime().optional()
});

@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService) {}

  async createTicketType(user: AuthUser, eventId: string, payload: unknown) {
    const input = createTicketTypeSchema.parse(payload);
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { id: true, tenantId: true } });
    if (!event) throw new NotFoundException("event_not_found");
    if (event.tenantId !== user.tenantId) throw new ForbiddenException("forbidden");
    return this.prisma.ticketType.create({
      data: {
        eventId,
        name: input.name,
        priceMinor: input.priceMinor,
        currency: input.currency,
        ...(input.quota !== undefined ? { quota: input.quota } : {}),
        ...(input.salesStart ? { salesStart: new Date(input.salesStart) } : {}),
        ...(input.salesEnd ? { salesEnd: new Date(input.salesEnd) } : {})
      }
    });
  }

  listTicketTypes(eventId: string) {
    return this.prisma.ticketType.findMany({ where: { eventId }, orderBy: { createdAt: "asc" } });
  }
}
```

`tickets.controller.ts` : routes ci-dessus (réutiliser les guards/décorateurs `@CurrentUser()` des controllers existants).
`tickets.module.ts` : provider `TicketsService`, controller, import `PrismaModule`.
Ajouter `TicketsModule` aux imports de `app.module.ts`.

> Aligner `AuthUser`/guards sur l'implémentation réelle (voir `events.controller.ts`).

- [ ] **Step 4: Lancer — doit passer**

Run: `npm --prefix apps/api run test -- --test-name-pattern "TicketType"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/tickets apps/api/src/app.module.ts
git commit -m "feat(api): tickets module + organizer TicketType management (RBAC)"
```

---

### Task 4: API — achat de billet gated paiement (émission après SUCCEEDED)

**Files:**
- Modify: `apps/api/src/tickets/tickets.service.ts` (achat + confirmation), `tickets.controller.ts` (routes publiques)
- Modify: point de confirmation de paiement (verify-by-pull) pour émettre le ticket — voir `apps/api/src/payments/feexpay/feexpay-verify.service.ts` / le hook de transition `SUCCEEDED`
- Test: `apps/api/src/tickets/tickets.purchase.test.ts`

**Interfaces:**
- Consumes: seam paiement (`payments.service` init + verify-by-pull), `signTicketToken` (Task 2), garde-fou devise (Chantier 2 Task 4), `hashVoterPhone`/`voterPhoneLast4` (`apps/api/src/common/voter-phone.ts`).
- Produces:
  ```ts
  initTicketPurchase(body): Promise<{ paymentRef; ticketId }>; // crée Ticket PENDING + init paiement
  issueTicketOnPayment(ticketId, paymentTransactionId): Promise<void>; // PENDING -> ISSUED, pose token signé, décrément quota transactionnel
  ```

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `apps/api/src/tickets/tickets.purchase.test.ts` :

```ts
test("un ticket n'est ISSUED qu'après paiement SUCCEEDED", async () => {
  const { event, ticketType } = await seedEventWithTicketType({ quota: 2 });
  const { ticketId } = await tickets.initTicketPurchase({
    eventSlug: event.slug, ticketTypeId: ticketType.id,
    buyerName: "Awa", buyerEmail: "awa@example.com", buyerPhone: "+22990000000"
  });
  let t = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
  assert.equal(t.status, "PENDING");
  assert.equal(t.token, ""); // pas encore de token tant que non payé (ou champ nul selon impl)

  await tickets.issueTicketOnPayment(ticketId, "ptx_1");
  t = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
  assert.equal(t.status, "ISSUED");
  assert.ok(t.token.length > 0);
  assert.equal(t.buyerPhoneLast4, "0000");
});

test("émission respecte le quota (anti-survente)", async () => {
  const { event, ticketType } = await seedEventWithTicketType({ quota: 1 });
  const a = await tickets.initTicketPurchase({ eventSlug: event.slug, ticketTypeId: ticketType.id, buyerName: "A", buyerEmail: "a@x.com", buyerPhone: "+22990000001" });
  const b = await tickets.initTicketPurchase({ eventSlug: event.slug, ticketTypeId: ticketType.id, buyerName: "B", buyerEmail: "b@x.com", buyerPhone: "+22990000002" });
  await tickets.issueTicketOnPayment(a.ticketId, "ptx_a");
  await assert.rejects(() => tickets.issueTicketOnPayment(b.ticketId, "ptx_b"), /sold_out/);
});
```

> Décision de modélisation à figer ici : `token` est vide/nul tant que `PENDING`, posé seulement à l'émission. Ajuster l'assertion à l'impl choisie (`""` vs `null`). Si `token` doit rester unique et non-null, utiliser un placeholder unique `pending:<ticketId>` jusqu'à l'émission.

- [ ] **Step 2: Lancer — doit échouer**

Run: `npm --prefix apps/api run test -- --test-name-pattern "ISSUED|quota"`
Expected: FAIL.

- [ ] **Step 3: Implémenter**

`initTicketPurchase` : valide event ACTIVE + devise encaissable (garde-fou Chantier 2) ; crée `Ticket` `PENDING` (phone hashé via `hashVoterPhone`, `voterPhoneLast4`) ; appelle le seam d'init paiement avec `amountCfa = ticketType.priceMinor` et une métadonnée `{ purpose: "ticket", ticketId }`.

`issueTicketOnPayment` (idempotent) dans une transaction :

```ts
async issueTicketOnPayment(ticketId: string, paymentTransactionId: string): Promise<void> {
  await this.prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.findUniqueOrThrow({ where: { id: ticketId }, include: { ticketType: true } });
    if (ticket.status === "ISSUED" || ticket.status === "CHECKED_IN") return; // idempotent
    if (ticket.ticketType.quota != null) {
      const issued = await tx.ticket.count({ where: { ticketTypeId: ticket.ticketTypeId, status: { in: ["ISSUED", "CHECKED_IN"] } } });
      if (issued >= ticket.ticketType.quota) throw new BadRequestException("sold_out");
    }
    const secret = await this.scanSecretForEvent(tx, ticket.eventId); // dérive/charge le secret de scan de l'event
    const token = signTicketToken({ ticketId: ticket.id, eventId: ticket.eventId, secret });
    await tx.ticket.update({ where: { id: ticket.id }, data: { status: "ISSUED", token, paymentTransactionId } });
  });
}
```

Brancher l'appel à `issueTicketOnPayment` au point de transition `SUCCEEDED` du verify-by-pull, **uniquement** quand la métadonnée `purpose === "ticket"` (ne pas perturber le flux vote). Le secret de scan par event : dériver de manière déterministe depuis un secret serveur + `eventId` (HMAC), ou le stocker via `EventSecret` existant — choisir et documenter dans le code.

- [ ] **Step 4: Lancer — doit passer**

Run: `npm --prefix apps/api run test -- --test-name-pattern "ISSUED|quota"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/tickets apps/api/src/payments
git commit -m "feat(api): paid ticket purchase — issue ISSUED only after SUCCEEDED, quota-safe"
```

---

### Task 5: API — endpoint de scan (autorité single-scan)

**Files:**
- Modify: `apps/api/src/tickets/tickets.service.ts` (scan + ouverture de session), `tickets.controller.ts`
- Test: `apps/api/src/tickets/tickets.scan.test.ts`

**Interfaces:**
- Consumes: `verifyTicketToken` (Task 2), `Ticket`.
- Produces:
  ```ts
  openScanSession(user: AuthUser, eventId: string): Promise<{ eventId: string; scanSecret: string; expiresAt: string }>; // RBAC owner
  scanTicket(input: { token: string }): Promise<{ result: "ok" | "already_checked_in" | "invalid" | "wrong_event" }>;
  ```
  Routes : `POST /events/:eventId/scan-session` (auth owner), `POST /tickets/scan` (auth scanner).

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `apps/api/src/tickets/tickets.scan.test.ts` :

```ts
test("scan valide => ok, 2e scan => already_checked_in", async () => {
  const { ticketId } = await seedIssuedTicket();
  const token = await currentTokenFor(ticketId); // lit ticket.token
  assert.equal((await tickets.scanTicket({ token })).result, "ok");
  const t = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
  assert.equal(t.status, "CHECKED_IN");
  assert.equal((await tickets.scanTicket({ token })).result, "already_checked_in");
});

test("token forgé => invalid", async () => {
  await seedIssuedTicket();
  assert.equal((await tickets.scanTicket({ token: "forge.forge" })).result, "invalid");
});
```

- [ ] **Step 2: Lancer — doit échouer**

Run: `npm --prefix apps/api run test -- --test-name-pattern "scan"`
Expected: FAIL.

- [ ] **Step 3: Implémenter**

`scanTicket` : récupère le ticket par `token` (`@unique`) ; si absent → `invalid` ; vérifie la signature avec le secret de scan de l'event (`verifyTicketToken` + `payload.eventId === ticket.eventId` sinon `wrong_event`) ; transition atomique :

```ts
async scanTicket(input: { token: string }): Promise<{ result: "ok" | "already_checked_in" | "invalid" | "wrong_event" }> {
  const ticket = await this.prisma.ticket.findUnique({ where: { token: input.token } });
  if (!ticket) return { result: "invalid" };
  const secret = await this.scanSecretForEvent(this.prisma, ticket.eventId);
  const payload = verifyTicketToken(input.token, secret);
  if (!payload) return { result: "invalid" };
  if (payload.eventId !== ticket.eventId) return { result: "wrong_event" };
  // Premier check-in gagne : update conditionnel.
  const updated = await this.prisma.ticket.updateMany({
    where: { id: ticket.id, status: "ISSUED" },
    data: { status: "CHECKED_IN", checkedInAt: new Date() }
  });
  return { result: updated.count === 1 ? "ok" : "already_checked_in" };
}
```

`openScanSession` : RBAC owner de l'event ; renvoie le `scanSecret` de l'event + expiration courte (pour validation offline côté PWA).

- [ ] **Step 4: Lancer — doit passer**

Run: `npm --prefix apps/api run test -- --test-name-pattern "scan"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/tickets
git commit -m "feat(api): ticket scan endpoint — server-authoritative single-scan + wrong_event guard"
```

---

### Task 6: Web — livraison du billet (QR + « Mes billets ») et email

**Files:**
- Create: `apps/web/app/tickets/[token]/page.tsx` (page billet publique avec QR)
- Modify: flux d'achat côté web (page event → sélection ticket-type → paiement, réutiliser `use-public-vote-payment.ts` comme modèle)
- Modify: `apps/api/src/mail/*` (email de confirmation avec lien billet) — réutiliser le module mail existant

**Interfaces:**
- Consumes: routes billetterie (Tasks 3-5), `formatMoney` (Chantier 2).
- Produces: page `/tickets/{token}` rendant le QR (encode le `token`) ; email de livraison.

- [ ] **Step 1: Page billet + QR**

Créer `apps/web/app/tickets/[token]/page.tsx` : rend un QR encodant `token` (générer le SVG QR côté serveur ou via une petite lib QR ajoutée en Task 7) + infos event/type. Statut affiché (`ISSUED`/`CHECKED_IN`).

- [ ] **Step 2: Email de confirmation**

Dans le module mail, ajouter un template « billet émis » (lien `/tickets/{token}`), envoyé à la transition `ISSUED` (appelé depuis `issueTicketOnPayment`, en fire-and-forget après commit, comme les triggers notifications existants).

- [ ] **Step 3: Flux d'achat web**

Sur la page event, ajouter une section « Billets » listant les `TicketType` (`GET /events/:eventId/ticket-types`) avec prix via `formatMoney`, et un bouton d'achat réutilisant le pattern de paiement public existant.

- [ ] **Step 4: Vérifier le build**

Run: `npm --prefix apps/web run build`
Expected: build OK.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/tickets apps/web/app/e apps/api/src/mail
git commit -m "feat(web): ticket QR page + email delivery + purchase flow"
```

---

### Task 7: Web — PWA de scan (`/scan`) offline + sync

**Files:**
- Create: `apps/web/app/scan/page.tsx` (UI scan), `apps/web/lib/scan-queue.ts` (IndexedDB), `apps/web/public/manifest.webmanifest`
- Modify: config Next pour PWA (service worker) — choisir l'approche (ex. route handler SW minimal) ; ajouter une lib de décodage QR (ex. `@zxing/browser` ou `html5-qrcode`) — décision à consigner en ADR.

**Interfaces:**
- Consumes: `POST /events/:eventId/scan-session` (récupère `scanSecret`), `POST /tickets/scan`, `verifyTicketToken` (portage JS côté client pour verdict offline).
- Produces: page `/scan` installable ; file IndexedDB + sync.

- [ ] **Step 1: File IndexedDB**

Créer `apps/web/lib/scan-queue.ts` : `enqueue(token)`, `pending()`, `markSynced(id)` sur un store IndexedDB `scan-queue`.

- [ ] **Step 2: UI de scan**

Créer `apps/web/app/scan/page.tsx` :
1. L'organisateur ouvre une session (`scan-session`) → stocke `scanSecret` + `eventId` en mémoire.
2. Caméra + décodage QR (lib choisie).
3. À chaque scan : vérifier la signature **offline** (portage de `verifyTicketToken`) → verdict immédiat ; si réseau dispo, `POST /tickets/scan` pour l'autorité serveur ; sinon `enqueue`.
4. Détection locale des doublons (set des tokens déjà scannés dans la session) → feedback immédiat.

- [ ] **Step 3: Sync**

À la reconnexion (`online` event), rejouer la file via `POST /tickets/scan` ; réconcilier les verdicts (`already_checked_in` = doublon détecté a posteriori).

- [ ] **Step 4: Manifest + installabilité**

Ajouter `manifest.webmanifest` + un service worker minimal (cache de l'app shell `/scan`). Vérifier l'installabilité (Lighthouse PWA) sans casser le reste du site.

- [ ] **Step 5: Vérifier le build**

Run: `npm --prefix apps/web run build`
Expected: build OK, `/scan` présent, manifest servi.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/scan apps/web/lib/scan-queue.ts apps/web/public/manifest.webmanifest
git commit -m "feat(web): /scan PWA — offline QR check-in with IndexedDB queue + sync"
```

---

### Task 8: E2E — achat → scan unique → re-scan refusé

**Files:**
- Create: `apps/web/tests/e2e/ticketing.spec.ts`

- [ ] **Step 1: Écrire le scénario**

Créer `apps/web/tests/e2e/ticketing.spec.ts` :
1. Organisateur crée un `TicketType` sur un event ACTIVE.
2. Achat d'un billet (paiement simulé → `SUCCEEDED` via le stub PSP des tests) → `ISSUED` + token.
3. Ouvrir `/scan`, simuler un scan du token → verdict `ok`, ticket `CHECKED_IN`.
4. Re-scan → `already_checked_in`.

> Réutiliser le stub PSP / le harnais d'auth des specs existantes ; respecter `E2E_API_BASE_URL=http://localhost:3011`.

- [ ] **Step 2: Lancer l'E2E**

Run: `E2E_API_BASE_URL=http://localhost:3011 npm --prefix apps/web run test:e2e -- ticketing.spec.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/tests/e2e/ticketing.spec.ts
git commit -m "test(e2e): ticketing purchase -> single scan -> re-scan rejected"
```

---

## Self-Review

**Spec coverage (Chantier 3) :**
- Modèles `TicketType`/`Ticket` (PII hashée, quota, token) → Task 1. ✅
- Token HMAC vérifiable offline, anti-forge → Task 2. ✅
- Gestion organisateur des types de billets (RBAC) → Task 3. ✅
- Émission gated paiement (`ISSUED` après `SUCCEEDED`) + anti-survente → Task 4. ✅
- Scan single-scan autorité serveur + `wrong_event` → Task 5. ✅
- Livraison QR + email + achat web → Task 6. ✅
- PWA `/scan` offline + sync → Task 7. ✅
- E2E achat→scan→re-scan → Task 8. ✅

**Placeholder scan :** deux décisions de modélisation explicitement à figer en implémentation (valeur de `token` en PENDING — Task 4 ; lib QR + approche SW — Task 7), signalées comme telles avec les options. Pas de « TODO » masqué.

**Type consistency :** `signTicketToken`/`verifyTicketToken` (Task 2) ↔ usages Tasks 4/5/7 ; `TicketStatus` (Task 1) ↔ transitions Tasks 4/5 ; `priceMinor`/`currency` ↔ `formatMoney` (Chantier 2).

**À vérifier en implémentation :** type réel `AuthUser` + guards ; point exact de transition `SUCCEEDED` du verify-by-pull pour brancher `issueTicketOnPayment` sans perturber le flux vote ; stockage/dérivation du `scanSecret` par event (dérivé HMAC vs `EventSecret`) ; ordre FK de troncature dans `TABLES`.

**Dépendances :** Chantier 2 (Money/formatMoney + garde-fou devise). Indépendant du Chantier 1.
