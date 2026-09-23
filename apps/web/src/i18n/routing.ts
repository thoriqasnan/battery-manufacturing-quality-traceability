import { defineRouting } from "next-intl/routing";

export const localeRegistry = [
  { code: "en", label: "English", direction: "ltr" },
  { code: "zh-CN", label: "简体中文", direction: "ltr" },
  { code: "de", label: "Deutsch", direction: "ltr" },
  { code: "ko", label: "한국어", direction: "ltr" },
  { code: "ja", label: "日本語", direction: "ltr" },
  { code: "ar", label: "العربية", direction: "rtl" },
  { code: "id", label: "Bahasa Indonesia", direction: "ltr" },
  { code: "hi", label: "हिन्दी", direction: "ltr" },
] as const;

export type AppLocale = (typeof localeRegistry)[number]["code"];

export const defaultLocale: AppLocale = "en";
export const locales = localeRegistry.map(({ code }) => code);

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "as-needed",
  localeCookie: {
    name: "PROJECT_LOCALE",
    maxAge: 60 * 60 * 24 * 365,
  },
});

export function getLocaleDirection(locale: AppLocale): "ltr" | "rtl" {
  return (
    localeRegistry.find(({ code }) => code === locale)?.direction ?? "ltr"
  );
}
