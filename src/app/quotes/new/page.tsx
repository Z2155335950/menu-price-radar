import type { Metadata } from "next";

import AppShell from "@/components/app-shell";
import QuoteExtractionForm from "@/components/quote-extraction-form";
import { APP_NAME } from "@/lib/app-meta";
import { DEMO_QUOTE_TEXT } from "@/lib/demo-quote-text";

export const metadata: Metadata = {
  title: `处理报价 | ${APP_NAME}`,
  description: "导入供应商报价，核对食材和单位，再生成成本风险分析。",
};

const steps = [
  ["01", "导入", "上传或粘贴"],
  ["02", "提取", "识别报价行"],
  ["03", "核对", "确认异常项"],
  ["04", "分析", "生成风险清单"],
];

export default function NewQuotePage() {
  return (
    <AppShell active="quote">
      <header className="flex flex-wrap items-end justify-between gap-6 pb-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">
            报价处理 · 新报价
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-ink">
            导入供应商报价
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-ink-soft">
            先识别报价行，再核对食材和包装。确认完成后，系统才会应用新价格并计算风险。
          </p>
        </div>

        <div className="hidden items-center gap-2 text-[11px] text-muted md:flex">
          <span className="rounded-full border border-line bg-white px-2.5 py-1">
            PDF / 图片 / 文本
          </span>
          <span className="rounded-full border border-line bg-white px-2.5 py-1">
            单文件最大 10 MB
          </span>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_292px] xl:items-start">
        <div className="min-w-0">
          <QuoteExtractionForm sampleText={DEMO_QUOTE_TEXT} />
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24">
          <section className="rounded-2xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(20,35,28,0.03)]">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-tight">处理进度</h2>
              <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
                Workflow
              </span>
            </div>

            <ol className="mt-4 space-y-0">
              {steps.map(([step, title, detail], index) => (
                <li key={step} className="relative flex gap-3 pb-4 last:pb-0">
                  {index < steps.length - 1 ? (
                    <span className="absolute left-[13px] top-7 h-full w-px bg-line" />
                  ) : null}
                  <span
                    className={`relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full border text-[10px] font-semibold ${
                      index < 3
                        ? "border-brand bg-brand-soft text-brand-strong"
                        : "border-line bg-white text-muted"
                    }`}
                  >
                    {step}
                  </span>
                  <div className="pt-0.5">
                    <p className="text-xs font-semibold text-ink">{title}</p>
                    <p className="mt-0.5 text-[11px] text-muted">{detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="text-sm font-semibold tracking-tight">本步边界</h2>
            <ul className="mt-3 space-y-2.5 text-[11px] leading-5 text-muted">
              <li>· 提取只生成报价草稿</li>
              <li>· 匹配和换算不改正式价格</li>
              <li>· 未确认的包装不会进入成本计算</li>
              <li>· 确认后才允许应用价格历史</li>
            </ul>
          </section>

          <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-800">
              识别说明
            </p>
            <p className="mt-2 text-[11px] leading-5 text-amber-900/80">
              当前识别模式只支持内置样例图片；电子 PDF 会读取文字层。
              扫描件或更自由的格式，可以直接粘贴文本。
            </p>
          </section>
        </aside>
      </div>

      <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-[11px] text-muted">
        <p>报价原文、字段证据和确认记录会一起保留。</p>
        <p>所有数字都在本地计算，不依赖外部模型。</p>
      </footer>
    </AppShell>
  );
}
