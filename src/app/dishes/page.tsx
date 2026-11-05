import type { Metadata } from "next";

import AppShell from "@/components/app-shell";
import DishManager from "@/components/dish-manager";
import { APP_NAME } from "@/lib/app-meta";

export const metadata: Metadata = {
  title: `菜品资料 | ${APP_NAME}`,
  description: "搜索、新增和修改菜品售价、周销量及每份配方。",
};

export default function DishesPage() {
  return (
    <AppShell active="dishes">
      <header className="flex flex-wrap items-end justify-between gap-6 pb-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">
            菜品资料 · 简单管理
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-ink">
            添加菜品，写清每份配方
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-ink-soft">
            搜索已有菜品，或者添加新菜名、售价、周销量和每份使用多少食材。
          </p>
        </div>

        <div className="rounded-xl border border-line bg-white px-4 py-3 text-[11px] leading-5 text-muted">
          菜品配方按统一单位计算
          <span className="mx-2 text-line-strong">·</span>
          修改都有记录
        </div>
      </header>

      <DishManager />
    </AppShell>
  );
}
