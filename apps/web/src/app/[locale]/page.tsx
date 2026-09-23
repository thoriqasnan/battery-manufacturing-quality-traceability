import { getTranslations } from "next-intl/server";
import { ApiStatus } from "@/components/api-status";
import { LanguageSwitcher } from "@/components/language-switcher";

export default async function HomePage() {
  const t = await getTranslations("HomePage");

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16 sm:px-10">
      <section
        className="w-full max-w-3xl border-s-4 border-blue-600 bg-white px-6 py-10 shadow-sm sm:px-10 sm:py-14"
        aria-labelledby="page-title"
      >
        <div className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:gap-8">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">
            {t("phase")}
          </p>
          <LanguageSwitcher />
        </div>
        <h1
          id="page-title"
          className="mt-5 max-w-2xl text-3xl font-semibold tracking-tight text-slate-950 sm:text-5xl sm:leading-tight"
        >
          {t("title")}
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
          {t("description")}
        </p>
        <ApiStatus />
      </section>
    </main>
  );
}
