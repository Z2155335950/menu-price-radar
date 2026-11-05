import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import AnalyzeButton from "@/components/analyze-button";
import AppShell from "@/components/app-shell";
import type {
  AnalysisAdvice,
  AnalysisDishResultView,
} from "@/domain/analysis";
import type { RiskLevel } from "@/domain/risk";
import { loadQuoteReport } from "@/lib/quote-report";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export const metadata: Metadata = {
  title: "毛利风险分析 | 菜价雷达",
};

function formatYuan(microYuan: number | null): string {
  if (microYuan === null) {
    return "—";
  }

  return `¥${(microYuan / 1_000_000).toFixed(2)}`;
}

function formatRate(bps: number | null): string {
  if (bps === null) {
    return "—";
  }

  return `${(bps / 100).toFixed(1)}%`;
}

function formatQuantity(quantity: number, baseUnit: string): string {
  if (baseUnit === "g" || baseUnit === "ml") {
    return `${(quantity / 1000).toLocaleString("zh-CN", {
      maximumFractionDigits: 3,
    })} ${baseUnit === "g" ? "kg" : "L"}`;
  }

  return `${quantity.toLocaleString("zh-CN")} ${baseUnit}`;
}

function formatUnitPrice(
  microYuanPerBaseUnit: number,
  baseUnit: string,
): string {
  if (baseUnit === "g") {
    return `¥${((microYuanPerBaseUnit * 1000) / 1_000_000).toFixed(2)}/kg`;
  }

  if (baseUnit === "ml") {
    return `¥${((microYuanPerBaseUnit * 1000) / 1_000_000).toFixed(2)}/L`;
  }

  return `¥${(microYuanPerBaseUnit / 1_000_000).toFixed(2)}/个`;
}

function riskLabel(level: RiskLevel): string {
  const labels: Record<RiskLevel, string> = {
    critical: "严重",
    warning: "警告",
    watch: "观察",
    normal: "正常",
    insufficient_data: "数据不足",
  };
  return labels[level];
}

function riskPillClass(level: RiskLevel): string {
  if (level === "critical") {
    return "bg-red-50 text-red-700 ring-red-200";
  }

  if (level === "warning") {
    return "bg-amber-50 text-amber-800 ring-amber-200";
  }

  if (level === "watch") {
    return "bg-canvas text-ink-soft ring-line-strong";
  }

  return "bg-brand-soft text-brand-strong ring-brand/15";
}

function riskDotClass(level: RiskLevel): string {
  if (level === "critical") {
    return "bg-red-500";
  }

  if (level === "warning") {
    return "bg-amber-500";
  }

  if (level === "watch") {
    return "bg-stone-400";
  }

  return "bg-brand";
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    ready: "待应用价格",
    applied: "价格已应用",
    needs_confirmation: "待确认",
    extracted: "已提取",
    failed: "处理失败",
  };
  return labels[status] ?? status;
}

function statusClass(status: string): string {
  if (status === "applied") {
    return "bg-brand-soft text-brand-strong ring-brand/15";
  }

  if (status === "needs_confirmation") {
    return "bg-amber-50 text-amber-800 ring-amber-200";
  }

  return "bg-canvas text-muted ring-line";
}

function adviceLabel(type: AnalysisAdvice["type"]): string {
  const labels: Record<AnalysisAdvice["type"], string> = {
    verify_quote: "核对报价",
    negotiate: "议价",
    adjust_portion: "调整分量",
    adjust_price: "调整售价",
    substitute: "更换食材",
    observe: "继续观察",
  };
  return labels[type];
}

function eventLabel(eventType: string): string {
  const labels: Record<string, string> = {
    quote_extracted: "提取报价",
    quote_standardized: "匹配和换算",
    confirmation_recorded: "用户确认",
    prices_applied: "写入价格历史",
    analysis_started: "开始计算",
    analysis_completed: "完成计算",
    advice_generated: "生成建议",
  };
  return labels[eventType] ?? eventType;
}

function actorLabel(actorType: string): string {
  if (actorType === "user") {
    return "操作员";
  }

  if (actorType === "system") {
    return "系统";
  }

  return actorType;
}

