"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "@/components/language-switcher";
import { OverviewDashboard } from "@/components/dashboard/overview-dashboard";
import { TraceabilitySearch } from "@/components/traceability/traceability-search";
import { TraceabilityDetail } from "@/components/traceability/traceability-detail";
import type { AuthenticatedIdentity } from "@/lib/api/auth";
import { roleHasAnyPermission } from "@/lib/auth/permissions";
import { Link, usePathname } from "@/i18n/navigation";
import { navigationItems, navigationSections, NavigationGlyph } from "./navigation";
import { PageLayout } from "./page-layout";

type ApplicationShellProps = {
  user: AuthenticatedIdentity;
  error?: string;
  isLoggingOut: boolean;
  onLogout: () => Promise<void>;
  onSessionInvalid?: () => void;
};

function normalizedPath(pathname: string): string {
  const path = `/${pathname.split("/").filter(Boolean).join("/")}`;
  return path === "/" ? "/" : path.replace(/\/$/, "");
}

function decodedPathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function ApplicationShell({ user, error, isLoggingOut, onLogout, onSessionInvalid = () => undefined }: ApplicationShellProps) {
  const t = useTranslations("Shell");
  const pathname = normalizedPath(usePathname());
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const visibleSections = useMemo(
    () => navigationSections.map((section) => ({
      ...section,
      items: section.items.filter((item) => roleHasAnyPermission(user.role, item.permissions)),
    })).filter((section) => section.items.length > 0),
    [user.role],
  );
  const requestedItem = navigationItems.find((item) => item.href === pathname)
    ?? (pathname.startsWith("/traceability/") ? navigationItems.find((item) => item.key === "traceability") : undefined);
  const currentItem = requestedItem && roleHasAnyPermission(user.role, requestedItem.permissions)
    ? requestedItem
    : navigationItems[0];
  const isUnavailable = Boolean(requestedItem && requestedItem !== currentItem);
  const selectedTraceCode = currentItem.key === "traceability" && pathname.startsWith("/traceability/")
    ? decodedPathSegment(pathname.slice("/traceability/".length))
    : null;
  const initials = user.username.slice(0, 2).toUpperCase();

  useEffect(() => {
    if (!menuOpen) return;
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
        return;
      }
      if (event.key === "Tab" && drawerRef.current) {
        const focusable = Array.from(
          drawerRef.current.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        );
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  function closeMenu(restoreFocus = false) {
    setMenuOpen(false);
    if (restoreFocus) requestAnimationFrame(() => menuButtonRef.current?.focus());
  }

  const navigation = (
    <nav aria-label={t("navigationLabel")} className="mt-7 flex-1 overflow-y-auto px-3 pb-5">
      {visibleSections.map((section) => (
        <section key={section.key} className="mb-6" aria-labelledby={`nav-${section.key}`}>
          <h2 id={`nav-${section.key}`} className="px-3 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-slate-500">
            <span dir="auto">{t(`sections.${section.key}`)}</span>
          </h2>
          <ul className="mt-2 space-y-1">
            {section.items.map((item) => {
              const active = pathname === item.href || (item.key === "traceability" && pathname.startsWith("/traceability/"));
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => closeMenu()}
                    className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#071426] ${active ? "bg-blue-700 text-white" : "text-slate-300 hover:bg-white/8 hover:text-white"}`}
                  >
                    <NavigationGlyph name={item.key} className="size-5 shrink-0" />
                    <span dir="auto">{t(`items.${item.key}`)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );

  const identity = (
    <div className="border-t border-white/10 p-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold tracking-wider text-white" aria-hidden="true">{initials}</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white"><bdi dir="auto">{user.username}</bdi></p>
          <p className="mt-0.5 text-[0.65rem] font-bold tracking-[0.16em] text-slate-400"><bdi dir="ltr">{user.role}</bdi></p>
        </div>
      </div>
      <button type="button" onClick={() => void onLogout()} disabled={isLoggingOut} className="mt-3 flex min-h-11 w-full items-center justify-center rounded-lg border border-white/15 px-3 text-sm font-semibold text-slate-200 outline-none hover:bg-white/8 focus-visible:ring-2 focus-visible:ring-blue-300 disabled:opacity-50">
        <span dir="auto">{isLoggingOut ? t("signingOut") : t("signOut")}</span>
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <a href="#main-content" className="fixed start-4 top-3 z-[70] -translate-y-20 rounded-md bg-white px-4 py-2 font-semibold text-blue-800 shadow-lg outline-none focus:translate-y-0 focus:ring-2 focus:ring-blue-600">{t("skipToContent")}</a>
      <aside className="shell-sidebar hidden h-screen w-64 shrink-0 flex-col overflow-hidden bg-[#071426] text-white lg:sticky lg:top-0 lg:flex">
        <Brand />
        {navigation}
        {identity}
      </aside>

      {menuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={t("mobileMenuLabel")}>
          <button type="button" className="absolute inset-0 bg-slate-950/60" aria-label={t("dismissMenu")} onClick={() => closeMenu(true)} />
          <div ref={drawerRef} className="relative flex h-full w-[min(20rem,88vw)] flex-col overflow-hidden bg-[#071426] text-white shadow-2xl ltr:mr-auto rtl:ml-auto">
            <div className="flex items-center justify-between border-b border-white/10 pe-3">
              <Brand compact />
              <button ref={closeButtonRef} type="button" onClick={() => closeMenu(true)} className="flex size-11 items-center justify-center rounded-lg text-2xl text-slate-200 outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-blue-300" aria-label={t("closeMenu")}>×</button>
            </div>
            {navigation}
            {identity}
          </div>
        </div>
      ) : null}

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex min-h-16 items-center gap-2 border-b border-slate-200 bg-white/95 px-3 backdrop-blur sm:gap-3 sm:px-6 lg:px-8">
          <button ref={menuButtonRef} type="button" onClick={() => setMenuOpen(true)} className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-700 outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-600 lg:hidden" aria-label={t("openMenu")} aria-expanded={menuOpen}>
            <span aria-hidden="true" className="text-xl">☰</span>
          </button>
          <div className="min-w-0 flex-1">
            <p dir="auto" className="truncate text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{t(`sections.${isUnavailable ? "overview" : sectionFor(currentItem.key)}`)}</p>
            <p dir="auto" className="truncate text-sm font-semibold text-slate-950">{isUnavailable ? t("unavailable.title") : t(`items.${currentItem.key}`)}</p>
          </div>
          <LanguageSwitcher />
          <div className="hidden min-w-0 items-center gap-2 border-s border-slate-200 ps-4 sm:flex">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-[0.65rem] font-bold text-white" aria-hidden="true">{initials}</span>
            <div className="hidden min-w-0 xl:block">
              <p className="max-w-40 truncate text-sm font-semibold text-slate-900"><bdi dir="auto">{user.username}</bdi></p>
              <p className="text-[0.6rem] font-bold tracking-[0.14em] text-slate-500"><bdi dir="ltr">{user.role}</bdi></p>
            </div>
          </div>
        </header>

        {error ? <p dir="auto" role="alert" className="mx-5 mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:mx-8">{t("logoutError")}</p> : null}
        <PageLayout
          eyebrow={t(`sections.${isUnavailable ? "overview" : sectionFor(currentItem.key)}`)}
          title={isUnavailable ? t("unavailable.title") : t(`pages.${currentItem.key}.title`)}
          description={isUnavailable ? t("unavailable.description") : t(`pages.${currentItem.key}.description`)}
        >
          {!isUnavailable && currentItem.key === "overview" ? (
            <OverviewDashboard onUnauthenticated={onSessionInvalid} />
          ) : !isUnavailable && currentItem.key === "traceability" && pathname === "/traceability" ? (
            <TraceabilitySearch onUnauthenticated={onSessionInvalid} />
          ) : !isUnavailable && currentItem.key === "traceability" && selectedTraceCode !== null ? (
            <TraceabilityDetail key={selectedTraceCode} rawTraceCode={selectedTraceCode} onUnauthenticated={onSessionInvalid} />
          ) : <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="workspace-state-title">
            <div className="flex max-w-3xl gap-4">
              <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700" aria-hidden="true">◇</span>
              <div>
                <h2 dir="auto" id="workspace-state-title" className="text-base font-semibold text-slate-950">{isUnavailable ? t("unavailable.stateTitle") : t(`pages.${currentItem.key}.stateTitle`)}</h2>
                <p dir="auto" className="mt-2 leading-7 text-slate-600">{isUnavailable ? t("unavailable.stateDescription") : t(`pages.${currentItem.key}.stateDescription`)}</p>
              </div>
            </div>
          </section>}
        </PageLayout>
      </div>
    </div>
  );
}

function sectionFor(key: string): string {
  return navigationSections.find((section) => section.items.some((item) => item.key === key))?.key ?? "overview";
}

function Brand({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("Shell");
  return (
    <div className={`relative shrink-0 overflow-hidden ${compact ? "px-5 py-4" : "border-b border-white/10 px-6 py-6"}`}>
      <div className="industrial-grid opacity-30" aria-hidden="true" />
      <div className="relative">
        <p className="text-xl font-bold tracking-[0.17em]"><bdi dir="ltr">BMQT</bdi></p>
        <p dir="auto" className="mt-1 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-slate-400">{t("brandSubtitle")}</p>
      </div>
    </div>
  );
}
