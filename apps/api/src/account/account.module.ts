import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaService } from "../prisma/prisma.service";
import { AccountController } from "./account.controller";
import { AccountService } from "./account.service";

@Module({
  imports: [AuthModule],
  controllers: [AccountController],
  providers: [AccountService, PrismaService]
})
export class AccountModule {}
