import { useTranslations } from "next-intl";

const capabilities = ["trace", "quality", "control"] as const;

export function BrandPanel() {
  const t = useTranslations("Auth.brand");

  return (
    <section className="industrial-panel relative hidden min-h-screen overflow-hidden bg-[#071426] px-10 py-10 text-white lg:flex lg:flex-col lg:justify-between xl:px-16 xl:py-14">
      <div className="industrial-grid" aria-hidden="true" />
      <div className="relative z-10">
        <p className="text-3xl font-bold tracking-[0.18em]">BMQT</p>
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">
          {t("subtitle")}
        </p>

        <div className="mt-12 inline-flex min-h-10 items-center gap-3 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-slate-100 backdrop-blur-sm">
          <span className="size-2.5 shrink-0 rounded-full bg-emerald-400 ring-4 ring-emerald-400/15" aria-hidden="true" />
          {t("workspace")}
        </div>

        <h1 className="mt-10 max-w-xl text-4xl font-semibold leading-[1.12] tracking-[-0.025em] xl:text-6xl">
          {t("headlineLine1")}
          <br />
          {t("headlineLine2")}
          <br />
          <span className="text-blue-400">{t("headlineLine3")}</span>
        </h1>
        <p className="mt-7 max-w-lg text-base leading-7 text-slate-300 xl:text-lg xl:leading-8">
          {t("description")}
        </p>
      </div>

      <div className="relative z-10 grid grid-cols-3 gap-5 border-t border-white/15 pt-7">
        {capabilities.map((capability) => (
          <div key={capability} className="min-w-0">
            <span className="mb-3 block h-px w-8 bg-blue-400" aria-hidden="true" />
            <p className="text-xs font-bold tracking-[0.16em] text-slate-100">
              {t(`${capability}.label`)}
            </p>
            <p className="mt-1 text-sm leading-5 text-slate-400">
              {t(`${capability}.description`)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
