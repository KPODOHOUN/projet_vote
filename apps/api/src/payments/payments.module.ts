import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PlatformControlModule } from "../platform-control/platform-control.module";
import { OrganizerSecretsModule } from "../organizer-secrets/organizer-secrets.module";
import { NotificationsCoreModule } from "../notifications/notifications-core.module";
import { PaymentsController } from "./payments.controller";
import { PaymentReconciliationController } from "./payment-reconciliation.controller";
import { PaymentsService } from "./payments.service";
import { PaymentVerifyService } from "./payment-verify.service";
import { PaymentReconciliationService } from "./payment-reconciliation.service";
import { FeexpayGateway } from "./psp/feexpay.gateway";
import { FedapayGateway } from "./psp/fedapay.gateway";
import { KkiapayGateway } from "./psp/kkiapay.gateway";
import { PspRegistry } from "./psp/psp.registry";

@Module({
  imports: [AuthModule, NotificationsCoreModule, OrganizerSecretsModule, PlatformControlModule],
  controllers: [PaymentsController, PaymentReconciliationController],
  providers: [
    PaymentsService,
    PaymentVerifyService,
    PaymentReconciliationService,
    // Provider-neutral PSP seam: the three stateless gateways and the registry
    // that routes by the organizer's choice (event → tenant → platform default).
    FeexpayGateway,
    FedapayGateway,
    KkiapayGateway,
    PspRegistry
  ],
  exports: [PaymentsService, PaymentVerifyService, PspRegistry]
})
export class PaymentsModule {}
