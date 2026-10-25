import { Redis } from "ioredis";
import { env } from "../config/env";

/** Compteurs journaliers du chatbot (borne de coût OpenAI). */
export interface ChatQuotaStore {
  /** Incrémente et renvoie les compteurs du jour (après incrément). */
  hit(day: string, ip: string): Promise<{ ip: number; global: number }>;
  /** Annule un hit refusé : un appel rejeté ne consomme pas le plafond. */
  undo(day: string, ip: string): Promise<void>;
}

/**
 * Mémoire du processus : avec plusieurs instances, le plafond réel est
 * multiplié par leur nombre. Utilisé quand API_REDIS_URL n'est pas défini.
 */
export class MemoryChatQuotaStore implements ChatQuotaStore {
  private day = "";
  private global = 0;
  private readonly perIp = new Map<string, number>();

  async hit(day: string, ip: string) {
    if (day !== this.day) {
      this.day = day;
      this.global = 0;
      this.perIp.clear();
    }
    const ipCount = (this.perIp.get(ip) ?? 0) + 1;
    this.perIp.set(ip, ipCount);
    this.global += 1;
    return { ip: ipCount, global: this.global };
  }

  async undo(day: string, ip: string) {
    if (day !== this.day) return;
    this.perIp.set(ip, Math.max(0, (this.perIp.get(ip) ?? 1) - 1));
    this.global = Math.max(0, this.global - 1);
  }
}

type RedisCounter = Pick<Redis, "incr" | "decr" | "expire">;

/** Partagé entre instances : une clé par jour, expirée après deux jours. */
export class RedisChatQuotaStore implements ChatQuotaStore {
  constructor(private readonly redis: RedisCounter) {}

  async hit(day: string, ip: string) {
    const ipKey = `chat:quota:${day}:ip:${ip}`;
    const globalKey = `chat:quota:${day}:global`;
    const [ipCount, globalCount] = await Promise.all([this.redis.incr(ipKey), this.redis.incr(globalKey)]);
    if (ipCount === 1) await this.redis.expire(ipKey, 2 * 86_400);
    if (globalCount === 1) await this.redis.expire(globalKey, 2 * 86_400);
    return { ip: ipCount, global: globalCount };
  }

  async undo(day: string, ip: string) {
    await Promise.all([this.redis.decr(`chat:quota:${day}:ip:${ip}`), this.redis.decr(`chat:quota:${day}:global`)]);
  }
}

export function createChatQuotaStore(): ChatQuotaStore {
  return env.API_REDIS_URL ? new RedisChatQuotaStore(new Redis(env.API_REDIS_URL)) : new MemoryChatQuotaStore();
}
