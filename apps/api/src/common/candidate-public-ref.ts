import { ConflictException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { generatePublicRef } from "./public-ref";

export async function generateUniqueCandidatePublicRef(
  prisma: PrismaClient
): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const publicRef = generatePublicRef();
    const existing = await prisma.candidate.findUnique({
      where: { publicRef },
      select: { id: true }
    });
    if (!existing) return publicRef;
  }
  throw new ConflictException("Impossible de générer un identifiant candidat.");
}
