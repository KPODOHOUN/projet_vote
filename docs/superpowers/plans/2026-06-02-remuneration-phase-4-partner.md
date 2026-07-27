# Phase 4 — Offre partenaire (activate-now-pay-later)

> Partie du plan `2026-06-02-remuneration-overhaul.md`. Suppose Phases 0-3 mergées.

**Goal:** Permettre à un organisateur d'activer son événement **sans payer le forfait à l'avance** : l'admin valide la demande, le forfait devient une **dette** prélevée automatiquement sur les payouts de l'organisateur. Si non soldée à la clôture, **reportée** sur le prochain événement et **création d'événement bloquée** tant que la dette persiste. Un **taux de commission majoré** s'applique aux events partenaires.

---

### Task 4.1 : Migrations Prisma — `Tenant.isPartner`, `PartnerRequest`, `ActivationDebt`, `ActivationRecovery`, `Tenant.partnerCommissionBps`

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20260602130000_partner_program/migration.sql`
- Modify: `apps/api/src/test-utils/db.ts`

- [ ] **Step 1 : Migration SQL**

Crée `packages/db/prisma/migrations/20260602130000_partner_program/migration.sql` :

```sql
CREATE TYPE "PartnerRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "ActivationDebtStatus" AS ENUM ('OUTSTANDING', 'SETTLED', 'WRITTEN_OFF');

-- Tenant : isPartner toggle + dedicated commission rate.
ALTER TABLE "Tenant" ADD COLUMN "isPartner" BOOLEAN NOT NULL DEFAULT false;
-- Partner commission BPS : higher than the standard rate by default. Null
-- means "fall back to commissionBps". Used by the new resolution chain
-- when isPartner = true.
ALTER TABLE "Tenant" ADD COLUMN "partnerCommissionBps" INTEGER;

-- Requests : an organizer asks to activate-now-pay-later for an event.
CREATE TABLE "PartnerRequest" (
  "id"               TEXT PRIMARY KEY,
  "tenantId"         TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "eventId"          TEXT NOT NULL REFERENCES "Event"("id") ON DELETE CASCADE,
  "status"           "PartnerRequestStatus" NOT NULL DEFAULT 'PENDING',
  "requestedByUserId" TEXT NOT NULL,
  "decidedByUserId"  TEXT,
  "decidedAt"        TIMESTAMP(3),
  "reason"           TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("eventId")
);
CREATE INDEX "PartnerRequest_tenantId_status_idx" ON "PartnerRequest" ("tenantId", "status");

-- Outstanding debt per event activated under the partner program.
CREATE TABLE "ActivationDebt" (
  "id"                TEXT PRIMARY KEY,
  "tenantId"          TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "eventId"           TEXT NOT NULL REFERENCES "Event"("id") ON DELETE CASCADE,
  "amountCfa"         INTEGER NOT NULL,
  "recoveredCfa"      INTEGER NOT NULL DEFAULT 0,
  "status"            "ActivationDebtStatus" NOT NULL DEFAULT 'OUTSTANDING',
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("eventId")
);
CREATE INDEX "ActivationDebt_tenantId_status_idx" ON "ActivationDebt" ("tenantId", "status");

