import { apiFetch } from "./api";

export type NotificationType =
  | "PAYMENT_SUCCEEDED"
  | "INVITATION_ACCEPTED"
  | "EVENT_ACTIVATED"
  | "PAYOUT_SUCCEEDED"
  | "PAYOUT_FAILED"
  | "PARTNER_REQUEST_RECEIVED"
  | "PARTNER_REQUEST_APPROVED"
  | "PARTNER_REQUEST_REJECTED";
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
    case "PAYOUT_SUCCEEDED":
      return `${t("notif.payoutSucceeded")} · ${amount(n.data.amountCfa)} XOF`;
    case "PAYOUT_FAILED":
      return `${t("notif.payoutFailed")} · ${amount(n.data.amountCfa)} XOF`;
    case "PARTNER_REQUEST_RECEIVED":
      return `${t("notif.partnerRequestReceived")} · ${String(n.data.eventTitle ?? "")}`;
    case "PARTNER_REQUEST_APPROVED":
      return `${t("notif.partnerRequestApproved")} · ${String(n.data.title ?? "")}`;
    case "PARTNER_REQUEST_REJECTED":
      return `${t("notif.partnerRequestRejected")} · ${String(n.data.title ?? "")}`;
    default:
      return isEn ? "New notification" : "Nouvelle notification";
  }
}

export function notificationHref(n: AppNotification): string {
  switch (n.type) {
    case "PAYMENT_SUCCEEDED":
    case "PAYOUT_SUCCEEDED":
    case "PAYOUT_FAILED":
      return "/dashboard";
    case "INVITATION_ACCEPTED":
      return "/dashboard/team";
    case "EVENT_ACTIVATED":
      return `/dashboard/events/${String(n.data.eventId ?? "")}/candidates`;
    case "PARTNER_REQUEST_RECEIVED":
      return "/admin/partners";
    case "PARTNER_REQUEST_APPROVED":
    case "PARTNER_REQUEST_REJECTED":
      return `/dashboard/events/${String(n.data.eventId ?? "")}/candidates`;
    default:
      return "/dashboard";
  }
}
