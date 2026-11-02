import { PrismaClient } from "@prisma/client";

let _prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!_prisma) {
    _prisma = new PrismaClient();
  }
  return _prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_, prop) {
    return getPrisma()[prop as keyof PrismaClient];
  },
  set(_, prop, value) {
    return Reflect.set(getPrisma(), prop, value);
  },
});
