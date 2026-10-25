// lib/image-resize.ts — Réduction des images dans le navigateur avant l'import :
// fichiers légers à stocker et à servir (base de données ou Cloudinary), photo
// de téléphone de 8 Mo ramenée à quelques centaines de Ko. Rien n'est envoyé
// à un service tiers pour cela.

export const MAX_IMAGE_SIDE = 1600;

/** Dimensions réduites pour que le plus grand côté tienne dans `max` ; jamais agrandies. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Prépare un fichier image pour l'import. Les GIF restent tels quels (animation).
 * Les PNG gardent leur transparence (logos) ; les autres formats deviennent du JPEG.
 * Si le navigateur ne sait pas lire l'image, le fichier d'origine est renvoyé :
 * l'API vérifiera son format.
 */
export async function prepareImageForUpload(file: File, max = MAX_IMAGE_SIDE): Promise<File> {
  if (typeof window === "undefined" || file.type === "image/gif") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  const size = fitWithin(bitmap.width, bitmap.height, max);
  const keepPng = file.type === "image/png";
  // Déjà petite et déjà dans un format servi tel quel : on n'y touche pas.
  if (!size || (size.width === bitmap.width && (keepPng || file.type === "image/jpeg") && file.size < 1_500_000)) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return file;
  }
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  const type = keepPng ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.86));
  if (!blob) return file;
  const name = file.name.replace(/\.[^.]+$/, "") + (keepPng ? ".png" : ".jpg");
  return new File([blob], name, { type });
}
