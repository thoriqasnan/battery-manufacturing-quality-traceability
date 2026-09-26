import type { ReactNode } from "react";

type PageLayoutProps = {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function PageLayout({
  eyebrow,
  title,
  description,
  actions,
  children,
}: PageLayoutProps) {
  return (
    <main id="main-content" className="min-w-0 flex-1 px-5 py-7 sm:px-8 sm:py-9 xl:px-10">
      <div className="mx-auto w-full max-w-[92rem]">
        <header className="flex flex-col gap-5 border-b border-slate-200 pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">{eyebrow}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.025em] text-slate-950 sm:text-4xl">{title}</h1>
            {description ? <p className="mt-3 max-w-3xl leading-7 text-slate-600">{description}</p> : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </header>
        <div className="py-7 sm:py-9">{children}</div>
      </div>
    </main>
  );
}
