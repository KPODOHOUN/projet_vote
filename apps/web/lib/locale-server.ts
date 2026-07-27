import { cookies } from "next/headers";
import { defaultLocale, type Locale } from "./i18n";
import { LOCALE_COOKIE } from "./locale-constants";

export async function getServerLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const value = cookieStore.get(LOCALE_COOKIE)?.value;
  if (value === "en" || value === "fr") {
    return value;
  }
  return defaultLocale;
}
