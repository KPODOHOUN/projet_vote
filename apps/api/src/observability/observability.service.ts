import { Injectable } from "@nestjs/common";

type RequestSample = {
  timestamp: number;
  durationMs: number;
  statusCode: number;
};

@Injectable()
export class ObservabilityService {
  private readonly samples: RequestSample[] = [];
  private readonly maxSamples = 20_000;
  private readonly windowMs = 5 * 60_000;

  recordRequest(sample: RequestSample): void {
    this.samples.push(sample);
    if (this.samples.length > this.maxSamples) {
      this.samples.splice(0, this.samples.length - this.maxSamples);
    }
    this.pruneOldSamples();
  }

  getSnapshot() {
    this.pruneOldSamples();
    const totalRequests = this.samples.length;
    const errorRequests = this.samples.filter((sample) => sample.statusCode >= 500).length;
    const sortedDurations = this.samples
      .map((sample) => sample.durationMs)
      .sort((a, b) => a - b);

    const p95DurationMs =
      sortedDurations.length === 0
        ? 0
        : sortedDurations[Math.min(sortedDurations.length - 1, Math.ceil(sortedDurations.length * 0.95) - 1)];

    const errorRate = totalRequests === 0 ? 0 : Number((errorRequests / totalRequests).toFixed(4));

    return {
      windowSeconds: this.windowMs / 1000,
      totalRequests,
      errorRequests,
      errorRate,
      p95DurationMs,
      computedAt: new Date().toISOString()
    } as const;
  }

  private pruneOldSamples(): void {
    const minTimestamp = Date.now() - this.windowMs;
    let firstValidIndex = 0;
    while (firstValidIndex < this.samples.length) {
      const sample = this.samples[firstValidIndex];
      if (!sample || sample.timestamp >= minTimestamp) {
        break;
      }
      firstValidIndex += 1;
    }
    if (firstValidIndex > 0) {
      this.samples.splice(0, firstValidIndex);
    }
  }
}
