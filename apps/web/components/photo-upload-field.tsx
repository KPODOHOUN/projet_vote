"use client";

import { ImageUploadField } from "./image-upload-field";
import { CandidatePhoto } from "./candidate-photo";
import { useI18n } from "../lib/i18n-provider";

/**
 * Champ photo candidat : import de fichier (galerie, appareil photo,
 * ordinateur) ou glisser-déposer, aperçu au format 3:4 de la page publique.
 * Pilote toujours `value` (= photoUrl).
 */
export function PhotoUploadField({
  value,
  onChange,
  token,
  label,
  fullName
}: {
  value: string;
  onChange: (url: string) => void;
  token: string;
  label: string;
  fullName: string;
}) {
  const { t } = useI18n();
  return (
    <ImageUploadField
      value={value}
      onChange={onChange}
      token={token}
      label={label}
      hint={t("upload.cropHint")}
      preview={
        <div className="aspect-[3/4] w-24 overflow-hidden rounded-md bg-muted">
          <CandidatePhoto photoUrl={value || null} fullName={fullName || "?"} size="sm" className="h-full w-full object-cover" />
        </div>
      }
    />
  );
}