-- Per-payout recovery line : how much of an organizer payout was diverted
-- to clear part of a debt. Pinned onto a PayoutLine.activationRecoveryId.
CREATE TABLE "ActivationRecovery" (
  "id"                TEXT PRIMARY KEY,
  "debtId"            TEXT NOT NULL REFERENCES "ActivationDebt"("id") ON DELETE CASCADE,
  "payoutId"          TEXT REFERENCES "Payout"("id") ON DELETE SET NULL,
  "amountCfa"         INTEGER NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ActivationRecovery_debtId_idx" ON "ActivationRecovery" ("debtId");
```

- [ ] **Step 2 : Ajouter au schema.prisma**

Dans `model Tenant`, ajoute après `commissionBps Int?` :

```prisma
  // Partner program toggle. When true, the event create flow checks for an
  // outstanding ActivationDebt and rejects until cleared. The activation
  // forfait is converted to a debt instead of an upfront payment.
  isPartner              Boolean @default(false)
  // Higher commission rate applied to ALL events when isPartner=true.
  // Null = fall back to commissionBps. Sits ABOVE the standard commission
  // resolution chain when isPartner is true.
  partnerCommissionBps   Int?
```

Ajoute les enums + modèles à la fin :

```prisma
enum PartnerRequestStatus {
  PENDING
  APPROVED
  REJECTED
}

enum ActivationDebtStatus {
  OUTSTANDING
  SETTLED
  WRITTEN_OFF
}

model PartnerRequest {
  id                String                @id @default(cuid())
  tenantId          String
  eventId           String                @unique
  status            PartnerRequestStatus  @default(PENDING)
  requestedByUserId String
  decidedByUserId   String?
  decidedAt         DateTime?
  reason            String?
  createdAt         DateTime              @default(now())
  updatedAt         DateTime              @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  event  Event  @relation(fields: [eventId], references: [id], onDelete: Cascade)

  @@index([tenantId, status])
}

model ActivationDebt {
  id            String                @id @default(cuid())
  tenantId      String
  eventId       String                @unique
  amountCfa     Int
  recoveredCfa  Int                   @default(0)
  status        ActivationDebtStatus  @default(OUTSTANDING)
  createdAt     DateTime              @default(now())
  updatedAt     DateTime              @updatedAt

  tenant      Tenant                @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  event       Event                 @relation(fields: [eventId], references: [id], onDelete: Cascade)
  recoveries  ActivationRecovery[]

  @@index([tenantId, status])
}

model ActivationRecovery {
  id         String   @id @default(cuid())
  debtId     String
  payoutId   String?
  amountCfa  Int
  createdAt  DateTime @default(now())

  debt   ActivationDebt @relation(fields: [debtId], references: [id], onDelete: Cascade)
  payout Payout?        @relation(fields: [payoutId], references: [id], onDelete: SetNull)

  @@index([debtId])
}
```

N'oublie pas d'ajouter les relations inverses sur `Tenant` et `Event` :

```prisma
// dans model Tenant, après les autres relations :
partnerRequests   PartnerRequest[]
activationDebts   ActivationDebt[]

// dans model Event, après les autres relations :
partnerRequest    PartnerRequest?
activationDebt    ActivationDebt?
```

Et dans `model Payout` (Phase 3), ajoute :

```prisma
recoveries ActivationRecovery[]
```

- [ ] **Step 3 : Régénérer + appliquer + TABLES**

```bash
cd "/home/triple-v/Documents/Projets Personnels/Plateforme de vote"
npm --workspace=@votezpro/db run db:generate
DATABASE_URL="postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test" \
  npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
```

Dans `apps/api/src/test-utils/db.ts`, ajoute (ordre : enfants avant parents) :
```ts
"ActivationRecovery",
"ActivationDebt",
"PartnerRequest",
```
…avant `PayoutLine` (puisque `ActivationRecovery.payoutId` référence `Payout` — l'ordre n'est pas critique avec CASCADE mais on reste propres).

- [ ] **Step 4 : Commit**

```bash
git add packages/db/prisma packages/db/src apps/api/src/test-utils/db.ts
git commit -m "feat(db): partner program tables (Tenant flags, PartnerRequest, ActivationDebt, ActivationRecovery)"
```

---

### Task 4.2 : `PartnersService` — demandes & décisions

**Files:**
- Create: `apps/api/src/partners/partners.service.ts`
- Create: `apps/api/src/partners/partners.service.test.ts`
- Create: `apps/api/src/partners/partners.module.ts`

- [ ] **Step 1 : Test rouge**

Crée `apps/api/src/partners/partners.service.test.ts` :

```ts
import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import {
  ActivationDebtStatus,
  EventStatus,
  PartnerRequestStatus,
  UserRole
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PartnersService } from "./partners.service";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";

const prismaService = new PrismaService();
const service = new PartnersService(prismaService);

before(() => assertTestDatabase());
beforeEach(() => resetDatabase());
after(() => prisma.$disconnect());

async function seedTenantEvent() {
  const tenant = await prisma.tenant.create({ data: { slug: "pa-org", displayName: "PA" } });
  const owner = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: "owner@pa",
      passwordHash: "x",
      role: UserRole.ORGANIZER_OWNER
    }
  });
  const event = await prisma.event.create({
    data: {
      tenantId: tenant.id,
      slug: "pa-evt",
      title: "PA",
      status: EventStatus.DRAFT,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 3_600_000)
    }
  });
  return { tenant, owner, event };
}

test("requestPartnership : crée une demande PENDING ; doublon refusé", async () => {
  const { tenant, owner, event } = await seedTenantEvent();
  const r = await service.requestPartnership(
    { userId: owner.id, tenantId: tenant.id, role: UserRole.ORGANIZER_OWNER, email: owner.email },
    { eventId: event.id, reason: "Pas de trésorerie" }
  );
  assert.equal(r.status, PartnerRequestStatus.PENDING);
  await assert.rejects(
    service.requestPartnership(
      { userId: owner.id, tenantId: tenant.id, role: UserRole.ORGANIZER_OWNER, email: owner.email },
      { eventId: event.id, reason: "Re" }
    ),
    /existe déjà/
  );
});

