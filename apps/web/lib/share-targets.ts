// lib/share-targets.ts — Cibles du panneau « Partager » : un lien d'intention
// officiel par réseau quand il existe ; sinon (Instagram, TikTok, Snapchat,
// qui n'acceptent pas de lien web) le partage natif du téléphone, ou la copie
// du lien à défaut. Aucun SDK tiers, aucun script de réseau social chargé.

export type ShareTargetId =
  | "whatsapp"
  | "facebook"
  | "messenger"
  | "instagram"
  | "tiktok"
  | "snapchat"
  | "telegram"
  | "x"
  | "threads"
  | "bluesky"
  | "linkedin"
  | "reddit"
  | "email"
  | "sms";

export const SHARE_TARGET_ORDER: ShareTargetId[] = [
  "whatsapp",
  "facebook",
  "messenger",
  "instagram",
  "tiktok",
  "snapchat",
  "telegram",
  "x",
  "threads",
  "bluesky",
  "linkedin",
  "reddit",
  "email",
  "sms"
];

export type ShareTarget = {
  id: ShareTargetId;
  /** Lien d'intention ; null quand le réseau n'en propose pas. */
  href: string | null;
  /** "link" : ouvrir `href` ; "native" : partage du système, sinon copie du lien. */
  via: "link" | "native";
  /** Lien d'application (fb-messenger://) : utile seulement sur téléphone. */
  mobileOnly?: boolean;
};

export type ShareInput = { url: string; text: string; title: string };

export function buildShareTargets({ url, text, title }: ShareInput): ShareTarget[] {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(text);
  const ti = encodeURIComponent(title);
  const hrefs: Record<ShareTargetId, string | null> = {
    whatsapp: `https://wa.me/?text=${t}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    messenger: `fb-messenger://share/?link=${u}`,
    instagram: null,
    tiktok: null,
    snapchat: null,
    telegram: `https://t.me/share/url?url=${u}&text=${ti}`,
    x: `https://x.com/intent/tweet?text=${ti}&url=${u}`,
    threads: `https://www.threads.net/intent/post?text=${t}`,
    bluesky: `https://bsky.app/intent/compose?text=${t}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
    reddit: `https://www.reddit.com/submit?url=${u}&title=${ti}`,
    email: `mailto:?subject=${ti}&body=${t}`,
    sms: `sms:?&body=${t}`
  };
  return SHARE_TARGET_ORDER.map((id) => ({
    id,
    href: hrefs[id],
    via: hrefs[id] === null ? "native" : "link",
    ...(id === "messenger" ? { mobileOnly: true } : {})
  }));
}
