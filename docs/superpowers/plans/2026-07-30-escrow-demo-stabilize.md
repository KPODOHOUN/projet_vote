# Escrow + Demo Stabilize Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Park Offer 1, ship Offer 2 Escrow as the only live path, with demo payments for the test phase.

**Architecture:** Default `offer1_external_enabled=false`; refuse EXTERNAL at register; UI marks Offer 1 as under reflection; Escrow + demo payments remain the production-shaped test path.

**Tech Stack:** NestJS, Next.js, Prisma, platform settings.

## Global Constraints

- Never enable `API_PAYMENT_DEMO_MODE` in production.
- Escrow wallet/ledger/withdrawal rules unchanged.
- Offer 1 code stays in repo but gated off.

---

### Task 1: Park Offer 1 defaults + API register gate

- [ ] `DEFAULT_OFFER1_ENABLED = false`
- [ ] Seed + migration set `offer1_external_enabled=false`
- [ ] `AuthService.register` rejects EXTERNAL when disabled
- [ ] OAuth new tenants get Escrow wallet
- [ ] Tests

### Task 2: UI Escrow-only + Offer 1 reflection

- [ ] Register form defaults to ESCROW; EXTERNAL disabled
- [ ] Pricing page parks Offer 1
- [ ] Dashboard offer page messaging
- [ ] Admin offers: reflection banner

### Task 3: Demo payments docs + withdrawal audit

- [ ] Guide demo updated for Escrow-only
- [ ] `markPaid` audits demo mode
- [ ] Verify typecheck + targeted tests
