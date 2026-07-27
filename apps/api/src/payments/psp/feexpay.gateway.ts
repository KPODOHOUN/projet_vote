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
import { parseStrictProviderAmount } from "./parse-provider-amount";

/** FeexPay provider status → our normalized tri-state. */
function normalize(raw: unknown): PspNormalizedStatus | null {
  switch (String(raw)) {
    case "PENDING":
      return "PENDING";
    case "SUCCESSFUL":
      return "SUCCEEDED";
    case "FAILED":
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

@Injectable()
export class FeexpayGateway implements PspGateway {
  readonly provider = PaymentProvider.FEEXPAY;
  private readonly logger = new Logger(FeexpayGateway.name);

  private get baseUrl(): string {
    return (process.env.FEEXPAY_BASE_URL ?? env.FEEXPAY_BASE_URL).replace(/\/+$/, "");
  }
  private get timeoutMs(): number {
    const raw = process.env.FEEXPAY_HTTP_TIMEOUT_MS;
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : env.FEEXPAY_HTTP_TIMEOUT_MS;
  }

  async initPayin(input: PspPayinInitInput, creds: PspCredentials): Promise<PspPayinInitResult> {
    const operator = input.operator.toLowerCase();
    // encodeURIComponent as defence-in-depth: the operator is already validated
    // against an allowlist upstream, but it must never be able to inject a path
    // segment into the PSP URL.
    const url = `${this.baseUrl}/api/transactions/public/requesttopay/${encodeURIComponent(operator)}`;
    const raw = await this.requestJson<Record<string, unknown>>("POST", url, creds.apiKey, {
      phoneNumber: input.phoneNumber,
      amount: input.amountCfa,
      shop: creds.shop,
      first_name: input.firstName,
      last_name: input.lastName,
      description: input.description,
      custom_id: input.customId
    });
    const reference = raw.reference;
    if (!reference || typeof reference !== "string") {
      throw new ServiceUnavailableException("Feexpay: réponse d'init sans référence.");
    }
    const status = normalize(raw.status ?? "PENDING");
    if (!status) throw new ServiceUnavailableException(`Feexpay: statut d'init inconnu "${raw.status}".`);
    return { reference, status, amountCfa: toInt(raw.amount, input.amountCfa) };
  }

  async fetchPayinStatus(reference: string, creds: PspCredentials): Promise<PspStatusResult> {
    const url = `${this.baseUrl}/api/transactions/public/single/status/${encodeURIComponent(reference)}`;
    const raw = await this.requestJson<Record<string, unknown>>("GET", url, creds.apiKey);
    const status = normalize(raw.status);
    if (!status) throw new ServiceUnavailableException(`Feexpay: statut inconnu "${raw.status}".`);
    const rawAmount = raw.amount as string | number | undefined;
    return {
      status,
      amountCfa: parseStrictProviderAmount(rawAmount) ?? 0,
      providerAmount: rawAmount,
      currency: String(raw.currency ?? ""),
      reason: raw.reason as string | undefined
    };
  }

  async sendPayout(input: PspPayoutInput, creds: PspCredentials): Promise<PspPayoutResult> {
    const url = `${this.baseUrl}/api/payouts/public/transfer/global`;
    try {
      const raw = await this.requestJson<Record<string, unknown>>("POST", url, creds.apiKey, {
        shop: creds.shop,
        amount: input.amountCfa,
        phoneNumber: input.beneficiaryAccount,
        network: input.network,
        motif: input.label
      });
      const status = normalize(raw.status);
      if (status === "SUCCEEDED") {
        const ref = String(raw.reference ?? "");
        if (!ref) return { status: "UNCERTAIN", reason: "payout sans reference" };
        return { status: "SUCCEEDED", providerRef: ref };
      }
      if (status === "FAILED") return { status: "FAILED", reason: String(raw.reason ?? "feexpay_failed") };
      // PENDING or unknown sync response — not certain; resolve by pull/manual.
      return { status: "UNCERTAIN", reason: `sync status "${raw.status}"` };
    } catch (err) {
      // Network/5xx/timeout — NEVER assume success. UNCERTAIN forces manual/pull.
      this.logger.warn({ msg: "feexpay.payout.uncertain", err: err instanceof Error ? err.message : String(err) });
      return { status: "UNCERTAIN", reason: err instanceof Error ? err.message : "payout_error" };
    }
  }

  async fetchPayoutStatus(reference: string, creds: PspCredentials): Promise<PspStatusResult> {
    const url = `${this.baseUrl}/api/payouts/status/public/${encodeURIComponent(reference)}`;
    const raw = await this.requestJson<Record<string, unknown>>("GET", url, creds.apiKey);
    const status = normalize(raw.status);
    if (!status) throw new ServiceUnavailableException(`Feexpay: statut payout inconnu "${raw.status}".`);
    return {
      status,
      amountCfa: toInt(raw.amount, 0),
      currency: String(raw.currency ?? "XOF"),
      reason: raw.reason as string | undefined
    };
  }

  async getBalance(creds: PspCredentials): Promise<Record<string, number>> {
    const url = `${this.baseUrl}/api/balance/public/getByShop/${encodeURIComponent(creds.shop)}`;
    const raw = await this.requestJson<Record<string, unknown>>("GET", url, creds.apiKey);
    // FeexPay nests balances at data.data.balances.
    const data = (raw.data as Record<string, unknown> | undefined)?.data as
      | Record<string, unknown>
      | undefined;
    const balances = (data?.balances ?? {}) as Record<string, number>;
    return balances;
  }

  /**
   * Shared HTTP helper: bounded timeout, single retry on network/5xx, 4xx
   * terminal, API key masked in logs. Mirrors the original FeexpayHttpClient.
   */
  private async requestJson<T>(
    method: "GET" | "POST",
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
          if (!text) throw new TerminalError(new ServiceUnavailableException("Feexpay: réponse vide."));
          try {
            return JSON.parse(text) as T;
          } catch {
            throw new TerminalError(new ServiceUnavailableException("Feexpay: réponse non-JSON."));
          }
        }
        if (response.status >= 400 && response.status < 500) {
          this.logger.warn({
            msg: "feexpay.client_error",
            method,
            status: response.status,
            keyPrefix: apiKey.length > 6 ? `${apiKey.slice(0, 5)}…` : "***"
          });
          throw new TerminalError(
            new ServiceUnavailableException(`Feexpay: statut ${response.status} (${method}).`)
          );
        }
        lastErr = new ServiceUnavailableException(`Feexpay: statut ${response.status}.`);
      } catch (err) {
        if (err instanceof TerminalError) throw err.inner;
        lastErr = err;
      } finally {
        clearTimeout(timer);
      }
      if (attempt === 1) await new Promise((r) => setTimeout(r, 50 + Math.floor(Math.random() * 200)));
    }
    throw lastErr instanceof Error ? lastErr : new ServiceUnavailableException("Feexpay: échec après retry.");
  }
}
