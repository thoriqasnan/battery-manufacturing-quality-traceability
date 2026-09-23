"use client";

import { useLocale, useTranslations } from "next-intl";
import { ChangeEvent, useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { AppLocale, localeRegistry } from "@/i18n/routing";

export function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("LanguageSwitcher");
  const [isPending, startTransition] = useTransition();

  function handleLocaleChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextLocale = event.target.value as AppLocale;

    startTransition(() => {
      router.replace(pathname, { locale: nextLocale });
    });
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <label
        className="text-sm font-medium text-slate-700"
        htmlFor="locale-switcher"
      >
        {t("label")}
      </label>
      <select
        id="locale-switcher"
        className="max-w-48 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/25 disabled:cursor-wait disabled:opacity-70"
        value={locale}
        onChange={handleLocaleChange}
        disabled={isPending}
      >
        {localeRegistry.map(({ code, label }) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}
