import { apiFetch } from "./api";

export type NotificationType =
  | "PAYMENT_SUCCEEDED"
  | "INVITATION_ACCEPTED"
  | "EVENT_ACTIVATED"
  | "CONTRACT_SIGNED"
  | "COMMISSION_RATE_CHANGED"
  | "WITHDRAWAL_APPROVED"
  | "WITHDRAWAL_REJECTED"
  | "WITHDRAWAL_PAID"
  | "PAYOUT_DESTINATION_CHANGED";
export type AppNotification = { id: string; type: NotificationType; data: Record<string, unknown>; readAt: string | null; createdAt: string };

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export function listNotifications(token: string, opts?: { limit?: number; unreadOnly?: boolean }) {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.unreadOnly) params.set("unreadOnly", "true");
  const qs = params.toString();
  return apiFetch<{ items: AppNotification[] }>(`/notifications${qs ? `?${qs}` : ""}`, { headers: authHeaders(token) });
}

export function unreadCount(token: string) {
  return apiFetch<{ count: number }>("/notifications/unread-count", { headers: authHeaders(token) });
}

export function markRead(token: string, id: string) {
  return apiFetch<{ id: string; readAt: string }>(`/notifications/${id}/read`, { method: "POST", headers: authHeaders(token) });
}

export function markAllRead(token: string) {
  return apiFetch<{ updated: number }>("/notifications/read-all", { method: "POST", headers: authHeaders(token) });
}

type Translate = (key: string) => string;

export function notificationText(n: AppNotification, t: Translate, isEn: boolean): string {
  const amount = (v: unknown) => Number(v ?? 0).toLocaleString(isEn ? "en-GB" : "fr-FR");
  switch (n.type) {
    case "PAYMENT_SUCCEEDED":
      return `${t("notif.paymentSucceeded")} · ${amount(n.data.amountCfa)} XOF`;
    case "INVITATION_ACCEPTED":
      return `${t("notif.invitationAccepted")} · ${String(n.data.email ?? "")}`;
    case "EVENT_ACTIVATED":
      return `${t("notif.eventActivated")} · ${String(n.data.title ?? "")}`;
    case "CONTRACT_SIGNED":
      return t("notif.contractSigned");
    case "COMMISSION_RATE_CHANGED":
      return `${t("notif.commissionRateChanged")} · ${(Number(n.data.bps ?? 0) / 100).toLocaleString(isEn ? "en-GB" : "fr-FR")} %`;
    case "WITHDRAWAL_APPROVED":
      return `${t("notif.withdrawalApproved")} · ${amount(n.data.amountCfa)} XOF`;
    case "WITHDRAWAL_REJECTED":
      return `${t("notif.withdrawalRejected")} · ${amount(n.data.amountCfa)} XOF`;
    case "WITHDRAWAL_PAID":
      return `${t("notif.withdrawalPaid")} · ${amount(n.data.amountCfa)} XOF`;
    case "PAYOUT_DESTINATION_CHANGED":
      return `${t("notif.payoutDestinationChanged")} · ${String(n.data.network ?? "")} ••${String(n.data.last4 ?? "")}`;
    default:
      return isEn ? "New notification" : "Nouvelle notification";
  }
}

export function notificationHref(n: AppNotification): string {
  switch (n.type) {
    case "PAYMENT_SUCCEEDED":
      return "/dashboard";
    case "WITHDRAWAL_APPROVED":
    case "WITHDRAWAL_REJECTED":
    case "WITHDRAWAL_PAID":
      return "/dashboard/wallet";
    case "COMMISSION_RATE_CHANGED":
      return "/dashboard/offer";
    case "CONTRACT_SIGNED":
      return `/dashboard/events/${String(n.data.eventId ?? "")}/contract`;
    case "INVITATION_ACCEPTED":
      return "/dashboard/team";
    case "PAYOUT_DESTINATION_CHANGED":
      return "/dashboard/account#payout-destination";
    case "EVENT_ACTIVATED":
      return `/dashboard/events/${String(n.data.eventId ?? "")}/candidates`;
    default:
      return "/dashboard";
  }
}
