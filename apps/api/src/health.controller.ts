import { Controller, Get, Inject, Optional, ServiceUnavailableException } from "@nestjs/common";
import { healthContract } from "@votezpro/shared";
import { PrismaService } from "./prisma/prisma.service";

/** Délai au-delà duquel une base qui ne répond pas rend l'API « non prête ». */
export const HEALTH_READY_TIMEOUT_MS = "HEALTH_READY_TIMEOUT_MS";

@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(HEALTH_READY_TIMEOUT_MS) private readonly timeoutMs: number = 2_000
  ) {}

  // Vivacité : ne dépend d'aucun service externe, pour qu'une coupure de base
  // ne fasse pas redémarrer le conteneur en boucle.
  @Get()
  getHealth() {
    return {
      ...healthContract,
      version: "v1"
    };
  }

  // Disponibilité : 503 tant que la base ne répond pas (le trafic n'est pas
  // routé vers l'instance). Aucun détail d'erreur dans la réponse publique.
  @Get("ready")
  async getReadiness() {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.prisma.client.$queryRaw`SELECT 1`,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("database readiness timeout")), this.timeoutMs);
        })
      ]);
    } catch {
      throw new ServiceUnavailableException({
        service: healthContract.service,
        status: "not_ready",
        checks: { database: "unreachable" },
        timestamp: new Date().toISOString()
      });
    } finally {
      clearTimeout(timer);
    }
    return {
      service: healthContract.service,
      status: "ready",
      checks: { database: "ok" },
      timestamp: new Date().toISOString()
    } as const;
  }
}
