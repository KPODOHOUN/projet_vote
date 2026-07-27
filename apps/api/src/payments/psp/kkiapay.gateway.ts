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
 * KkiaPay status → normalized tri-state. Verified from the official Node SDK
 * (github.com/kkiapay/nodejs-sdk) status list:
 *   SUCCESS → SUCCEEDED · PENDING → PENDING · everything else (FAILED,
 *   INSUFFICIENT_FUND, TRANSACTION_NOT_ELIGIBLE, TRANSACTION_NOT_FOUND) → FAILED.
 */
function normalize(raw: unknown): PspNormalizedStatus | null {
  switch (String(raw).toUpperCase()) {
    case "PENDING":
      return "PENDING";
    case "SUCCESS":
      return "SUCCEEDED";
    case "FAILED":
    case "INSUFFICIENT_FUND":
    case "TRANSACTION_NOT_ELIGIBLE":
    case "TRANSACTION_NOT_FOUND":
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

/**
 * KkiaPay adapter.
 *
 * Payin is initiated CLIENT-SIDE by the KkiaPay JS widget (public key); the
 * server never calls an init endpoint. We only verify-by-pull (ADR-017) with the
 * three server keys. Payout via KkiaPay's `/merchant/payouts/schedule` is an
 * automatic sweep of the merchant balance to a single preconfigured destination —
 * NOT a per-organizer unitary transfer — so `sendPayout` returns UNCERTAIN
 * (fail-safe): a KkiaPay-routed organizer payout is always resolved manually by an
 * admin, never disbursed blindly. See the verified-endpoints spec
 * (docs/superpowers/specs/2026-06-11-fedapay-kkiapay-endpoints.md).
 */
@Injectable()
export class KkiapayGateway implements PspGateway {
  readonly provider = PaymentProvider.KKIAPAY;
  private readonly logger = new Logger(KkiapayGateway.name);

  private get baseUrl(): string {
    return (process.env.KKIAPAY_BASE_URL ?? env.KKIAPAY_BASE_URL).replace(/\/+$/, "");
  }
  private get keys(): { publicKey: string; privateKey: string; secretKey: string } {
    return {
      publicKey: process.env.KKIAPAY_PUBLIC_KEY ?? env.KKIAPAY_PUBLIC_KEY,
      privateKey: process.env.KKIAPAY_PRIVATE_KEY ?? env.KKIAPAY_PRIVATE_KEY,
      secretKey: process.env.KKIAPAY_SECRET_KEY ?? env.KKIAPAY_SECRET_KEY
    };
  }
  private get timeoutMs(): number {
    const raw = process.env.KKIAPAY_HTTP_TIMEOUT_MS;
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : env.KKIAPAY_HTTP_TIMEOUT_MS;
  }

  /**
   * Server-side no-op: the widget already created the transaction client-side and
   * handed us its transactionId (passed as customId). We echo it as the reference
   * and let verify-by-pull resolve the real status. No HTTP call is made.
   */
  async initPayin(input: PspPayinInitInput, _creds: PspCredentials): Promise<PspPayinInitResult> {
    if (!input.customId) {
      throw new ServiceUnavailableException(
        "Kkiapay: transactionId (customId) requis — le widget front doit fournir l'identifiant de transaction."
      );
    }
    return { reference: input.customId, status: "PENDING", amountCfa: input.amountCfa };
  }

  async fetchPayinStatus(reference: string, creds: PspCredentials): Promise<PspStatusResult> {
    const url = `${this.baseUrl}/api/v1/transactions/status`;
    const raw = await this.requestJson<Record<string, unknown>>("POST", url, this.keysFrom(creds), {
      transactionId: reference
    });
    const status = normalize(raw.status);
    if (!status) throw new ServiceUnavailableException(`Kkiapay: statut inconnu "${raw.status}".`);
    return {
      status,
      amountCfa: toInt(raw.amount, 0),
      currency: String(raw.currency ?? "XOF"),
      reason: raw.status === "SUCCESS" ? undefined : String(raw.status)
    };
  }

  /**
   * KkiaPay cannot do a per-organizer unitary payout. Fail safe: never disburse,
   * always UNCERTAIN → manual admin resolution.
   */
  async sendPayout(_input: PspPayoutInput, _creds: PspCredentials): Promise<PspPayoutResult> {
    return {
      status: "UNCERTAIN",
      reason: "Kkiapay ne supporte pas le virement unitaire par organisateur — résolution manuelle requise."
    };
  }

  async fetchPayoutStatus(_reference: string, _creds: PspCredentials): Promise<PspStatusResult> {
    // No unitary payout to track. Stay non-terminal so the orchestrator never
    // auto-confirms a KkiaPay payout from a pull.
    return {
      status: "PENDING",
      amountCfa: 0,
      currency: "XOF",
      reason: "Kkiapay: pas de payout unitaire à suivre."
    };
  }

  async getBalance(_creds: PspCredentials): Promise<Record<string, number>> {
    return {};
  }

  /**
   * Shared HTTP helper for the verify call: three-key auth headers, bounded
   * timeout, single retry on network/5xx, 4xx terminal, keys never logged.
   */
  private keysFrom(creds: PspCredentials): { publicKey: string; privateKey: string; secretKey: string } {
    const env = this.keys;
    return {
      publicKey: creds.kkiapayPublicKey || env.publicKey,
      privateKey: creds.kkiapayPrivateKey || env.privateKey,
      secretKey: creds.kkiapaySecretKey || env.secretKey
    };
  }

  private async requestJson<T>(
    method: "POST",
    url: string,
    keys: { publicKey: string; privateKey: string; secretKey: string },
    body: unknown
  ): Promise<T> {
    const { publicKey, privateKey, secretKey } = keys;
    const headers: Record<string, string> = {
      "x-api-key": publicKey,
      "x-private-key": privateKey,
      "x-secret-key": secretKey,
      Accept: "application/json",
      "Content-Type": "application/json"
    };

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
        const response = await fetch(url, { method, headers, body: JSON.stringify(body), signal: controller.signal });
        if (response.status >= 200 && response.status < 300) {
          const text = await response.text();
          if (!text) throw new TerminalError(new ServiceUnavailableException("Kkiapay: réponse vide."));
          try {
            return JSON.parse(text) as T;
          } catch {
            throw new TerminalError(new ServiceUnavailableException("Kkiapay: réponse non-JSON."));
          }
        }
        if (response.status >= 400 && response.status < 500) {
          this.logger.warn({ msg: "kkiapay.client_error", status: response.status });
          throw new TerminalError(new ServiceUnavailableException(`Kkiapay: statut ${response.status}.`));
        }
        lastErr = new ServiceUnavailableException(`Kkiapay: statut ${response.status}.`);
      } catch (err) {
        if (err instanceof TerminalError) throw err.inner;
        lastErr = err;
      } finally {
        clearTimeout(timer);
      }
      if (attempt === 1) await new Promise((r) => setTimeout(r, 50 + Math.floor(Math.random() * 200)));
    }
    throw lastErr instanceof Error ? lastErr : new ServiceUnavailableException("Kkiapay: échec après retry.");
  }
}