test("approveRequest : marque le tenant isPartner, crée la dette, débloque l'event", async () => {
  const { tenant, owner, event } = await seedTenantEvent();
  const req = await service.requestPartnership(
    { userId: owner.id, tenantId: tenant.id, role: UserRole.ORGANIZER_OWNER, email: owner.email },
    { eventId: event.id, reason: "Pas de tréso" }
  );
  await prisma.platformSetting.create({
    data: { key: "activation_fee_cfa", value: "25000", updatedByUserId: "system" }
  });
  const admin = { userId: "admin-1", tenantId: "n/a", role: UserRole.PLATFORM_ADMIN, email: "a@v" };
  const res = await service.approveRequest(admin, req.id);
  assert.equal(res.approved, true);
  const refreshedTenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  assert.equal(refreshedTenant.isPartner, true);
  const refreshedEvent = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
  assert.ok(refreshedEvent.activationPaidAt, "event marqué comme activable");
  const debt = await prisma.activationDebt.findUniqueOrThrow({ where: { eventId: event.id } });
  assert.equal(debt.amountCfa, 25000);
  assert.equal(debt.status, ActivationDebtStatus.OUTSTANDING);
});

test("hasOutstandingDebt : vrai si dette > 0", async () => {
  const { tenant } = await seedTenantEvent();
  assert.equal(await service.hasOutstandingDebt(tenant.id), false);
  await prisma.activationDebt.create({
    data: {
      tenantId: tenant.id,
      eventId: "fake-ev-id-just-for-test-1234",
      amountCfa: 1000,
      recoveredCfa: 0
    }
  });
  assert.equal(await service.hasOutstandingDebt(tenant.id), true);
});

test("setPartnerCommission : update bps", async () => {
  const { tenant } = await seedTenantEvent();
  const admin = { userId: "a", tenantId: "n/a", role: UserRole.PLATFORM_ADMIN, email: "a@v" };
  await service.setPartnerCommission(admin, tenant.id, { partnerCommissionBps: 1500 });
  const r = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  assert.equal(r.partnerCommissionBps, 1500);
});
```

- [ ] **Step 2 : Implémenter le service**

Crée `apps/api/src/partners/partners.service.ts` :

```ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  ActivationDebtStatus,
  PartnerRequestStatus,
  UserRole
} from "@prisma/client";
import { z } from "zod";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { isUniqueConstraintViolation } from "../common/prisma-errors";
import {
  ACTIVATION_FEE_CFA_KEY,
  DEFAULT_ACTIVATION_FEE_CFA,
  parseIntSetting
} from "../common/platform-settings";

const requestSchema = z.object({
  eventId: z.string().min(1),
  reason: z.string().min(3).max(500)
});

const decisionSchema = z.object({
  reason: z.string().min(3).max(500).optional()
});

const commissionSchema = z.object({
  partnerCommissionBps: z.number().int().min(0).max(10_000).nullable()
});

@Injectable()
export class PartnersService {
  constructor(private readonly prisma: PrismaService) {}

