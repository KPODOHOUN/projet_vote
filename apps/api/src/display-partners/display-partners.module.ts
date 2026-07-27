import { Module } from "@nestjs/common";
import { DisplayPartnersPublicController } from "./display-partners-public.controller";

@Module({
  controllers: [DisplayPartnersPublicController]
})
export class DisplayPartnersModule {}