function actorName(
  actorType: string,
  actorLabelValue: string | null,
): string | null {
  if (actorLabelValue === "演示操作员") {
    return "采购负责人";
  }

  return actorLabelValue ?? actorLabel(actorType);
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function RateBar({
  valueBps,
  targetBps,
}: {
  valueBps: number | null;
  targetBps: number | null;
}) {
  if (valueBps === null) {
    return <span className="text-[11px] text-muted">—</span>;
  }

  const width = Math.min(100, Math.max(3, (valueBps / 6000) * 100));
  const targetWidth =
    targetBps === null ? null : Math.min(100, (targetBps / 6000) * 100);

  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div className="relative h-1 w-24 overflow-hidden rounded-full bg-canvas">
        <div
          className={`h-full rounded-full ${
            valueBps >= 4000
              ? "bg-red-500"
              : valueBps >= 3000
                ? "bg-amber-500"
                : "bg-brand"
          }`}
          style={{ width: `${width}%` }}
        />
        {targetWidth !== null ? (
          <span
            className="absolute top-0 h-full w-px bg-ink/35"
            style={{ left: `${targetWidth}%` }}
          />
        ) : null}
      </div>
      <span className="text-[10px] tabular text-muted">
        目标 {formatRate(targetBps)}
      </span>
    </div>
  );
}

function RiskRow({ result }: { result: AnalysisDishResultView }) {
  return (
    <tr className="group align-top transition hover:bg-canvas/40">
      <td className="px-4 py-4">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-canvas text-[10px] font-semibold tabular text-muted group-hover:bg-white">
          {String(result.rankPosition).padStart(2, "0")}
        </span>
      </td>
      <td className="px-4 py-4">
        <a
          href={`#dish-${result.id}`}
          className="font-medium text-ink transition hover:text-brand"
        >
          {result.dishName}
        </a>
        <p className="mt-1 text-[11px] text-muted">
          {result.calculation.mainIngredient
            ? `${result.calculation.mainIngredient.name}采购价`
            : "没有明确主料"}
          {result.calculation.priceChangeRatio !== null
            ? `${result.calculation.priceChangeRatio >= 0 ? "上涨" : "下降"} ${(Math.abs(
                result.calculation.priceChangeRatio * 100
              )).toFixed(1)}%`
            : ""}
        </p>
      </td>
      <td className="px-4 py-4">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${riskPillClass(result.riskLevel)}`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${riskDotClass(result.riskLevel)}`}
          />
          {riskLabel(result.riskLevel)}
        </span>
      </td>
      <td className="px-4 py-4">
        <p className="font-semibold tabular text-ink">
          {result.weeklyImpactMicroYuan !== null
            ? formatYuan(result.weeklyImpactMicroYuan)
            : "缺少销量"}
        </p>
        <p className="mt-0.5 text-[10px] text-muted">
          {result.weeklySales !== null
            ? `${result.weeklySales} 份 / 周`
            : "不估算周金额"}
        </p>
      </td>
      <td className="px-4 py-4 text-xs tabular text-ink-soft">
        <p>
          {formatYuan(result.costBeforeMicroYuan)}
          <span className="mx-1 text-line-strong">→</span>
          {formatYuan(result.costAfterMicroYuan)}
        </p>
        <p className="mt-0.5 text-[10px] text-muted">单份食材成本</p>
      </td>
      <td className="px-4 py-4">
        <p className="text-xs font-medium tabular text-ink">
          {formatRate(result.foodCostRateBeforeBps)}
          <span className="mx-1 text-line-strong">→</span>
          {formatRate(result.foodCostRateAfterBps)}
        </p>
        <RateBar
          valueBps={result.foodCostRateAfterBps}
          targetBps={result.targetFoodCostRateBps}
        />
      </td>
    </tr>
  );
}

