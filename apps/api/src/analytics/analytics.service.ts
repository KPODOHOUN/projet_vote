import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service";

const trackEventSchema = z.object({
  name: z.string().min(1).max(80),
  sessionId: z.string().min(8).max(120),
  userId: z.string().optional(),
  tenantId: z.string().optional(),
  metadata: z.record(z.unknown()).optional()
});

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async track(payload: unknown) {
    const input = trackEventSchema.parse(payload);
    return this.prisma.client.productEvent.create({
      data: {
        name: input.name,
        sessionId: input.sessionId,
        userId: input.userId ?? null,
        tenantId: input.tenantId ?? null,
        ...(input.metadata !== undefined ? { metadata: input.metadata as object } : {})
      }
    });
  }
}
