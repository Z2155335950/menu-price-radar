import Link from "next/link";
import type { ReactNode } from "react";

import { APP_NAME } from "@/lib/app-meta";

type AppShellProps = {
  active: "dashboard" | "quote" | "catalog" | "dishes" | "report";
  quoteId?: number;
  children: ReactNode;
};

function GridIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <path
        d="M3.5 3.5h5v5h-5v-5Zm8 0h5v5h-5v-5Zm-8 8h5v5h-5v-5Zm8 0h5v5h-5v-5Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <path
        d="M10 13V3.5m0 0L6.5 7M10 3.5 13.5 7M4 12.5v3A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5v-3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <path
        d="M3.5 16.5V9.75m4.33 6.75V5.5m4.34 11V8.25m4.33 8.25V3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CatalogIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <path
        d="M4 4.5h12v11H4v-11Zm0 3.5h12M8 8v7.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DishIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <path
        d="M3.5 10.5h13a6.5 6.5 0 0 1-13 0Zm3-2.5c0-1.2.6-1.8 1.5-2.5S9.5 4 9.5 2.5m4 5.5c0-1.2.6-1.8 1.5-2.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowUpRightIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
      <path
        d="M4.5 11.5 11.5 4.5m0 0H5.75m5.75 0V10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BrandMark() {
  return (
    <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-brand text-white shadow-sm">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-5 w-5">
        <path
          d="M6 19c0-6.5 4.3-11 12-11 0 7.4-4.7 11-12 11Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M6 19c4.4-.8 7.7-3.3 9.8-7.2"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

const navigation = [
  { id: "dashboard", href: "/", label: "工作台", icon: GridIcon },
  { id: "quote", href: "/quotes/new", label: "处理报价", icon: UploadIcon },
  { id: "catalog", href: "/catalog", label: "食材资料", icon: CatalogIcon },
  { id: "dishes", href: "/dishes", label: "菜品资料", icon: DishIcon },
] as const;

export default function AppShell({
  active,
  quoteId,
  children,
}: AppShellProps) {
  const pageTitle =
    active === "dashboard"
      ? "工作台"
      : active === "quote"
        ? "报价处理"
        : active === "catalog"
          ? "食材资料"
          : active === "dishes"
            ? "菜品资料"
            : "风险分析";

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-line bg-white lg:flex">
        <div className="flex h-[72px] items-center gap-3 border-b border-line px-5">
          <BrandMark />
          <div>
            <p className="text-[15px] font-semibold tracking-tight">{APP_NAME}</p>
            <p className="mt-0.5 text-[11px] text-muted">食材成本控制台</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-5">
          <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            运营
          </p>
          <div className="mt-2 space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === active;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    isActive
                      ? "bg-brand-soft text-brand-strong"
                      : "text-ink-soft hover:bg-canvas hover:text-ink"
                  }`}
                >
                  <Icon />
                  {item.label}
                </Link>
              );
            })}

            {quoteId ? (
              <Link
                href={`/quotes/${quoteId}`}
                aria-current={active === "report" ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  active === "report"
                    ? "bg-brand-soft text-brand-strong"
                    : "text-ink-soft hover:bg-canvas hover:text-ink"
                }`}
              >
                <ChartIcon />
                本次分析
              </Link>
            ) : null}
          </div>

          <p className="mt-8 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            数据
          </p>
          <div className="mt-2 rounded-xl border border-line bg-canvas/70 px-3 py-3">
            <p className="text-xs font-semibold text-ink">临江小馆</p>
            <p className="mt-1 text-[11px] leading-5 text-muted">
              单门店 · 本地数据
            </p>
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-brand">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              本地数据已连接
            </div>
          </div>
        </nav>

        <div className="border-t border-line p-4">
          <div className="flex items-center gap-2.5 rounded-xl bg-canvas/70 px-3 py-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-soft text-[11px] font-bold text-brand-strong">
              采
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-ink">采购负责人</p>
              <p className="text-[10px] text-muted">临江小馆 · 单门店</p>
            </div>
          </div>
          <p className="mt-3 px-1 text-[10px] text-muted">
            菜价雷达 · 本地版
          </p>
        </div>
      </aside>

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur-md">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex items-center gap-2.5 lg:hidden">
                <BrandMark />
                <span className="text-sm font-semibold">{APP_NAME}</span>
              </div>
              <div className="hidden min-w-0 items-center gap-2 text-sm lg:flex">
                <span className="text-muted">临江小馆</span>
                <span className="text-line-strong">/</span>
                <span className="font-medium text-ink">{pageTitle}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <span className="hidden items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-[11px] font-medium text-ink-soft sm:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                本地环境
              </span>
              {active !== "quote" ? (
                <Link
                  href="/quotes/new"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-strong"
                >
                  处理新报价
                  <ArrowUpRightIcon />
                </Link>
              ) : null}
              <div className="grid h-8 w-8 place-items-center rounded-full border border-line bg-white text-[11px] font-bold text-brand-strong">
                采
              </div>
            </div>
          </div>

          <nav className="flex gap-1 overflow-x-auto border-t border-line/70 px-3 py-2 lg:hidden">
            {navigation.map((item) => {
              const isActive = item.id === active;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium ${
                    isActive
                      ? "bg-brand-soft text-brand-strong"
                      : "text-muted hover:bg-white hover:text-ink"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            {quoteId ? (
              <Link
                href={`/quotes/${quoteId}`}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium ${
                  active === "report"
                    ? "bg-brand-soft text-brand-strong"
                    : "text-muted hover:bg-white hover:text-ink"
                }`}
              >
                本次分析
              </Link>
            ) : null}
          </nav>
        </header>

        <main className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
