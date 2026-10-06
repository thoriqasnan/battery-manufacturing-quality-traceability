"use client";

import { useLocale, useTranslations } from "next-intl";
import { ChangeEvent, useLayoutEffect, useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { AppLocale, localeRegistry } from "@/i18n/routing";
import { prepareTraceabilityDisclosureLocaleHandoff } from "@/lib/traceability-disclosure-state";

type PendingLocaleScroll = {
  href: string;
  locale: AppLocale;
  x: number;
  y: number;
};

let pendingLocaleScroll: PendingLocaleScroll | null = null;

export function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("LanguageSwitcher");
  const [isPending, startTransition] = useTransition();

  useLayoutEffect(() => {
    const target = pendingLocaleScroll;
    if (!target) return;
    if (locale !== target.locale) return;
    if (`${pathname}${window.location.search}` !== target.href) {
      pendingLocaleScroll = null;
      return;
    }
    const targetX = target.x;
    const targetY = target.y;

    let firstFrame = 0;
    let secondFrame = 0;
    let expiry = 0;
    let observer: ResizeObserver | null = null;

    function cleanup() {
      if (firstFrame) cancelAnimationFrame(firstFrame);
      if (secondFrame) cancelAnimationFrame(secondFrame);
      if (expiry) window.clearTimeout(expiry);
      observer?.disconnect();
    }

    function restore(finalAttempt = false) {
      if (pendingLocaleScroll !== target) return;
      const maximumY = Math.max(0, document.documentElement.scrollHeight, document.body.scrollHeight) - window.innerHeight;
      window.scrollTo(targetX, Math.min(targetY, Math.max(0, maximumY)));
      if (maximumY >= targetY || finalAttempt) {
        pendingLocaleScroll = null;
        cleanup();
      }
    }

    restore();
    if (pendingLocaleScroll === target) {
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(() => restore());
        observer.observe(document.documentElement);
        observer.observe(document.body);
      }
      firstFrame = requestAnimationFrame(() => {
        restore();
        secondFrame = requestAnimationFrame(() => restore());
      });
      expiry = window.setTimeout(() => restore(true), 2000);
    }

    return cleanup;
  }, [locale, pathname]);

  function handleLocaleChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextLocale = event.target.value as AppLocale;
    const search = window.location.search;
    const href = `${pathname}${search}`;

    pendingLocaleScroll = {
      href,
      locale: nextLocale,
      x: window.scrollX,
      y: window.scrollY,
    };
    prepareTraceabilityDisclosureLocaleHandoff();

    startTransition(() => {
      router.replace(href, { locale: nextLocale, scroll: false });
    });
  }

  return (
    <div className="flex shrink-0 items-center gap-0 sm:gap-2">
      <label
        className="sr-only text-sm font-medium text-slate-700 sm:not-sr-only"
        htmlFor="locale-switcher"
      >
        {t("label")}
      </label>
      <select
        id="locale-switcher"
        className="min-h-11 max-w-28 rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 shadow-sm outline-none focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/25 disabled:cursor-wait disabled:opacity-70 sm:max-w-48 sm:px-3"
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