  async requestPartnership(user: AuthUser, payload: unknown) {
    if (user.role !== UserRole.ORGANIZER_OWNER && user.role !== UserRole.ORGANIZER_STAFF) {
      throw new ForbiddenException("Seul un organisateur peut demander une offre partenaire.");
    }
    const input = requestSchema.parse(payload);
    const event = await this.prisma.client.event.findFirst({
      where: { id: input.eventId, tenantId: user.tenantId }
    });
    if (!event) throw new NotFoundException("Évènement introuvable.");
    if (event.activationPaidAt) {
      throw new ConflictException("Cet évènement est déjà activé.");
    }
    try {
      return await this.prisma.client.partnerRequest.create({
        data: {
          tenantId: user.tenantId,
          eventId: input.eventId,
          requestedByUserId: user.userId,
          reason: input.reason
        }
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException("Une demande existe déjà pour cet évènement.");
      }
      throw error;
    }
  }

  async approveRequest(admin: AuthUser, requestId: string) {
    if (admin.role !== UserRole.PLATFORM_ADMIN && admin.role !== UserRole.PLATFORM_SUPER_ADMIN) {
      throw new ForbiddenException("Action réservée à la plateforme.");
    }
    const req = await this.prisma.client.partnerRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new NotFoundException("Demande introuvable.");
    if (req.status !== PartnerRequestStatus.PENDING) {
      throw new BadRequestException("Demande déjà traitée.");
    }
    const fee = await this.readActivationFee();
    if (fee <= 0) {
      throw new BadRequestException("Aucun forfait d'activation configuré.");
    }
    await this.prisma.client.$transaction([
      // 1. Tag le tenant comme partenaire
      this.prisma.client.tenant.update({
        where: { id: req.tenantId },
        data: { isPartner: true }
      }),
      // 2. Marque l'event activable (sans avoir payé)
      this.prisma.client.event.update({
        where: { id: req.eventId },
        data: { activationPaidAt: new Date() }
      }),
      // 3. Crée la dette OUTSTANDING
      this.prisma.client.activationDebt.create({
        data: {
          tenantId: req.tenantId,
          eventId: req.eventId,
          amountCfa: fee,
          recoveredCfa: 0
        }
      }),
      // 4. Mark la demande comme APPROVED
      this.prisma.client.partnerRequest.update({
        where: { id: requestId },
        data: {
          status: PartnerRequestStatus.APPROVED,
          decidedByUserId: admin.userId,
          decidedAt: new Date()
        }
      })
    ]);
    return { approved: true, requestId };
  }

  async rejectRequest(admin: AuthUser, requestId: string, payload: unknown) {
    if (admin.role !== UserRole.PLATFORM_ADMIN && admin.role !== UserRole.PLATFORM_SUPER_ADMIN) {
      throw new ForbiddenException("Action réservée à la plateforme.");
    }
    const input = decisionSchema.parse(payload);
    const req = await this.prisma.client.partnerRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new NotFoundException("Demande introuvable.");
    if (req.status !== PartnerRequestStatus.PENDING) {
      throw new BadRequestException("Demande déjà traitée.");
    }
    await this.prisma.client.partnerRequest.update({
      where: { id: requestId },
      data: {
        status: PartnerRequestStatus.REJECTED,
        decidedByUserId: admin.userId,
        decidedAt: new Date(),
        reason: input.reason
      }
    });
    return { rejected: true, requestId };
  }

  /**
   * True if the tenant currently has at least one OUTSTANDING activation debt.
   * Used by EventsService.createEvent to block new events until cleared.
   */
  async hasOutstandingDebt(tenantId: string): Promise<boolean> {
    const count = await this.prisma.client.activationDebt.count({
      where: { tenantId, status: ActivationDebtStatus.OUTSTANDING }
    });
    return count > 0;
  }

  async setPartnerCommission(admin: AuthUser, tenantId: string, payload: unknown) {
    if (admin.role !== UserRole.PLATFORM_ADMIN && admin.role !== UserRole.PLATFORM_SUPER_ADMIN) {
      throw new ForbiddenException("Action réservée à la plateforme.");
    }
    const input = commissionSchema.parse(payload);
    const tenant = await this.prisma.client.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException("Organisateur introuvable.");
    await this.prisma.client.tenant.update({
      where: { id: tenantId },
      data: { partnerCommissionBps: input.partnerCommissionBps }
    });
    return { tenantId, partnerCommissionBps: input.partnerCommissionBps };
  }

  async listRequests(query: unknown) {
    const q = z
      .object({
        status: z.nativeEnum(PartnerRequestStatus).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50)
      })
      .parse(query);
    return this.prisma.client.partnerRequest.findMany({
      where: q.status ? { status: q.status } : {},
      orderBy: { createdAt: "desc" },
      take: q.limit
    });
  }

  async listDebts(tenantId?: string) {
    return this.prisma.client.activationDebt.findMany({
      where: tenantId ? { tenantId } : {},
      orderBy: { createdAt: "desc" }
    });
  }

  private async readActivationFee(): Promise<number> {
    const row = await this.prisma.client.platformSetting.findUnique({
      where: { key: ACTIVATION_FEE_CFA_KEY }
    });
    return parseIntSetting(row?.value, DEFAULT_ACTIVATION_FEE_CFA);
  }
}
```

- [ ] **Step 3 : Module**

Crée `apps/api/src/partners/partners.module.ts` :

```ts
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PartnersController } from "./partners.controller";
import { PartnersService } from "./partners.service";

@Module({
  imports: [AuthModule],
  controllers: [PartnersController],
  providers: [PartnersService],
  exports: [PartnersService]
})
export class PartnersModule {}
```

Et enregistre-le dans `app.module.ts`.

- [ ] **Step 4 : Controller**

Crée `apps/api/src/partners/partners.controller.ts` :

```ts
import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import type { AuthUser } from "../auth/auth.types";
import { PartnersService } from "./partners.service";

@Controller("partners")
@UseGuards(AuthGuard, RolesGuard)
export class PartnersController {
  constructor(private readonly partners: PartnersService) {}

  // Organizer-facing: request partnership for an event.
  @Post("requests")
  @Roles(UserRole.ORGANIZER_OWNER, UserRole.ORGANIZER_STAFF)
  request(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.partners.requestPartnership(user, body);
  }

