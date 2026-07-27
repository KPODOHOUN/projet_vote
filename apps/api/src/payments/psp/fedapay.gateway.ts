import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { PaymentProvider } from "@prisma/client";
import { env } from "../../config/env";
import type {
  PspCredentials,
  PspGateway,
  PspNormalizedStatus,
  PspPayinInitInput,
  PspPayinInitResult,
  PspPayoutInput,
  PspPayoutResult,
  PspStatusResult
} from "./psp.types";

/**
 * FedaPay status → our normalized tri-state. Covers both transaction (payin) and
 * payout lifecycles, per the verified endpoints spec
 * (docs/superpowers/specs/2026-06-11-fedapay-kkiapay-endpoints.md).
 *   payin:  pending/created → PENDING · approved/transferred → SUCCEEDED ·
 *           declined/canceled/expired/refunded → FAILED
 *   payout: pending/started/processing → PENDING · sent → SUCCEEDED · failed/canceled → FAILED
 */
function normalize(raw: unknown): PspNormalizedStatus | null {
  switch (String(raw).toLowerCase()) {
    case "pending":
    case "created":
    case "started":
    case "processing":
      return "PENDING";
    case "approved":
    case "transferred":
    case "sent":
      return "SUCCEEDED";
    case "declined":
    case "canceled":
    case "cancelled":
    case "expired":
    case "refunded":
    case "failed":
      return "FAILED";
    default:
      return null;
  }
}

