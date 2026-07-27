import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Controller("display-partners")
export class DisplayPartnersPublicController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async listActive() {
    const partners = await this.prisma.client.displayPartner.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, logoUrl: true, websiteUrl: true }
    });
    return partners;
  }
}
