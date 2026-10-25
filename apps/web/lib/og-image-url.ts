const OG_TRANSFORM = "c_fill,g_auto,w_1200,h_630,f_jpg,q_auto";

/**
 * Insère une transformation Cloudinary après « /upload/ ». Toute autre URL est
 * rendue telle quelle. Seul point qui fabrique des URL Cloudinary transformées.
 */
export function cloudinaryTransform(raw: string, transform: string): string {
  if (!raw.includes("res.cloudinary.com") || !raw.includes("/upload/")) return raw;
  if (raw.includes(`/upload/${transform}/`)) return raw;
  return raw.replace("/upload/", `/upload/${transform}/`);
}

/**
 * Image de partage (7.11-g) : une URL Cloudinary reçoit un recadrage 1200×630 ;
 * un autre hôte est rendu tel quel ; une URL illisible donne null.
 */
export function ogImageUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.hostname !== "res.cloudinary.com") return raw;
  return cloudinaryTransform(raw, OG_TRANSFORM);
}
