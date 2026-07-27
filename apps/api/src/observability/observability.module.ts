import { Module } from "@nestjs/common";
import { LedgerConsistencyService } from "./ledger-consistency.service";
import { ObservabilityController } from "./observability.controller";
import { ObservabilityService } from "./observability.service";

@Module({
  controllers: [ObservabilityController],
  providers: [ObservabilityService, LedgerConsistencyService],
  exports: [ObservabilityService, LedgerConsistencyService]
})
export class ObservabilityModule {}