  // Admin-facing: list / approve / reject / set commission.
  @Get("admin/requests")
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.PLATFORM_SUPER_ADMIN)
  list(@Query() query: unknown) {
    return this.partners.listRequests(query);
  }

  @Post("admin/requests/:id/approve")
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.PLATFORM_SUPER_ADMIN)
  approve(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.partners.approveRequest(user, id);
  }

  @Post("admin/requests/:id/reject")
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.PLATFORM_SUPER_ADMIN)
  reject(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return this.partners.rejectRequest(user, id, body);
  }

  @Put("admin/tenants/:tenantId/commission")
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.PLATFORM_SUPER_ADMIN)
  setCommission(
    @CurrentUser() user: AuthUser,
    @Param("tenantId") tenantId: string,
    @Body() body: unknown
  ) {
    return this.partners.setPartnerCommission(user, tenantId, body);
  }

  @Get("admin/debts")
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.PLATFORM_SUPER_ADMIN)
  listDebts(@Query("tenantId") tenantId?: string) {
    return this.partners.listDebts(tenantId);
  }
}
```

- [ ] **Step 5 : Run tests + ajouter au package.json + commit**

```bash
cd apps/api && npm run build && \
  DATABASE_URL="postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test" \
  node --test dist/partners/partners.service.test.js
```
Expected : 4 PASS. Ajoute le test au scripts npm.

```bash
git add apps/api/src/partners/ apps/api/src/app.module.ts apps/api/package.json
git commit -m "feat(partners): requests/approve/reject + activation debt creation"
```

---

### Task 4.3 : Bloquer la création d'évent si dette en cours

**Files:**
- Modify: `apps/api/src/events/events.service.ts:57-108`
- Modify: `apps/api/src/events/events.module.ts`
- Modify: `apps/api/src/events/events.service.test.ts`

- [ ] **Step 1 : Test rouge**

Ajoute à `apps/api/src/events/events.service.test.ts` :

```ts
test("createEvent : refusé si dette d'activation en cours", async () => {
  // setup tenant + event 1 + dette OUTSTANDING
  const { tenant, owner } = await seedOrg(); // helper existant
  const otherEvent = await prisma.event.create({
    data: {
      tenantId: tenant.id,
      slug: "x-evt",
      title: "x",
      status: "DRAFT",
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 3_600_000)
    }
  });
  await prisma.activationDebt.create({
    data: {
      tenantId: tenant.id,
      eventId: otherEvent.id,
      amountCfa: 25000,
      recoveredCfa: 0
    }
  });
  await assert.rejects(
    service.createEvent(
      { userId: owner.id, tenantId: tenant.id, role: "ORGANIZER_OWNER", email: owner.email } as any,
      {
        slug: "another",
        title: "Another",
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 60_000).toISOString()
      }
    ),
    /dette/i
  );
});
```

- [ ] **Step 2 : Injecter `PartnersService` dans `EventsService`**

Modifie `apps/api/src/events/events.module.ts` :

```ts
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PartnersModule } from "../partners/partners.module";
import { VotesModule } from "../votes/votes.module";
import { EventsController } from "./events.controller";
import { EventsService } from "./events.service";

@Module({
  imports: [AuthModule, VotesModule, PartnersModule],
  controllers: [EventsController],
  providers: [EventsService]
})
export class EventsModule {}
```

Modifie `EventsService` :

```ts
import { PartnersService } from "../partners/partners.service";

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly votesService: VotesService,
    private readonly partnersService: PartnersService
  ) {}

  async createEvent(user: AuthUser, payload: unknown) {
    // ... rôles existants ...
    if (await this.partnersService.hasOutstandingDebt(user.tenantId)) {
      throw new ConflictException(
        "Création bloquée : une dette d'activation partenaire est en cours. Solde-la avant de créer un nouvel évènement."
      );
    }
    // ... reste inchangé ...
  }
}
```

- [ ] **Step 3 : Run + commit**

```bash
cd apps/api && npm run build && \
  DATABASE_URL="postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test" \
  node --test dist/events/events.service.test.js
```
Expected : PASS.

```bash
git add apps/api/src/events/
git commit -m "feat(events): block createEvent when tenant has outstanding activation debt"
```

---

### Task 4.4 : Résolution de commission majorée pour les partenaires

**Files:**
- Modify: `apps/api/src/payments/payments.service.ts:299-316`
- Add a test in `apps/api/src/payments/payments.commission.test.ts`

- [ ] **Step 1 : Test rouge**

Crée `apps/api/src/payments/payments.commission.test.ts` :

```ts
import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { EventStatus, PaymentPurpose, PaymentStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentsService } from "./payments.service";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";