function toInt(raw: unknown, fallback: number): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.trunc(raw);
  if (typeof raw === "string") {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

/** FedaPay wraps single resources under a namespaced key ("v1/transaction", "v1/payout"). */
function unwrap(raw: Record<string, unknown>, key: string): Record<string, unknown> {
  const nested = raw[key];
  if (nested && typeof nested === "object") return nested as Record<string, unknown>;
  return raw;
}

@Injectable()
export class FedapayGateway implements PspGateway {
  readonly provider = PaymentProvider.FEDAPAY;
  private readonly logger = new Logger(FedapayGateway.name);

  private get baseUrl(): string {
    return (process.env.FEDAPAY_BASE_URL ?? env.FEDAPAY_BASE_URL).replace(/\/+$/, "");
  }
  private get timeoutMs(): number {
    const raw = process.env.FEDAPAY_HTTP_TIMEOUT_MS;
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : env.FEDAPAY_HTTP_TIMEOUT_MS;
  }

  /**
   * Payin = FedaPay's 3-step flow:
   *   1. POST /transactions                 → transaction id
   *   2. POST /transactions/{id}/token      → one-time token
   *   3. POST /{mode} { token }             → triggers the mobile-money push
   * The transaction id is returned as `reference` (stored as providerRef) and the
   * authoritative status is resolved later by verify-by-pull (ADR-017).
   */
  async initPayin(input: PspPayinInitInput, creds: PspCredentials): Promise<PspPayinInitResult> {
    // 1. create transaction
    const created = await this.requestJson<Record<string, unknown>>("POST", `${this.baseUrl}/transactions`, creds.apiKey, {
      description: input.description ?? "Vote",
      amount: input.amountCfa,
      currency: { iso: "XOF" },
      customer: {
        firstname: input.firstName ?? "Votant",
        lastname: input.lastName ?? "Anonyme",
        phone_number: { number: input.phoneNumber }
      }
    });
    const tx = unwrap(created, "v1/transaction");
    const id = tx.id;
    if (id === undefined || id === null) {
      throw new ServiceUnavailableException("Fedapay: création de transaction sans id.");
    }
    const reference = String(id);

    // 2. generate one-time token for this transaction
    const tokenRes = await this.requestJson<Record<string, unknown>>(
      "POST",
      `${this.baseUrl}/transactions/${encodeURIComponent(reference)}/token`,
      creds.apiKey
    );
    const token = tokenRes.token;
    if (!token || typeof token !== "string") {
      throw new ServiceUnavailableException("Fedapay: token de paiement absent.");
    }

    // 3. send the mobile-money push for the chosen operator mode. The mode is
    // validated against an allowlist upstream; encodeURIComponent guards the
    // path segment as defence-in-depth.
    const mode = input.operator.toLowerCase();
    await this.requestJson<Record<string, unknown>>("POST", `${this.baseUrl}/${encodeURIComponent(mode)}`, creds.apiKey, {
      token
    });

    return { reference, status: "PENDING", amountCfa: input.amountCfa };
  }

  async fetchPayinStatus(reference: string, creds: PspCredentials): Promise<PspStatusResult> {
    const raw = await this.requestJson<Record<string, unknown>>(
      "GET",
      `${this.baseUrl}/transactions/${encodeURIComponent(reference)}`,
      creds.apiKey
    );
    const tx = unwrap(raw, "v1/transaction");
    const status = normalize(tx.status);
    if (!status) throw new ServiceUnavailableException(`Fedapay: statut inconnu "${tx.status}".`);
    return {
      status,
      amountCfa: toInt(tx.amount, 0),
      currency: this.currencyIso(tx.currency),
      reason: tx.last_error_code as string | undefined
    };
  }

  /**
   * Payout = create then start:
   *   1. POST /payouts        → payout id (merchant_reference = our idempotency key)
   *   2. PUT  /payouts/start  → { payouts:[{id}] }
   * Only a definitive "sent" flips to SUCCEEDED. Anything else (pending/processing,
   * network/5xx, missing id) → UNCERTAIN: no auto-retry, resolved by pull/admin.
   */
  async sendPayout(input: PspPayoutInput, creds: PspCredentials): Promise<PspPayoutResult> {
    try {
      const created = await this.requestJson<Record<string, unknown>>("POST", `${this.baseUrl}/payouts`, creds.apiKey, {
        amount: input.amountCfa,
        currency: { iso: "XOF" },
        mode: input.network.toLowerCase(),
        merchant_reference: input.idempotencyKey,
        description: input.label,
        customer: { phone_number: { number: input.beneficiaryAccount } }
      });
      const payout = unwrap(created, "v1/payout");
      const id = payout.id;
      if (id === undefined || id === null) {
        return { status: "UNCERTAIN", reason: "payout create sans id" };
      }
      const providerRef = String(id);

      const started = await this.requestJson<Record<string, unknown>>("PUT", `${this.baseUrl}/payouts/start`, creds.apiKey, {
        payouts: [{ id }]
      });
      const status = this.extractStartedStatus(started, id);
      if (status === "SUCCEEDED") return { status: "SUCCEEDED", providerRef };
      if (status === "FAILED") return { status: "FAILED", reason: "fedapay_failed" };
      return { status: "UNCERTAIN", reason: `start status non-terminal` };
    } catch (err) {
      this.logger.warn({ msg: "fedapay.payout.uncertain", err: err instanceof Error ? err.message : String(err) });
      return { status: "UNCERTAIN", reason: err instanceof Error ? err.message : "payout_error" };
    }
  }

  async fetchPayoutStatus(reference: string, creds: PspCredentials): Promise<PspStatusResult> {
    const raw = await this.requestJson<Record<string, unknown>>(
      "GET",
      `${this.baseUrl}/payouts/${encodeURIComponent(reference)}`,
      creds.apiKey
    );
    const payout = unwrap(raw, "v1/payout");
    const status = normalize(payout.status);
    if (!status) throw new ServiceUnavailableException(`Fedapay: statut payout inconnu "${payout.status}".`);
    return {
      status,
      amountCfa: toInt(payout.amount, 0),
      currency: this.currencyIso(payout.currency),
      reason: payout.last_error_code as string | undefined
    };
  }

  /**
   * Balance is not part of the documented public API we verified. We never invent
   * a URL — return an empty map until FedaPay's balance endpoint is supplied.
   */
  async getBalance(_creds: PspCredentials): Promise<Record<string, number>> {
    return {};
  }

  /** FedaPay returns currency as { iso: "XOF" } (object) or sometimes a bare string. */
  private currencyIso(raw: unknown): string {
    if (raw && typeof raw === "object" && "iso" in raw) return String((raw as { iso: unknown }).iso ?? "XOF");
    return raw ? String(raw) : "XOF";
  }

  private extractStartedStatus(started: Record<string, unknown>, id: unknown): PspNormalizedStatus | null {
    const list = started["v1/payouts"];
    if (Array.isArray(list)) {
      const match = list.find((p) => p && typeof p === "object" && (p as { id?: unknown }).id === id) ?? list[0];
      if (match && typeof match === "object") return normalize((match as { status?: unknown }).status);
    }
    const single = unwrap(started, "v1/payout");
    return normalize(single.status);
  }

  /**
   * Shared HTTP helper: bounded timeout, single retry on network/5xx, 4xx terminal,
   * API key masked in logs. Mirrors FeexpayGateway's helper for consistency.
   */
  private async requestJson<T>(
    method: "GET" | "POST" | "PUT",
    url: string,
    apiKey: string,
    body?: unknown
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json"
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    class TerminalError extends Error {
      constructor(public readonly inner: ServiceUnavailableException) {
        super(inner.message);
      }
    }

    let lastErr: unknown;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const init: RequestInit = { method, headers, signal: controller.signal };
        if (body !== undefined) init.body = JSON.stringify(body);
        const response = await fetch(url, init);
        if (response.status >= 200 && response.status < 300) {
          const text = await response.text();
          if (!text) throw new TerminalError(new ServiceUnavailableException("Fedapay: réponse vide."));
          try {
            return JSON.parse(text) as T;
          } catch {
            throw new TerminalError(new ServiceUnavailableException("Fedapay: réponse non-JSON."));
          }
        }
        if (response.status >= 400 && response.status < 500) {
          this.logger.warn({
            msg: "fedapay.client_error",
            method,
            status: response.status,
            keyPrefix: apiKey.length > 6 ? `${apiKey.slice(0, 5)}…` : "***"
          });
          throw new TerminalError(
            new ServiceUnavailableException(`Fedapay: statut ${response.status} (${method}).`)
          );
        }
        lastErr = new ServiceUnavailableException(`Fedapay: statut ${response.status}.`);
      } catch (err) {
        if (err instanceof TerminalError) throw err.inner;
        lastErr = err;
      } finally {
        clearTimeout(timer);
      }
      if (attempt === 1) await new Promise((r) => setTimeout(r, 50 + Math.floor(Math.random() * 200)));
    }
    throw lastErr instanceof Error ? lastErr : new ServiceUnavailableException("Fedapay: échec après retry.");
  }
}
