import type { Metadata } from "next";
import Link from "next/link";

import QuoteExtractionForm from "@/components/quote-extraction-form";
import {
  APP_NAME,
  CURRENT_STAGE,
  CURRENT_STAGE_LABEL,
} from "@/lib/app-meta";
import { DEMO_QUOTE_TEXT } from "@/lib/demo-quote-text";

export const metadata: Metadata = {
  title: `粘贴报价 | ${APP_NAME}`,
  description: "把供应商报价文本转换成可核对的结构化草稿。",
};

export default function NewQuotePage() {
  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <div className="mx-auto max-w-7xl px-6 py-8 sm:py-10">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-5">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-900 text-lg font-bold text-white"
              aria-label="返回首页"
            >
              菜
            </Link>
            <div>
              <p className="font-semibold tracking-tight">{APP_NAME}</p>
              <p className="text-xs text-stone-500">
                阶段 {CURRENT_STAGE} / 12 · {CURRENT_STAGE_LABEL}
              </p>
            </div>
          </div>

          <Link
            href="/"
            className="text-sm font-medium text-stone-500 transition hover:text-stone-900"
          >
            ← 返回首页
          </Link>
        </header>

        <section className="grid gap-8 py-10 lg:grid-cols-[1fr_320px] lg:items-start">
          <div>
            <p className="mb-3 text-sm font-semibold tracking-wide text-emerald-800">
              第五阶段 · 报价文本提取
            </p>
            <h1 className="max-w-3xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              粘贴报价，先生成一份
              <span className="text-emerald-800">可核对的草稿。</span>
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-600">
              这一版只处理纯文本：提取食材、数量、包装、价格、单位和证据。
              提取结果会保存为报价草稿，不会修改任何正式食材价格。
            </p>
          </div>

          <aside className="rounded-2xl border border-stone-200 bg-white p-5 text-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-stone-400">
              本阶段边界
            </p>
            <ul className="mt-3 space-y-2 text-stone-600">
              <li>· 只支持粘贴文本</li>
              <li>· 默认 mock，不需要 AI Key</li>
              <li>· 低置信度字段会变成确认问题</li>
              <li>· 不计算成本，不改价</li>
            </ul>
          </aside>
        </section>

        <QuoteExtractionForm sampleText={DEMO_QUOTE_TEXT} />

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-5 text-xs text-stone-500">
          <p>报价原文、字段证据和置信度会一起保留。</p>
          <p>下一步：图片和 PDF 报价单</p>
        </footer>
      </div>
    </main>
  );
}
