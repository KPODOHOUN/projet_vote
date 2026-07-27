import { env } from "../config/env";

type TicketInfo = {
  id: string;
  qrSecret: string;
  amountCfa: number;
  holderName: string | null;
  holderPhone: string | null;
  holderEmail: string | null;
  ticketType: { name: string };
  event: { title: string; slug: string };
};

export function ticketEmailHtml(ticket: TicketInfo): string {
  const publicUrl = env.APP_PUBLIC_URL.replace(/\/+$/, "");
  const ticketUrl = `${publicUrl}/t/${ticket.id}?s=${ticket.qrSecret}`;
  const qrUrl = `${publicUrl}/api/v1/public/tickets/${ticket.id}/qr`;

  return `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px">
      <div style="text-align:center;margin-bottom:24px">
        <div style="background:#6366F1;color:#fff;width:56px;height:56px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:24px;font-weight:900;margin-bottom:8px">🎟</div>
        <h1 style="font-size:22px;margin:0;font-weight:800">Votre billet est confirmé</h1>
        <p style="color:#666;margin:4px 0 0;font-size:14px">${ticket.event.title}</p>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #eee;color:#888;font-size:13px">Billet</td>
          <td style="padding:10px 0;border-bottom:1px solid #eee;font-weight:700;text-align:right;font-size:14px">${ticket.ticketType.name}</td>
        </tr>
        ${ticket.holderName ? `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #eee;color:#888;font-size:13px">Titulaire</td>
          <td style="padding:10px 0;border-bottom:1px solid #eee;font-weight:700;text-align:right;font-size:14px">${ticket.holderName}</td>
        </tr>` : ""}
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #eee;color:#888;font-size:13px">Prix</td>
          <td style="padding:10px 0;border-bottom:1px solid #eee;font-weight:700;text-align:right;font-size:14px">${ticket.amountCfa.toLocaleString()} XOF</td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #eee;color:#888;font-size:13px">Statut</td>
          <td style="padding:10px 0;border-bottom:1px solid #eee;font-weight:700;text-align:right;font-size:14px;color:#22c55e">✅ Payé</td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#888;font-size:13px">Référence</td>
          <td style="padding:10px 0;font-weight:700;text-align:right;font-size:12px;font-family:monospace;color:#888">${ticket.id.slice(0, 12)}...</td>
        </tr>
      </table>

      <div style="text-align:center;margin:24px 0;padding:20px;background:#f8fafc;border-radius:12px">
        <p style="font-size:12px;color:#888;margin:0 0 12px;text-transform:uppercase;letter-spacing:1px;font-weight:600">Présentez ce QR code à l'entrée</p>
        <img src="${qrUrl}" alt="QR Code" style="width:180px;height:180px;border-radius:8px" />
        <p style="margin:12px 0 0">
          <a href="${ticketUrl}" style="color:#6366F1;font-size:13px;font-weight:600;text-decoration:underline">Voir mon billet en ligne</a>
        </p>
      </div>

      <div style="border-top:1px solid #eee;padding-top:16px;margin-top:16px">
        <p style="color:#888;font-size:12px;line-height:1.5">
          Ce billet est personnel et nominatif. Un seul scan par billet sera accepté à l'entrée de l'évènement.
          En cas de problème, contactez l'organisateur de l'évènement.
        </p>
      </div>
    </div>
  `;
}