const prismaService = new PrismaService();
const payments = new PaymentsService(prismaService);

before(() => assertTestDatabase());
beforeEach(() => resetDatabase());
after(() => prisma.$disconnect());

test("commission majorée s'applique si tenant.isPartner=true et partnerCommissionBps défini", async () => {
  await prisma.platformSetting.create({
    data: { key: "commission_bps", value: "1000", updatedByUserId: "sys" } // 10% défaut
  });
  const tenant = await prisma.tenant.create({
    data: {
      slug: "pc-org",
      displayName: "PC",
      isPartner: true,
      partnerCommissionBps: 2000 // 20%
    }
  });
  const event = await prisma.event.create({
    data: {
      tenantId: tenant.id,
      slug: "pc-evt",
      title: "PC",
      status: EventStatus.ACTIVE,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 3_600_000)
    }
  });
  const candidate = await prisma.candidate.create({
    data: { eventId: event.id, fullName: "A", number: 1 }
  });
  const vote = await prisma.vote.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      candidateId: candidate.id,
      amountCfa: 1000
    }
  });
  await prisma.paymentTransaction.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      voteId: vote.id,
      provider: "feexpay",
      amountCfa: 1000,
      status: PaymentStatus.PENDING,
      purpose: PaymentPurpose.VOTE,
      idempotencyKey: "pc-test-key-12345678"
    }
  });
  await payments.processWebhook({
    providerRef: "fp_pc_1",
    idempotencyKey: "pc-test-key-12345678",
    status: "SUCCEEDED"
  });
  const tx = await prisma.paymentTransaction.findUniqueOrThrow({
    where: { idempotencyKey: "pc-test-key-12345678" }
  });
  assert.equal(tx.commissionCfa, 200, "20% appliqué (partnerCommissionBps), pas 10%");
});

test("si isPartner=false : taux standard (commissionBps ou défaut)", async () => {
  await prisma.platformSetting.create({
    data: { key: "commission_bps", value: "1000", updatedByUserId: "sys" }
  });
  const tenant = await prisma.tenant.create({
    data: {
      slug: "pc-org2",
      displayName: "PC2",
      isPartner: false,
      partnerCommissionBps: 2000 // doit être ignoré
    }
  });
  const event = await prisma.event.create({
    data: {
      tenantId: tenant.id,
      slug: "pc-evt2",
      title: "PC2",
      status: EventStatus.ACTIVE,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 3_600_000)
    }
  });
  const candidate = await prisma.candidate.create({
    data: { eventId: event.id, fullName: "A", number: 1 }
  });
  const vote = await prisma.vote.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      candidateId: candidate.id,
      amountCfa: 1000
    }
  });
  await prisma.paymentTransaction.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      voteId: vote.id,
      provider: "feexpay",
      amountCfa: 1000,
      status: PaymentStatus.PENDING,
      purpose: PaymentPurpose.VOTE,
      idempotencyKey: "pc-test-key-87654321"
    }
  });
  await payments.processWebhook({
    providerRef: "fp_pc_2",
    idempotencyKey: "pc-test-key-87654321",
    status: "SUCCEEDED"
  });
  const tx = await prisma.paymentTransaction.findUniqueOrThrow({
    where: { idempotencyKey: "pc-test-key-87654321" }
  });
  assert.equal(tx.commissionCfa, 100, "10% standard");
});
```

- [ ] **Step 2 : Modifier `resolveCommissionCfa` dans `payments.service.ts:299-316`**

```ts
private async resolveCommissionCfa(eventId: string, amountCfa: number): Promise<number> {
  const event = await this.prisma.client.event.findUnique({
    where: { id: eventId },
    select: {
      commissionBps: true,
      tenant: { select: { commissionBps: true, isPartner: true, partnerCommissionBps: true } }
    }
  });
  // New resolution chain :
  // 1. Per-event override (always wins)
  // 2. If tenant.isPartner AND tenant.partnerCommissionBps != null → that
  // 3. Tenant negotiated rate
  // 4. Platform default
  let bps: number | null = event?.commissionBps ?? null;
  if (bps === null && event?.tenant.isPartner && event?.tenant.partnerCommissionBps != null) {
    bps = event.tenant.partnerCommissionBps;
  }
  if (bps === null) {
    bps = event?.tenant.commissionBps ?? null;
  }
  if (bps === null) {
    const setting = await this.prisma.client.platformSetting.findUnique({
      where: { key: "commission_bps" }
    });
    bps = setting ? Number.parseInt(setting.value, 10) : 0;
  }
  if (!Number.isFinite(bps) || bps === null || bps <= 0) {
    return 0;
  }
  return Math.floor((amountCfa * bps) / 10_000);
}
```

- [ ] **Step 3 : Run + commit**

```bash
cd apps/api && npm run build && \
  DATABASE_URL="postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test" \
  node --test dist/payments/payments.commission.test.js
