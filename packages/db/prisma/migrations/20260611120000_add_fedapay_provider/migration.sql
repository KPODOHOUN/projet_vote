-- Multi-PSP: add FedaPay as a third payment provider. Additive enum value only;
-- no rows are affected. Routing columns (Tenant.provider, Event.provider,
-- PaymentTransaction.provider) already accept the PaymentProvider type.
ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'FEDAPAY';