function RiskTable({ results }: { results: AnalysisDishResultView[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1040px] text-left text-sm">
        <thead className="bg-canvas/70 text-[10px] uppercase tracking-[0.08em] text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">排名</th>
            <th className="px-4 py-3 font-medium">菜品</th>
            <th className="px-4 py-3 font-medium">风险</th>
            <th className="px-4 py-3 font-medium">预计周影响</th>
            <th className="px-4 py-3 font-medium">成本变化</th>
            <th className="px-4 py-3 font-medium">食材成本率</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {results.map((result) => (
            <RiskRow key={result.id} result={result} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdviceCards({ advice }: { advice: AnalysisAdvice[] }) {
  if (advice.length === 0) {
    return <p className="text-sm text-muted">当前没有额外行动建议。</p>;
  }

  return (
    <div className="grid gap-2.5 md:grid-cols-2">
      {advice.map((item, index) => (
        <article
          key={`${item.type}-${index}`}
          className="rounded-lg border border-line bg-canvas/50 p-3.5"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand">
            {adviceLabel(item.type)}
          </p>
          <h4 className="mt-1 text-xs font-semibold text-ink">{item.title}</h4>
          <p className="mt-1.5 text-[11px] leading-5 text-muted">
            {item.detail}
          </p>
        </article>
      ))}
    </div>
  );
}

function DishDetail({ result }: { result: AnalysisDishResultView }) {
  return (
    <details
      id={`dish-${result.id}`}
      className="group scroll-mt-24 overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(20,35,28,0.03)] open:border-line-strong"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-canvas text-[11px] font-semibold tabular text-muted">
            {String(result.rankPosition).padStart(2, "0")}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">
              {result.dishName}
            </p>
            <p className="mt-0.5 text-[11px] text-muted">
              {result.calculation.mainIngredient
                ? `${result.calculation.mainIngredient.name}涨价导致`
                : "成本变化"}{" "}
              ·{" "}
              {result.weeklyImpactMicroYuan !== null
                ? `预计周影响 ${formatYuan(result.weeklyImpactMicroYuan)}`
                : "缺少周销量"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${riskPillClass(result.riskLevel)}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${riskDotClass(result.riskLevel)}`}
            />
            {riskLabel(result.riskLevel)}
          </span>
          <svg
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
            className="h-4 w-4 text-muted transition group-open:rotate-180"
          >
            <path
              d="m4 6 4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </summary>

      <div className="border-t border-line px-5 py-5">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-canvas/70 p-3">
            <p className="text-[10px] text-muted">涨价前成本</p>
            <p className="mt-1 text-lg font-semibold tabular">
              {formatYuan(result.costBeforeMicroYuan)}
            </p>
          </div>
          <div className="rounded-lg bg-canvas/70 p-3">
            <p className="text-[10px] text-muted">涨价后成本</p>
            <p className="mt-1 text-lg font-semibold tabular">
              {formatYuan(result.costAfterMicroYuan)}
            </p>
          </div>
          <div className="rounded-lg bg-canvas/70 p-3">
            <p className="text-[10px] text-muted">食材成本率</p>
            <p className="mt-1 text-lg font-semibold tabular">
              {formatRate(result.foodCostRateBeforeBps)}
              <span className="mx-1 text-sm font-normal text-muted">→</span>
              {formatRate(result.foodCostRateAfterBps)}
            </p>
          </div>
          <div className="rounded-lg bg-canvas/70 p-3">
            <p className="text-[10px] text-muted">目标 / 售价</p>
            <p className="mt-1 text-lg font-semibold tabular">
              {formatRate(result.targetFoodCostRateBps)}
              <span className="mx-1 text-sm font-normal text-muted">/</span>
              {formatYuan(result.calculation.sellingPriceMicroYuan)}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border border-amber-100 bg-amber-50/70 px-3.5 py-2.5 text-[11px] leading-5 text-amber-900">
          <span>{result.calculation.riskReason}</span>
          <span className="text-amber-800/60">·</span>
          <span>
            {result.weeklySales === null
              ? "缺少周销量，未估算周金额"
              : `周销量 ${result.weeklySales} 份`}
          </span>
        </div>

        <div className="mt-5 overflow-hidden rounded-xl border border-line">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-canvas/70 text-[10px] uppercase tracking-[0.08em] text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">食材</th>
                  <th className="px-4 py-2.5 font-medium">单份用量</th>
                  <th className="px-4 py-2.5 font-medium">旧价 → 新价</th>
                  <th className="px-4 py-2.5 font-medium">旧成本 → 新成本</th>
                  <th className="px-4 py-2.5 font-medium">报价证据</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {result.calculation.ingredients.map((ingredient) => (
                  <tr key={ingredient.ingredientId} className="align-top">
                    <td className="px-4 py-3 text-xs font-medium text-ink">
                      {ingredient.name}
                    </td>
                    <td className="px-4 py-3 text-[11px] tabular text-ink-soft">
                      {formatQuantity(
                        ingredient.quantityBase,
                        ingredient.baseUnit,
                      )}
                    </td>
                    <td className="px-4 py-3 text-[11px] tabular text-ink-soft">
                      {formatUnitPrice(
                        ingredient.oldPriceMicroYuanPerBaseUnit,
                        ingredient.baseUnit,
                      )}
                      <span className="mx-1 text-line-strong">→</span>
                      {formatUnitPrice(
                        ingredient.newPriceMicroYuanPerBaseUnit,
                        ingredient.baseUnit,
                      )}
                    </td>
                    <td className="px-4 py-3 text-[11px] tabular text-ink-soft">
                      {formatYuan(ingredient.oldCostMicroYuan)}
                      <span className="mx-1 text-line-strong">→</span>
                      {formatYuan(ingredient.newCostMicroYuan)}
                    </td>
                    <td className="px-4 py-3 text-[10px] leading-5 text-muted">
                      {ingredient.evidenceText ?? "未在本次报价中"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-ink">行动建议</h3>
            <span className="text-[10px] text-muted">规则生成 · 可人工判断</span>
          </div>
          <div className="mt-2.5 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-800">
              为什么这道菜会涨
            </p>
            <p className="mt-1.5 text-xs leading-6 text-ink-soft">
              {result.calculation.causeSentence ??
                `这道菜成本上升，主要与“${
                  result.calculation.mainIngredient?.name ?? "主要食材"
                }”的价格上涨有关。`}
            </p>
          </div>
          <div className="mt-2.5">
            <AdviceCards advice={result.calculation.advice} />
          </div>
        </div>
      </div>
    </details>
  );
}

export default async function QuoteReportPage({ params }: PageProps) {
  const { id } = await params;
  const quoteId = Number(id);

  if (!Number.isInteger(quoteId) || quoteId <= 0) {
    notFound();
  }

  const report = loadQuoteReport(quoteId);

  if (!report) {
    notFound();
  }

  const analysis = report.analysis;
  const summary = analysis?.summary;
  const weeklyResults =
    analysis?.results.filter((item) => item.rankingGroup === "weekly") ?? [];
  const perServingResults =
    analysis?.results.filter((item) => item.rankingGroup === "per_serving") ??
    [];
  const topResult = weeklyResults[0] ?? analysis?.results[0] ?? null;

  return (
    <AppShell active="report" quoteId={report.quote.id}>
      <header className="flex flex-wrap items-end justify-between gap-5 pb-6">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
            <span>风险分析</span>
            <span className="text-line-strong">·</span>
            <span>报价 #{report.quote.id}</span>
            <span className="text-line-strong">·</span>
            <span>{report.quote.quoteDate ?? "日期未知"}</span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-ink">
            报价成本影响
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            {report.quote.supplierName}
            <span className="mx-2 text-line-strong">/</span>
            核心食材成本，不是净利润
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${statusClass(report.quote.status)}`}
          >
            {statusLabel(report.quote.status)}
          </span>
          {report.quote.sourceUrl ? (
            <a
              href={report.quote.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-line bg-white px-3 py-2 text-[11px] font-medium text-ink-soft transition hover:border-brand/40 hover:text-brand-strong"
            >
              查看原件 ↗
            </a>
          ) : null}
          {report.quote.status === "ready" ||
          report.quote.status === "applied" ? (
            <AnalyzeButton
              quoteId={report.quote.id}
              label={analysis ? "重新分析" : "生成风险分析"}
            />
          ) : null}
        </div>
      </header>

      {analysis ? (
        <>
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="overflow-hidden rounded-2xl bg-ink p-5 text-white shadow-sm sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">
                    预计每周食材毛利减少
                  </p>
                  <p className="mt-2 text-4xl font-semibold tracking-[-0.04em] tabular">
                    {formatYuan(summary?.totalWeeklyImpactMicroYuan ?? 0)}
                  </p>
                  <p className="mt-2 max-w-lg text-[11px] leading-5 text-white/60">
                    只统计有周销量的菜品；缺少销量的菜品单独列出，不估算金额。
                  </p>
                </div>
                <span className="rounded-full border border-white/15 px-2.5 py-1 text-[10px] text-white/60">
                  {analysis.rulesVersion}
                </span>
              </div>

              <div className="mt-6 grid grid-cols-3 divide-x divide-white/10 border-t border-white/10 pt-4">
                <div>
                  <p className="text-[10px] text-white/50">受影响菜品</p>
                  <p className="mt-1 text-xl font-semibold tabular">
                    {summary?.affectedDishes ?? analysis.results.length}
                  </p>
                </div>
                <div className="pl-4">
                  <p className="text-[10px] text-white/50">严重</p>
                  <p className="mt-1 text-xl font-semibold tabular text-red-300">
                    {summary?.critical ?? 0}
                  </p>
                </div>
                <div className="pl-4">
                  <p className="text-[10px] text-white/50">警告</p>
                  <p className="mt-1 text-xl font-semibold tabular text-amber-200">
                    {summary?.warning ?? 0}
                  </p>
                </div>
              </div>
            </div>

            <aside className="rounded-2xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(20,35,28,0.03)]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                优先处理
              </p>
              {topResult ? (
                <>
                  <div className="mt-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-ink">
                        {topResult.dishName}
                      </p>
                      <p className="mt-1 text-[11px] text-muted">
                        {topResult.calculation.mainIngredient
                          ? `${topResult.calculation.mainIngredient.name}采购价`
                          : "没有明确主料"}
                        {topResult.calculation.priceChangeRatio !== null
                          ? ` ${topResult.calculation.priceChangeRatio >= 0 ? "上涨" : "下降"} ${(Math.abs(
                              topResult.calculation.priceChangeRatio * 100
                            )).toFixed(1)}%`
                          : ""}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${riskPillClass(topResult.riskLevel)}`}
                    >
                      {riskLabel(topResult.riskLevel)}
                    </span>
                  </div>
                  <div className="mt-4 space-y-2 border-t border-line pt-3 text-[11px]">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted">周影响</span>
                      <span className="font-semibold tabular text-ink">
                        {topResult.weeklyImpactMicroYuan !== null
                          ? formatYuan(topResult.weeklyImpactMicroYuan)
                          : "缺少销量"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted">成本率</span>
                      <span className="font-medium tabular text-ink">
                        {formatRate(topResult.foodCostRateAfterBps)}
                        <span className="mx-1 text-muted">/</span>
                        目标 {formatRate(topResult.targetFoodCostRateBps)}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="shrink-0 text-muted">建议</span>
                      <span className="text-right text-ink-soft">
                        {topResult.calculation.advice[0]?.title ?? "查看详情"}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <p className="mt-3 text-xs text-muted">没有受涨价影响的菜品。</p>
              )}
            </aside>
          </section>

          <section className="mt-4 overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(20,35,28,0.03)]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold tracking-tight">
                  风险排序
                </h2>
                <p className="mt-1 text-[11px] text-muted">
                  有周销量的菜品按预计影响从高到低排序。
                </p>
              </div>
              <span className="text-[11px] text-muted">
                共 {weeklyResults.length} 道
              </span>
            </div>
            <RiskTable results={weeklyResults} />
          </section>

          {perServingResults.length > 0 ? (
            <section className="mt-4 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/30 shadow-[0_1px_2px_rgba(20,35,28,0.03)]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold tracking-tight text-amber-950">
                    缺少周销量
                  </h2>
                  <p className="mt-1 text-[11px] text-amber-800">
                    不估算周金额，只按单份成本变化展示。
                  </p>
                </div>
                <span className="text-[11px] text-amber-800">
                  {perServingResults.length} 道
                </span>
              </div>
              <RiskTable results={perServingResults} />
            </section>
          ) : null}

          <section className="mt-8 space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold tracking-tight text-ink">
                  菜品计算详情
                </h2>
                <p className="mt-1 text-[11px] text-muted">
                  展开任意菜品，核对菜谱用量、报价证据和行动建议。
                </p>
              </div>
              <span className="text-[11px] text-muted">
                {analysis.results.length} 道受影响菜品
              </span>
            </div>
            {analysis.results.map((result) => (
              <DishDetail key={result.id} result={result} />
            ))}
          </section>

          <section className="mt-8 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
            <div className="rounded-2xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(20,35,28,0.03)]">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold tracking-tight">
                  处理时间线
                </h2>
                <span className="text-[10px] uppercase tracking-[0.14em] text-muted">
                  Audit trail
                </span>
              </div>
              <ol className="mt-4">
                {report.timeline.map((event, index) => (
                  <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
                    {index < report.timeline.length - 1 ? (
                      <span className="absolute left-[5px] top-3 h-full w-px bg-line" />
                    ) : null}
                    <span className="relative z-10 mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-white bg-brand ring-1 ring-brand/20" />
                    <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <p className="text-xs font-medium text-ink">
                        {eventLabel(event.eventType)}
                      </p>
                      <p className="text-[10px] tabular text-muted">
                        {formatDateTime(event.createdAt)}
                      </p>
                      <p className="w-full text-[10px] text-muted">
                        {actorLabel(event.actorType)}
                        {event.actorLabel
                          ? ` · ${actorName(event.actorType, event.actorLabel)}`
                          : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <aside className="rounded-2xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(20,35,28,0.03)]">
              <h2 className="text-sm font-semibold tracking-tight">计算口径</h2>
              <ul className="mt-3 space-y-2.5 text-[11px] leading-5 text-muted">
                <li>· 只计算核心食材成本</li>
                <li>· 不含房租、人工、水电和平台抽佣</li>
                <li>· 缺销量不估算周毛利金额</li>
                <li>· 改价保留旧价格和审计记录</li>
              </ul>
              <div className="mt-4 rounded-lg bg-canvas/70 p-3 text-[10px] leading-5 text-muted">
                报价日期 {report.quote.quoteDate ?? "未知"}
                <br />
                价格应用 {formatDateTime(report.quote.appliedAt)}
              </div>
            </aside>
          </section>
        </>
      ) : (
        <section className="rounded-2xl border border-line bg-white p-8 shadow-[0_1px_2px_rgba(20,35,28,0.03)]">
          <div className="mx-auto max-w-lg text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-soft text-brand">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                className="h-6 w-6"
              >
                <path
                  d="M4 19.5V11m5.3 8.5V4.5m5.4 15V8m5.3 11.5V3"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <h2 className="mt-4 text-lg font-semibold tracking-tight">
              还没有分析结果
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              报价完成匹配和确认后，应用价格历史即可生成成本快照、风险排序和处理建议。
            </p>
            <div className="mt-5 flex justify-center">
              {report.quote.status === "ready" ||
              report.quote.status === "applied" ? (
                <AnalyzeButton quoteId={report.quote.id} />
              ) : (
                <Link
                  href="/quotes/new"
                  className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-brand-strong"
                >
                  先完成报价核对
                  <span aria-hidden="true">→</span>
                </Link>
              )}
            </div>
          </div>
        </section>
      )}

      <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-[10px] text-muted">
        <p>核心食材成本口径 · 不包含房租、人工、水电、平台抽佣和税费。</p>
        <p>规则版本 {analysis?.rulesVersion ?? "—"}</p>
      </footer>
    </AppShell>
  );
}