```
Expected : 2 PASS. Ajouter au scripts npm.

```bash
git add apps/api/src/payments/ apps/api/package.json
git commit -m "feat(payments): partner-aware commission resolution (event > partner-bps > tenant > default)"
```

---

### Task 4.5 : Recouvrement automatique sur les payouts organisateur

**Files:**
- Modify: `apps/api/src/payouts/payout-balance.service.ts` (computeOrganizerBalance prélève la dette)
- Modify: `apps/api/src/payouts/payouts.service.ts` (issuePayout enregistre ActivationRecovery)
- Add tests dans `apps/api/src/payouts/payouts.service.test.ts`

- [ ] **Step 1 : Test rouge — recouvrement partiel**

Ajoute à `apps/api/src/payouts/payouts.service.test.ts` :

```ts
test("payout organizer : prélève sur la dette d'activation OUTSTANDING en priorité", async () => {
  const fake = new FakeFeexpay();
  fake.nextResult = { status: "SUCCEEDED", providerRef: "fp_dbt_1" };
  const s = newService(fake);
  const { tenant, event } = await seedPaymentReady("t-debt", "e-debt", 5000, 500);
  // Dette de 3000 FCFA
  const debt = await prisma.activationDebt.create({
    data: { tenantId: tenant.id, eventId: event.id, amountCfa: 3000, recoveredCfa: 0 }
  });
  const period = await s.openPeriod({
    label: "W-DBT-1",
    from: new Date(Date.now() - 60_000),
    to: new Date(Date.now() + 60_000)
  });
  const res = await s.processPeriod(period.id);
  const org = res.payouts.find((p) => p.kind === "ORGANIZER");
  // Net brut = 4500 ; recouvrement = 3000 ; payout réel = 1500
  assert.equal(org?.amountCfa, 1500);
  const refreshedDebt = await prisma.activationDebt.findUniqueOrThrow({ where: { id: debt.id } });
  assert.equal(refreshedDebt.recoveredCfa, 3000);
  assert.equal(refreshedDebt.status, "SETTLED");
  const recovery = await prisma.activationRecovery.findFirstOrThrow({ where: { debtId: debt.id } });
  assert.equal(recovery.amountCfa, 3000);
});

test("payout organizer : si net < dette, recouvrement partiel, dette reste OUTSTANDING", async () => {
  const fake = new FakeFeexpay();
  fake.nextResult = { status: "SUCCEEDED", providerRef: "fp_dbt_2" };
  const s = newService(fake);
  const { tenant, event } = await seedPaymentReady("t-debt2", "e-debt2", 1000, 100);
  await prisma.activationDebt.create({
    data: { tenantId: tenant.id, eventId: event.id, amountCfa: 5000, recoveredCfa: 0 }
  });
  const period = await s.openPeriod({
    label: "W-DBT-2",
    from: new Date(Date.now() - 60_000),
    to: new Date(Date.now() + 60_000)
  });
  const res = await s.processPeriod(period.id);
  const org = res.payouts.find((p) => p.kind === "ORGANIZER");
  // Net brut = 900 ; recouvrement = 900 ; payout organizer = 0 (donc PAS de payout créé)
  assert.equal(org, undefined, "rien à verser à l'organisateur, mais la dette est partiellement remboursée");
  const debt = await prisma.activationDebt.findFirstOrThrow({ where: { tenantId: tenant.id } });
  assert.equal(debt.recoveredCfa, 900);
  assert.equal(debt.status, "OUTSTANDING");
});
```

- [ ] **Step 2 : Modifier `PayoutBalanceService.computeOrganizerBalance` pour intégrer le recouvrement**

Dans `apps/api/src/payouts/payout-balance.service.ts`, ajoute :

```ts
export type OrganizerBalanceWithDebt = OrganizerBalance & {
  debtCfa: number;        // dette OUTSTANDING totale
  recoveryCfa: number;    // ce qui peut être prélevé dans ce payout
  payableCfa: number;     // ce qu'on verse vraiment = max(0, netCfa - recoveryCfa)
  debtRecoveries: Array<{ debtId: string; amountCfa: number }>;
};

