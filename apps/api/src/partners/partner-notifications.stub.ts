import type { PartnerNotificationsService } from "./partner-notifications.service";

/** Stub sans effet de bord pour les tests unitaires. */
export function noopPartnerNotifications(): PartnerNotificationsService {
  return {
    notifyRequestCreated: () => undefined,
    notifyRequestApproved: () => undefined,
    notifyRequestRejected: () => undefined
  } as unknown as PartnerNotificationsService;
}
