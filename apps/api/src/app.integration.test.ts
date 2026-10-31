import "reflect-metadata";
import cookieParser from "cookie-parser";
import { CRON_ROUTES, signCronRequest } from "./common/cron-signature";
import { test, before, after } from "node:test";
import type { TestContext } from "node:test";
import * as assert from "node:assert/strict";
import { Test } from "@nestjs/testing";
import { AppModule } from "./app.module";
import request from "supertest";
import { assertTestDatabase, prisma, resetDatabase } from "./test-utils/db";
import { eventPreviewToken } from "./common/event-preview-token";
import type { FeexpayInitRequest, FeexpayInitResult, FeexpayStatusPayload } from "./payments/feexpay/feexpay.types";
import { FeexpayGateway } from "./payments/psp/feexpay.gateway";
import { parseStrictProviderAmount } from "./payments/psp/parse-provider-amount";
import type { PspCredentials, PspPayinInitInput, PspPayinInitResult, PspStatusResult } from "./payments/psp/psp.types";
import { AuthService } from "./auth/auth.service";
import { UserRole } from "@prisma/client";
import { ZodExceptionFilter } from "./common/zod-exception.filter";
import { AllExceptionsFilter } from "./common/all-exceptions.filter";


/**
 * In-memory Feexpay client for the full-stack integration test (ADR-017).
 * Lets the test script the verify-by-pull response per reference, so the
 * webhook handler does not need a real network call.
 */
class IntegrationFakeFeexpay {
  scripted = new Map<string, FeexpayStatusPayload>();
  async initRequestToPay(req: FeexpayInitRequest): Promise<FeexpayInitResult> {
    return { reference: `fp_${Math.random().toString(36).slice(2)}`, status: "PENDING", amount: req.amountCfa };
  }
  async fetchStatus(reference: string): Promise<FeexpayStatusPayload> {
    return (
      this.scripted.get(reference) ?? { status: "PENDING", amount: 0, currency: "XOF" }
    );
  }
}

class IntegrationFakeFeexpayGateway extends FeexpayGateway {
  constructor(private readonly fake: IntegrationFakeFeexpay) {
    super();
  }

  async initPayin(input: PspPayinInitInput, _creds: PspCredentials): Promise<PspPayinInitResult> {
    const init = await this.fake.initRequestToPay({ amountCfa: input.amountCfa } as FeexpayInitRequest);
    return { reference: init.reference, status: "PENDING", amountCfa: input.amountCfa };
  }

  async fetchPayinStatus(reference: string, _creds: PspCredentials): Promise<PspStatusResult> {
    const payload = await this.fake.fetchStatus(reference);
    const status =
      payload.status === "SUCCESSFUL"
        ? ("SUCCEEDED" as const)
        : payload.status === "FAILED"
          ? ("FAILED" as const)
          : ("PENDING" as const);
    return {
      status,
      amountCfa: parseStrictProviderAmount(payload.amount) ?? 0,
      providerAmount: payload.amount,
      currency: payload.currency ?? "XOF",
      reason: payload.reason
    };
  }
}

// Real-database integration test — NO mock Prisma client. Every request hits
// the real NestJS app wired to the real PostgreSQL test database, so we
// exercise actual constraints, cascades, tenant scoping and error paths.
before(async () => {
  assertTestDatabase();
  await resetDatabase();
});

after(async () => {
  await prisma.$disconnect();
});