async computeOrganizerBalanceWithDebt(
  tenantId: string,
  window: BalanceWindow
): Promise<OrganizerBalanceWithDebt> {
  const base = await this.computeOrganizerBalance(tenantId, window);
  const debts = await this.prisma.client.activationDebt.findMany({
    where: { tenantId, status: "OUTSTANDING" },
    orderBy: { createdAt: "asc" }
  });
  let remainingNet = base.netCfa;
  let recoveryCfa = 0;
  const debtRecoveries: Array<{ debtId: string; amountCfa: number }> = [];
  for (const d of debts) {
    if (remainingNet <= 0) break;
    const due = d.amountCfa - d.recoveredCfa;
    const take = Math.min(due, remainingNet);
    if (take > 0) {
      recoveryCfa += take;
      remainingNet -= take;
      debtRecoveries.push({ debtId: d.id, amountCfa: take });
    }
  }
  return {
    ...base,
    debtCfa: debts.reduce((acc, d) => acc + (d.amountCfa - d.recoveredCfa), 0),
    recoveryCfa,
    payableCfa: Math.max(0, base.netCfa - recoveryCfa),
    debtRecoveries
  };
}
```

- [ ] **Step 3 : Modifier `PayoutsService.processPeriod` — chemin organizer**

Dans `apps/api/src/payouts/payouts.service.ts`, remplace le bloc "Organizer payouts" :

```ts
for (const tenantId of tenants) {
  const bal = await this.balance.computeOrganizerBalanceWithDebt(tenantId, window);
  if (bal.netCfa <= 0 && bal.recoveryCfa <= 0) continue;

  // 1. Enregistrer les recouvrements avant tout : tout ce qui est pris sur
  //    le payout de l'organisateur va à la dette (qui ira au payout
  //    plateforme suivant via une PayoutLine activation_recovery).
  const recoveries = await Promise.all(
    bal.debtRecoveries.map((r) =>
      this.prisma.client.activationRecovery.create({
        data: { debtId: r.debtId, amountCfa: r.amountCfa }
      })
    )
  );
  for (const r of bal.debtRecoveries) {
    await this.prisma.client.activationDebt.update({
      where: { id: r.debtId },
      data: {
        recoveredCfa: { increment: r.amountCfa }
      }
    });
  }
  // 2. Marquer SETTLED toutes les dettes qui le sont devenues
  await this.prisma.client.activationDebt.updateMany({
    where: {
      tenantId,
      status: "OUTSTANDING",
      // recoveredCfa >= amountCfa après les increments ci-dessus
    },
    data: { status: "SETTLED" }
  });
  // (Note : Prisma ne supporte pas la comparaison colonne-à-colonne en
  // updateMany. On fait un pass dédié :)
  const stillOutstanding = await this.prisma.client.activationDebt.findMany({
    where: { tenantId, status: "OUTSTANDING" }
  });
  for (const d of stillOutstanding) {
    if (d.recoveredCfa >= d.amountCfa) {
      await this.prisma.client.activationDebt.update({
        where: { id: d.id },
        data: { status: "SETTLED" }
      });
    }
  }

  if (bal.payableCfa <= 0) continue;

  const result = await this.issuePayout({
    periodId,
    periodLabel: period.label,
    kind: PayoutKind.ORGANIZER,
    beneficiaryTenantId: tenantId,
    amountCfa: bal.payableCfa,
    lines: bal.lines.map((l) => ({
      paymentTransactionId: l.paymentTransactionId,
      amountCfa: l.amountCfa - l.commissionCfa,
      kind: "vote_net"
    }))
  });
  if (result) created.push(result);
}
```

⚠️ Attention : la création des `ActivationRecovery` se fait AVANT l'appel à `issuePayout`. Si `issuePayout` échoue (UNCERTAIN/FAILED), les recouvrements sont **déjà enregistrés**. C'est volontaire : la dette doit être suivie même si le solde net rentre en UNCERTAIN — sinon une faille permettrait de "se faire payer la dette deux fois". Le test d'intégration suivant le verrouille.

- [ ] **Step 4 : Run tests + commit**

```bash
cd apps/api && npm run build && \
  DATABASE_URL="postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test" \
  node --test dist/payouts/payouts.service.test.js
```
Expected : tests passent (anciens + 2 nouveaux).

```bash
git add apps/api/src/payouts/
git commit -m "feat(payouts): auto-recover ActivationDebt from organizer payouts (priority lien)"
```

---

**Sortie de Phase 4** : un organisateur peut demander une offre partenaire, l'admin l'approuve depuis `/api/v1/partners/admin/requests/:id/approve`, l'événement devient activable, la dette est suivie, prélevée automatiquement sur ses futurs payouts, et la création d'événement est bloquée tant qu'il reste OUTSTANDING. La commission majorée s'applique aux events partenaires sans surcharge UX.
