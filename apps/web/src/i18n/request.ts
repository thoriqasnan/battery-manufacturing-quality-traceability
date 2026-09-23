import * as rootParams from "next/root-params";
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

export default getRequestConfig(async ({ locale }) => {
  if (!locale) {
    const requestedLocale = await rootParams.locale();
    locale = hasLocale(routing.locales, requestedLocale)
      ? requestedLocale
      : routing.defaultLocale;
  }

  const englishMessages = (await import("../../messages/en.json")).default;
  const messages =
    locale === "id"
      ? (await import("../../messages/id.json")).default
      : englishMessages;

  return {
    locale,
    messages,
  };
});
