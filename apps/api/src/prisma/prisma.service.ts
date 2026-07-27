import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import { prisma } from "@votezpro/db";

@Injectable()
export class PrismaService implements OnApplicationShutdown {
  readonly client = prisma;

  /**
   * Close the connection pool on shutdown. Cloud Run sends SIGTERM before
   * reaping the container; draining Prisma here avoids leaking pooled
   * connections and lets Postgres release them cleanly. Wired via
   * app.enableShutdownHooks() in main.ts.
   */
  async onApplicationShutdown(): Promise<void> {
    await this.client.$disconnect();
  }
}
