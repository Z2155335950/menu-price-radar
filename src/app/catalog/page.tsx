import type { Metadata } from "next";

import AppShell from "@/components/app-shell";
import CatalogManager from "@/components/catalog-manager";
import { APP_NAME } from "@/lib/app-meta";

export const metadata: Metadata = {
  title: `食材资料 | ${APP_NAME}`,
  description: "搜索和维护标准食材、别名及食材专属包装单位换算。",
};

export default function CatalogPage() {
  return (
    <AppShell active="catalog">
      <header className="flex flex-wrap items-end justify-between gap-6 pb-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">
            食材资料 · 简单管理
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-ink">
            找食材，改名称和包装
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-ink-soft">
            常见叫法可以随时补充；瓶、桶、箱有多大，也可以按不同食材分别设置。
          </p>
        </div>

        <div className="rounded-xl border border-line bg-white px-4 py-3 text-[11px] leading-5 text-muted">
          每种食材单独计算
          <span className="mx-2 text-line-strong">·</span>
          修改都有记录
        </div>
      </header>

      <CatalogManager />
    </AppShell>
  );
}
