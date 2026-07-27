import { env } from "../config/env";

export function buildAuthActionUrl(path: string, token: string): string {
  const base = env.APP_PUBLIC_URL.replace(/\/+$/, "");
  return `${base}${path}?token=${encodeURIComponent(token)}`;
}

export function verificationEmailHtml(verifyUrl: string): string {
  return `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px">
      <h1 style="font-size:22px;margin:0 0 12px">Confirmez votre adresse e-mail</h1>
      <p style="color:#444;line-height:1.6">
        Bienvenue sur SHADOMA Votes. Cliquez sur le bouton ci-dessous pour activer votre compte organisateur.
      </p>
      <p style="margin:28px 0">
        <a href="${verifyUrl}" style="background:#2E5BFF;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600">
          Confirmer mon e-mail
        </a>
      </p>
      <p style="color:#666;font-size:13px;line-height:1.5">
        Ce lien expire dans 24 heures. Si vous n'avez pas créé de compte, ignorez ce message.
      </p>
    </div>
  `;
}

export function passwordResetEmailHtml(resetUrl: string): string {
  return `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px">
      <h1 style="font-size:22px;margin:0 0 12px">Réinitialisation du mot de passe</h1>
      <p style="color:#444;line-height:1.6">
        Vous avez demandé à réinitialiser votre mot de passe SHADOMA Votes.
      </p>
      <p style="margin:28px 0">
        <a href="${resetUrl}" style="background:#2E5BFF;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600">
          Choisir un nouveau mot de passe
        </a>
      </p>
      <p style="color:#666;font-size:13px;line-height:1.5">
        Ce lien expire dans 1 heure. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.
      </p>
    </div>
  `;
}

export function invitationEmailHtml(acceptUrl: string, inviterEmail: string, tenantName: string): string {
  return `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px">
      <h1 style="font-size:22px;margin:0 0 12px">Rejoignez l'organisation</h1>
      <p style="color:#444;line-height:1.6">
        Vous avez été invité(e) par <strong>${inviterEmail}</strong> à rejoindre l'organisation <strong>${tenantName}</strong> sur SHADOMA Votes.
      </p>
      <p style="margin:28px 0">
        <a href="${acceptUrl}" style="background:#2E5BFF;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600">
          Accepter l'invitation
        </a>
      </p>
      <p style="color:#666;font-size:13px;line-height:1.5">
        Ce lien expire dans 48 heures. Si vous n'avez pas demandé à rejoindre cette organisation, ignorez ce message.
      </p>
    </div>
  `;
}
