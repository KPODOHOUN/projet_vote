"use client";

import { useI18n } from "../lib/i18n-provider";
import { ImageUploadField } from "./image-upload-field";

type LogoUploadFieldProps = {
  value: string;
  onChange: (url: string) => void;
  token: string;
  label: string;
};

export function LogoUploadField({ value, onChange, token, label }: LogoUploadFieldProps) {
  const { locale } = useI18n();
  const isEn = locale === "en";

  return (
    <ImageUploadField
      value={value}
      onChange={onChange}
      token={token}
      label={label}
      urlPlaceholder={isEn ? "Or paste image URL" : "Ou coller l'URL de l'image"}
      preview={
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs text-muted-foreground">{isEn ? "Logo" : "Logo"}</span>
          )}
        </div>
      }
    />
  );
}