test("API integration flow: auth, events, votes, payments", async (t: TestContext) => {
  const fakeFeexpay = new IntegrationFakeFeexpay();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule]
  })
    .overrideProvider(FeexpayGateway)
    .useValue(new IntegrationFakeFeexpayGateway(fakeFeexpay))
    .compile();

  // rawBody: true is kept for parity with main.ts (other consumers depend on
  // it); we no longer use it for HMAC since Feexpay does not sign webhooks
  // (ADR-017).
  const app = moduleRef.createNestApplication({ rawBody: true });
  app.use(cookieParser());
  app.setGlobalPrefix("api/v1");
  app.useGlobalFilters(
    new AllExceptionsFilter(),
    new ZodExceptionFilter()
  );
  await app.init();
  t.after(async () => {
    await app.close();
  });

  const registerResponse = await request(app.getHttpServer())
    .post("/api/v1/auth/register")
    .send({
      firstName: "Awa",
      lastName: "Demo",
      phone: "0197000001",
      email: "owner@demovote.africa",
      organizationName: "Demo Vote",
      password: "SecurePass123!",
      acceptPrivacyPolicy: true
    });

  assert.equal(registerResponse.status, 201);
  assert.equal(typeof registerResponse.body.accessToken, "string");
  assert.equal(registerResponse.body.refreshToken, undefined);
  assert.ok(registerResponse.body.accessToken.length > 20);
  let accessToken = registerResponse.body.accessToken as string;
  let cookies = registerResponse.headers["set-cookie"];
  let authHeader = `Bearer ${accessToken}`;
  const meResponse = await request(app.getHttpServer())
    .get("/api/v1/auth/me")
    .set("Authorization", authHeader);
  assert.equal(meResponse.status, 200);
  const tenantId = meResponse.body.tenantId as string;
  assert.ok(tenantId.length > 5);
  // Le lien public de l'organisation est généré, jamais choisi.
  const tenantSlug = (await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } })).slug;

  // The admin surface (/admin/*) is restricted to platform operators (RBAC
  // hardening). verifyAccessToken re-reads the role from the database, so the
  // admin must be a real PLATFORM_ADMIN row — a JWT claiming the role is not
  // enough.
  const platformAdmin = await prisma.user.create({
    data: {
      tenantId,
      email: "platform-admin@demovote.africa",
      role: UserRole.PLATFORM_ADMIN,
      emailVerifiedAt: new Date()
    }
  });
  const authService = app.get(AuthService);
  const platformAdminToken = await authService.issueAccessToken({
    userId: platformAdmin.id,
    tenantId,
    role: UserRole.PLATFORM_ADMIN,
    email: platformAdmin.email
  });
  const platformAdminHeader = `Bearer ${platformAdminToken}`;

  // Un email = un compte : réutiliser l'adresse d'un organisateur est refusé (409),
  // jamais rattaché en silence à l'organisation d'un autre.
  const duplicateSlugRegister = await request(app.getHttpServer())
    .post("/api/v1/auth/register")
    .send({
      firstName: "Faux",
      lastName: "Compte",
      phone: "0197000002",
      email: "owner@demovote.africa",
      organizationName: "Impersonator",
      password: "SecurePass123!",
      acceptPrivacyPolicy: true
    });
  assert.equal(duplicateSlugRegister.status, 409);

  const refreshResponse = await request(app.getHttpServer())
    .post("/api/v1/auth/refresh")
    .set("Cookie", typeof cookies === "string" ? [cookies] : (cookies ?? []))
    .send({});
  assert.equal(refreshResponse.status, 201);
  assert.equal(typeof refreshResponse.body.accessToken, "string");
  assert.equal(refreshResponse.body.refreshToken, undefined);
  accessToken = refreshResponse.body.accessToken as string;
  cookies = refreshResponse.headers["set-cookie"];
  authHeader = `Bearer ${accessToken}`;

  const now = new Date();
  const eventStartsAt = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const eventEndsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const createEventResponse = await request(app.getHttpServer())
    .post("/api/v1/events")
    .set("Authorization", authHeader)
    .send({
      slug: "finale-2026",
      title: "Finale VotezPro 2026",
      startsAt: eventStartsAt,
      endsAt: eventEndsAt,
      tagline: "Votez pour votre finaliste préféré",
      brandColor: "#1d4ed8",
      voteUnitPriceCfa: 500
    });

  assert.equal(createEventResponse.status, 201);
  const eventId = createEventResponse.body.id as string;
  assert.ok(eventId.length > 10);

  // ADR-016: event is the public platform unit, resolved by its global slug.
  // Branding inherits from the organizer when the event leaves a field null.
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { logoUrl: "https://cdn.votezpro.africa/campus-africa.png" }
  });
  // Brouillon : invisible publiquement, visible avec le jeton d'aperçu de l'organisateur.
  const hiddenDraftResponse = await request(app.getHttpServer()).get("/api/v1/votes/public/event/finale-2026");
  assert.equal(hiddenDraftResponse.status, 404);
  const publicEventResponse = await request(app.getHttpServer()).get(
    `/api/v1/votes/public/event/finale-2026?preview=${encodeURIComponent(eventPreviewToken(eventId))}`
  );
  assert.equal(publicEventResponse.status, 200);
  assert.equal(publicEventResponse.body.organizer.displayName, "Demo Vote");
  assert.equal(publicEventResponse.body.event.branding.brandColor, "#1d4ed8"); // event override
  assert.equal(
    publicEventResponse.body.event.branding.logoUrl,
    "https://cdn.votezpro.africa/campus-africa.png"
  ); // inherited from organizer
  assert.equal(publicEventResponse.body.event.voteUnitPriceCfa, 500);

  const listEventsResponse = await request(app.getHttpServer())
    .get("/api/v1/events")
    .set("Authorization", authHeader);
  assert.equal(listEventsResponse.status, 200);
  assert.equal(listEventsResponse.body.length, 1);

  const createCandidateResponse = await request(app.getHttpServer())
    .post(`/api/v1/events/${eventId}/candidates`)
    .set("Authorization", authHeader)
    .send({
      fullName: "Arielle Dossou",
      number: 7,
      photoUrl: "https://img.test/arielle.jpg"
    });

  assert.equal(createCandidateResponse.status, 201);
  assert.equal(createCandidateResponse.body.number, 7);

  // Un concours ne passe jamais en ligne par simple modification…
  const patchToActive = await request(app.getHttpServer())
    .patch(`/api/v1/events/${eventId}`)
    .set("Authorization", authHeader)
    .send({ status: "ACTIVE" });
  assert.equal(patchToActive.status, 409);

  // … mais par la signature du contrat généré par la plateforme.
  const contractResponse = await request(app.getHttpServer())
    .post(`/api/v1/events/${eventId}/contract`)
    .set("Authorization", authHeader)
    .send({
      firstName: "Awa",
      lastName: "Demo",
      phone: "0197000001",
      address: "Rue 12, Cotonou",
      idDocumentType: "CNI",
      idDocumentNumber: "AB123456",
      organizationName: "Demo Vote"
    });
  assert.equal(contractResponse.status, 201);
  const contractId = contractResponse.body.id as string;
  const codeResponse = await request(app.getHttpServer())
    .post(`/api/v1/events/${eventId}/contract/${contractId}/code`)
    .set("Authorization", authHeader);
  assert.equal(codeResponse.status, 201);
  assert.match(String(codeResponse.body.devCode), /^\d{6}$/);
  const signResponse = await request(app.getHttpServer())
    .post(`/api/v1/events/${eventId}/contract/${contractId}/sign`)
    .set("Authorization", authHeader)
    .send({
      contentHash: contractResponse.body.contentHash,
      signerName: "Awa Demo",
      accept: true,
      code: codeResponse.body.devCode
    });
  assert.equal(signResponse.status, 201);
  const publishedEvent = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  assert.equal(publishedEvent.status, "ACTIVE");
  assert.equal(publishedEvent.commissionBps, 1200);
  const signedPdf = await request(app.getHttpServer())
    .get(`/api/v1/events/${eventId}/contract/${contractId}/pdf`)
    .set("Authorization", authHeader);
  assert.equal(signedPdf.status, 200);
  assert.equal(signedPdf.headers["content-type"], "application/pdf");

  // Phase 2 — endpoint de signature d'upload : gardé par auth, 503 si Cloudinary
  // non configuré (cas par défaut en test → prouve le wiring + le guard).
  const unauthSign = await request(app.getHttpServer()).post("/api/v1/uploads/signature");
  assert.equal(unauthSign.status, 401);
  const authedSign = await request(app.getHttpServer())
    .post("/api/v1/uploads/signature")
    .set("Authorization", authHeader);
  assert.equal(authedSign.status, 503);

  // The voter journey no longer carries a privacy consent step — a vote can be
  // cast directly (privacy acceptance now happens at organizer onboarding).
  const castVoteResponse = await request(app.getHttpServer())
    .post("/api/v1/votes/cast")
    .send({
      tenantSlug,
      eventSlug: "finale-2026",
      candidateNumber: 7,
      quantity: 1,
      voterPhone: "22999001122"
    });

  assert.equal(castVoteResponse.status, 201);
  assert.equal(castVoteResponse.body.amountCfa, 500);

  // Per-event vote price rule: a mismatched amount (e.g. missing quantity) is rejected (400).
  const wrongAmountVote = await request(app.getHttpServer())
    .post("/api/v1/votes/cast")
    .send({
      tenantSlug,
      eventSlug: "finale-2026",
      candidateNumber: 7,
      voterPhone: "22999003344"
    });
  assert.equal(wrongAmountVote.status, 400);

  const voteId = castVoteResponse.body.id as string;
  const publicInit = (overrides: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .post("/api/v1/payments/public/init")
      .send({
        tenantSlug,
        eventSlug: "finale-2026",
        voteId,
        amountCfa: 500,
        idempotencyKey: "idem-key-1234567890",
        payerPhone: "0199001122",
        operator: "mtn",
        ...overrides
      });

  // Le réseau Mobile Money est obligatoire ; après un refus, le même vote ne
  // peut pas être repayé (409, jamais une erreur serveur) : le votant recommence.
  const refusedVote = await request(app.getHttpServer())
    .post("/api/v1/votes/cast")
    .send({ tenantSlug, eventSlug: "finale-2026", candidateNumber: 7, quantity: 1, voterPhone: "22999007788" });
  assert.equal(refusedVote.status, 201);
  const noNetworkInit = await publicInit({ voteId: refusedVote.body.id, operator: undefined, idempotencyKey: "idem-key-no-network-0001" });
  assert.equal(noNetworkInit.status, 400);
  const retrySameVote = await publicInit({ voteId: refusedVote.body.id, idempotencyKey: "idem-key-no-network-0002" });
  assert.equal(retrySameVote.status, 409);

  const initPaymentResponse = await publicInit();
  assert.equal(initPaymentResponse.status, 201);
  assert.equal(initPaymentResponse.body.status, "PENDING");
  assert.equal(typeof initPaymentResponse.body.statusToken, "string");
  const transactionId = initPaymentResponse.body.transactionId as string;

  // --- Isolation entre organisateurs ---
  const attackerRegister = await request(app.getHttpServer())
    .post("/api/v1/auth/register")
    .send({
      firstName: "Rival",
      lastName: "Vote",
      phone: "0197000003",
      email: "owner@rivalvote.africa",
      password: "SecurePass123!",
      acceptPrivacyPolicy: true
    });
  assert.equal(attackerRegister.status, 201);
  const attackerAuthHeader = `Bearer ${attackerRegister.body.accessToken as string}`;
  const attackerMe = await request(app.getHttpServer())
    .get("/api/v1/auth/me")
    .set("Authorization", attackerAuthHeader);
  assert.equal(attackerMe.status, 200);
  const attackerTenantId = attackerMe.body.tenantId as string;
  assert.notEqual(attackerTenantId, tenantId);
  const attackerSlug = (await prisma.tenant.findUniqueOrThrow({ where: { id: attackerTenantId } })).slug;

  // ADR-016: event slugs are GLOBALLY unique — another organizer cannot reuse
  // an existing event slug (409).
  const duplicateEventSlug = await request(app.getHttpServer())
    .post("/api/v1/events")
    .set("Authorization", attackerAuthHeader)
    .send({
      slug: "finale-2026",
      title: "Copie illégitime",
      startsAt: eventStartsAt,
      endsAt: eventEndsAt
    });
  assert.equal(duplicateEventSlug.status, 409);

  // Un autre organisateur ne peut pas payer des votes sur le concours d'autrui (404).
  const crossTenantTopup = await request(app.getHttpServer())
    .post("/api/v1/payments/organizer/topup")
    .set("Authorization", attackerAuthHeader)
    .send({
      eventId,
      candidateId: createCandidateResponse.body.id,
      votesCount: 2,
      idempotencyKey: "idem-key-attacker-topup-0001",
      payerPhone: "0199003344",
      operator: "mtn"
    });
  assert.equal(crossTenantTopup.status, 404);

  // Associer son propre lien d'organisation au vote d'un autre ne résout rien.
  const crossTenantPublic = await publicInit({ tenantSlug: attackerSlug, idempotencyKey: "idem-key-attacker-public-0001" });
  assert.equal(crossTenantPublic.status, 401);

  // Rejouer la même demande renvoie la même transaction, sans nouvelle demande de paiement.
  const idempotentPaymentResponse = await publicInit();
  assert.equal(idempotentPaymentResponse.status, 201);
  assert.equal(idempotentPaymentResponse.body.transactionId, transactionId);

  // La même clé pour un autre paiement est refusée (409).
  const secondVote = await request(app.getHttpServer())
    .post("/api/v1/votes/cast")
    .send({ tenantSlug, eventSlug: "finale-2026", candidateNumber: 7, quantity: 2, voterPhone: "22999005566" });
  assert.equal(secondVote.status, 201);
  const conflictedPaymentResponse = await publicInit({ voteId: secondVote.body.id, amountCfa: 1000 });
  assert.equal(conflictedPaymentResponse.status, 409);

  // ADR-017: a webhook for an UNKNOWN reference is acknowledged with 200/201
  // (Feexpay must not keep retrying) but produces no DB mutation. The
  // verify-by-pull pipeline returns `outcome: rejected, reason:
  // unknown_reference`.
  const processPaymentResponse = await request(app.getHttpServer())
    .post("/api/v1/payments/webhooks/feexpay")
    .send({ reference: "fp_unknown_xxx" });
  assert.equal(processPaymentResponse.status, 201);
  assert.equal(processPaymentResponse.body.outcome, "rejected");
  assert.equal(processPaymentResponse.body.reason, "unknown_reference");
  // ... and no PaymentTransaction was flipped:
  const stillPending = await prisma.paymentTransaction.findUnique({
    where: { idempotencyKey: "idem-key-1234567890" }
  });
  assert.equal(stillPending?.status, "PENDING");

  // Commission par défaut (12 %) prélevée à la confirmation du paiement.

  // ADR-017 happy path: bind a Feexpay reference to the transaction, script
  // a SUCCESSFUL pull at the exact amount, then trigger the webhook. The
  // pipeline flips the tx to SUCCEEDED and captures the commission.
  await prisma.paymentTransaction.update({
    where: { idempotencyKey: "idem-key-1234567890" },
    data: { providerRef: "fp_123" }
  });
  fakeFeexpay.scripted.set("fp_123", {
    status: "SUCCESSFUL",
    amount: "500",
    currency: "XOF"
  });
  const processPaymentSuccessResponse = await request(app.getHttpServer())
    .post("/api/v1/payments/webhooks/feexpay")
    .send({ reference: "fp_123" });
  assert.equal(processPaymentSuccessResponse.status, 201);
  assert.equal(processPaymentSuccessResponse.body.outcome, "applied");

  // Commission prélevée : 12 % de 500 F CFA = 60, le reste revient à l'organisateur.
  const settledTx = await prisma.paymentTransaction.findUnique({
    where: { idempotencyKey: "idem-key-1234567890" }
  });
  assert.equal(settledTx?.commissionCfa, 60);
  assert.equal(settledTx?.id, transactionId);

  // RBAC hardening: an organizer must NOT reach the admin surface anymore.
  const organizerAuditLogsForbidden = await request(app.getHttpServer())
    .get("/api/v1/admin/audit-logs?limit=20")
    .set("Authorization", authHeader);
  assert.equal(organizerAuditLogsForbidden.status, 403);

  const listAuditLogsResponse = await request(app.getHttpServer())
    .get(`/api/v1/admin/audit-logs?limit=20&tenantId=${tenantId}`)
    .set("Authorization", platformAdminHeader);
  assert.equal(listAuditLogsResponse.status, 200);
  assert.ok(Array.isArray(listAuditLogsResponse.body.items));
  assert.ok(listAuditLogsResponse.body.items.length >= 4);
  assert.equal(listAuditLogsResponse.body.items[0].tenantId, tenantId);

  const unauthorizedJobsResponse = await request(app.getHttpServer()).get("/api/v1/admin/jobs/overview");
  assert.equal(unauthorizedJobsResponse.status, 401);

  const privacyExportResponse = await request(app.getHttpServer())
    .get("/api/v1/privacy/export")
    .set("Authorization", authHeader);
  assert.equal(privacyExportResponse.status, 200);
  assert.equal(
    (privacyExportResponse.headers["content-type"] as string).includes("application/zip"),
    true
  );

  // Effacement : confirmation obligatoire, et refusé tant que le responsable
  // a un événement en cours (fonds et votants ne doivent pas être abandonnés).
  const privacyDeleteUnconfirmed = await request(app.getHttpServer())
    .delete("/api/v1/privacy/delete")
    .set("Authorization", authHeader)
    .send({});
  assert.equal(privacyDeleteUnconfirmed.status, 401);
  const privacyDeleteWhileLive = await request(app.getHttpServer())
    .delete("/api/v1/privacy/delete")
    .set("Authorization", authHeader)
    .send({ currentPassword: "SecurePass123!" });
  assert.equal(privacyDeleteWhileLive.status, 400);
  assert.match(String(privacyDeleteWhileLive.body.message), /événements en cours/);

  const maintenanceCronPayload = {
    auditLogsRetentionDays: 30,
    idempotencyRetentionDays: 1,
    revokedSessionsRetentionDays: 1,
    tenantSlug,
    runAtIso: new Date().toISOString()
  };
  const maintenanceCronSignature = signCronRequest(CRON_ROUTES.purge, maintenanceCronPayload);

  const maintenanceCronResponse1 = await request(app.getHttpServer())
    .post("/api/v1/maintenance/cron/purge")
    .set("x-maintenance-cron-signature", maintenanceCronSignature)
    .send(maintenanceCronPayload);
  assert.equal(maintenanceCronResponse1.status, 201);
  assert.equal(maintenanceCronResponse1.body.alreadyExecuted, false);

  const maintenanceCronResponse2 = await request(app.getHttpServer())
    .post("/api/v1/maintenance/cron/purge")
    .set("x-maintenance-cron-signature", maintenanceCronSignature)
    .send(maintenanceCronPayload);
  assert.equal(maintenanceCronResponse2.status, 201);
  assert.equal(maintenanceCronResponse2.body.alreadyExecuted, true);

  // --- ops/metrics: token gate (constant-time comparison) ---
  const opsNoToken = await request(app.getHttpServer()).get("/api/v1/ops/metrics");
  assert.equal(opsNoToken.status, 403);

  const opsWrongToken = await request(app.getHttpServer())
    .get("/api/v1/ops/metrics")
    .set("x-ops-token", "wrong-token");
  assert.equal(opsWrongToken.status, 403);

  const opsValidToken = await request(app.getHttpServer())
    .get("/api/v1/ops/metrics")
    .set("x-ops-token", "dev-only-ops-token-change-me-32chars");
  assert.equal(opsValidToken.status, 200);

  // God-mode control space is PLATFORM_ADMIN only: an organizer is forbidden.
  const ownerPlatformOverview = await request(app.getHttpServer())
    .get("/api/v1/admin/platform/overview")
    .set("Authorization", authHeader);
  assert.equal(ownerPlatformOverview.status, 403);

  const logoutResponse = await request(app.getHttpServer())
    .post("/api/v1/auth/logout")
    .set("Cookie", typeof cookies === "string" ? [cookies] : (cookies ?? []))
    .send({});
  assert.equal(logoutResponse.status, 201);
  assert.equal(logoutResponse.body.success, true);
});
