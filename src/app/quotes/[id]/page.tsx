import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import AnalyzeButton from "@/components/analyze-button";
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

function riskClass(level: RiskLevel): string {
  if (level === "critical") {
    return "bg-red-50 text-red-700 ring-red-200";
  }

  if (level === "warning") {
    return "bg-amber-50 text-amber-800 ring-amber-200";
  }

  if (level === "watch") {
    return "bg-yellow-50 text-yellow-800 ring-yellow-200";
  }

  return "bg-stone-100 text-stone-600 ring-stone-200";
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

function formatDateTime(value: string | null): string {
  if (!value) {
    return "—";
  }

  return value.replace("T", " ").replace("Z", "").slice(0, 16);
}

function RiskRow({ result }: { result: AnalysisDishResultView }) {
  return (
    <tr className="align-top">
      <td className="px-4 py-4 text-stone-400">{result.rankPosition}</td>
      <td className="px-4 py-4">
        <a
          href={`#dish-${result.id}`}
          className="font-medium text-stone-900 hover:text-emerald-800 hover:underline"
        >
          {result.dishName}
        </a>
        <p className="mt-1 text-xs text-stone-400">
          {result.calculation.mainIngredient?.name ?? "—"}
        </p>
      </td>
      <td className="px-4 py-4">
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${riskClass(result.riskLevel)}`}
        >
          {riskLabel(result.riskLevel)}
        </span>
      </td>
      <td className="px-4 py-4 font-medium text-stone-900">
        {result.weeklyImpactMicroYuan !== null
          ? formatYuan(result.weeklyImpactMicroYuan)
          : "缺少销量"}
      </td>
      <td className="px-4 py-4 text-stone-600">
        {formatYuan(result.costBeforeMicroYuan)} →{" "}
        {formatYuan(result.costAfterMicroYuan)}
      </td>
      <td className="px-4 py-4 text-stone-600">
        {formatRate(result.foodCostRateBeforeBps)} →{" "}
        {formatRate(result.foodCostRateAfterBps)}
      </td>
      <td className="px-4 py-4 text-stone-500">
        {formatRate(result.targetFoodCostRateBps)}
      </td>
    </tr>
  );
}

function AdviceCards({ advice }: { advice: AnalysisAdvice[] }) {
  if (advice.length === 0) {
    return (
      <p className="text-sm text-stone-500">当前没有额外行动建议。</p>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {advice.map((item, index) => (
        <article
          key={`${item.type}-${index}`}
          className="rounded-2xl border border-stone-200 bg-stone-50 p-4"
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">
            {adviceLabel(item.type)}
          </p>
          <h4 className="mt-1 font-semibold text-stone-900">{item.title}</h4>
          <p className="mt-2 text-sm leading-6 text-stone-600">{item.detail}</p>
        </article>
      ))}
    </div>
  );
}

function DishDetail({ result }: { result: AnalysisDishResultView }) {
  return (
    <details
      id={`dish-${result.id}`}
      className="scroll-mt-6 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm open:ring-1 open:ring-emerald-100 sm:p-6"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-xs font-semibold text-stone-400">
            #{result.rankPosition} · {result.dishName}
          </span>
          <p className="mt-1 text-lg font-semibold tracking-tight">
            {result.weeklyImpactMicroYuan !== null
              ? `预计周食材毛利影响 ${formatYuan(result.weeklyImpactMicroYuan)}`
              : "缺少周销量，无法估算周毛利"}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${riskClass(result.riskLevel)}`}
        >
          {riskLabel(result.riskLevel)} · 展开
        </span>
      </summary>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl bg-stone-50 p-3">
          <p className="text-xs text-stone-500">涨价前成本</p>
          <p className="mt-1 text-lg font-semibold">
            {formatYuan(result.costBeforeMicroYuan)}
          </p>
        </div>
        <div className="rounded-2xl bg-stone-50 p-3">
          <p className="text-xs text-stone-500">涨价后成本</p>
          <p className="mt-1 text-lg font-semibold">
            {formatYuan(result.costAfterMicroYuan)}
          </p>
        </div>
        <div className="rounded-2xl bg-stone-50 p-3">
          <p className="text-xs text-stone-500">成本率</p>
          <p className="mt-1 text-lg font-semibold">
            {formatRate(result.foodCostRateBeforeBps)} →{" "}
            {formatRate(result.foodCostRateAfterBps)}
          </p>
        </div>
        <div className="rounded-2xl bg-stone-50 p-3">
          <p className="text-xs text-stone-500">目标 / 售价</p>
          <p className="mt-1 text-lg font-semibold">
            {formatRate(result.targetFoodCostRateBps)} /{" "}
            {formatYuan(result.calculation.sellingPriceMicroYuan)}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {result.calculation.riskReason}
        {result.weeklySales === null
          ? " 缺少周销量，所以这里没有周毛利金额。"
          : ` 周销量 ${result.weeklySales} 份。`}
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-stone-200">
        <div className="overflow-x-auto">
          <table className="min-w-[860px] w-full text-left text-sm">
            <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-3 font-medium">食材</th>
                <th className="px-4 py-3 font-medium">单份用量</th>
                <th className="px-4 py-3 font-medium">旧价 → 新价</th>
                <th className="px-4 py-3 font-medium">旧成本 → 新成本</th>
                <th className="px-4 py-3 font-medium">报价证据</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {result.calculation.ingredients.map((ingredient) => (
                <tr key={ingredient.ingredientId} className="align-top">
                  <td className="px-4 py-3 font-medium text-stone-800">
                    {ingredient.name}
                  </td>
                  <td className="px-4 py-3 text-stone-600">
                    {formatQuantity(ingredient.quantityBase, ingredient.baseUnit)}
                  </td>
                  <td className="px-4 py-3 text-stone-600">
                    {formatUnitPrice(
                      ingredient.oldPriceMicroYuanPerBaseUnit,
                      ingredient.baseUnit,
                    )}{" "}
                    →{" "}
                    {formatUnitPrice(
                      ingredient.newPriceMicroYuanPerBaseUnit,
                      ingredient.baseUnit,
                    )}
                  </td>
                  <td className="px-4 py-3 text-stone-600">
                    {formatYuan(ingredient.oldCostMicroYuan)} →{" "}
                    {formatYuan(ingredient.newCostMicroYuan)}
                  </td>
                  <td className="px-4 py-3 text-xs text-stone-500">
                    {ingredient.evidenceText ?? "无报价行（未涨价）"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-semibold text-stone-900">行动建议</h3>
        <div className="mt-3">
          <AdviceCards advice={result.calculation.advice} />
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
              <p className="font-semibold tracking-tight">菜价雷达</p>
              <p className="text-xs text-stone-500">
                报价 #{report.quote.id} · {report.quote.supplierName}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link
              href="/quotes/new"
              className="font-medium text-stone-500 hover:text-stone-900"
            >
              继续处理报价
            </Link>
            {report.quote.sourceUrl ? (
              <a
                href={report.quote.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-emerald-800 hover:underline"
              >
                打开原件 ↗
              </a>
            ) : null}
          </div>
        </header>

        <section className="flex flex-wrap items-end justify-between gap-4 py-8">
          <div>
            <p className="text-sm font-semibold tracking-wide text-emerald-800">
              分析结果 · 成本、风险和证据
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              这张报价单，影响了哪些菜？
            </h1>
            <p className="mt-3 text-sm text-stone-500">
              报价日期 {report.quote.quoteDate ?? "未知"} · 状态{" "}
              {report.quote.status} · 价格应用时间{" "}
              {formatDateTime(report.quote.appliedAt)}
            </p>
          </div>
          {report.quote.status === "ready" ||
          report.quote.status === "applied" ? (
            <AnalyzeButton
              quoteId={report.quote.id}
              label={analysis ? "重新分析" : "计算毛利风险"}
            />
          ) : null}
        </section>

        {analysis ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-2xl border border-stone-200 bg-white p-4">
                <p className="text-xs text-stone-500">受影响菜品</p>
                <p className="mt-1 text-2xl font-semibold">
                  {summary?.affectedDishes ?? analysis.results.length}
                </p>
              </div>
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                <p className="text-xs text-red-700">严重</p>
                <p className="mt-1 text-2xl font-semibold text-red-800">
                  {summary?.critical ?? 0}
                </p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs text-amber-700">警告</p>
                <p className="mt-1 text-2xl font-semibold text-amber-900">
                  {summary?.warning ?? 0}
                </p>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-white p-4">
                <p className="text-xs text-stone-500">预计周食材毛利减少</p>
                <p className="mt-1 text-2xl font-semibold">
                  {formatYuan(summary?.totalWeeklyImpactMicroYuan ?? 0)}
                </p>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-white p-4">
                <p className="text-xs text-stone-500">缺销量菜品</p>
                <p className="mt-1 text-2xl font-semibold">
                  {summary?.missingSales ?? 0}
                </p>
              </div>
            </section>

            <section className="mt-6 overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-5 py-4">
                <div>
                  <h2 className="font-semibold tracking-tight">
                    有周销量的风险排序
                  </h2>
                  <p className="mt-1 text-xs text-stone-500">
                    按预计周食材毛利影响从高到低；核心食材成本，不是净利润。
                  </p>
                </div>
                <span className="text-xs text-stone-400">
                  共 {weeklyResults.length} 道
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[980px] w-full text-left text-sm">
                  <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">排名</th>
                      <th className="px-4 py-3 font-medium">菜品</th>
                      <th className="px-4 py-3 font-medium">风险</th>
                      <th className="px-4 py-3 font-medium">周影响</th>
                      <th className="px-4 py-3 font-medium">成本</th>
                      <th className="px-4 py-3 font-medium">成本率</th>
                      <th className="px-4 py-3 font-medium">目标</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {weeklyResults.map((result) => (
                      <RiskRow key={result.id} result={result} />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {perServingResults.length > 0 ? (
              <section className="mt-6 overflow-hidden rounded-3xl border border-amber-200 bg-amber-50/40 shadow-sm">
                <div className="border-b border-amber-200 px-5 py-4">
                  <h2 className="font-semibold tracking-tight text-amber-950">
                    缺少周销量，单独分组
                  </h2>
                  <p className="mt-1 text-xs text-amber-800">
                    无法估算周毛利，以下仅按单份成本变化排序。
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-[980px] w-full text-left text-sm">
                    <thead className="bg-amber-100/60 text-xs uppercase tracking-wide text-amber-900">
                      <tr>
                        <th className="px-4 py-3 font-medium">排名</th>
                        <th className="px-4 py-3 font-medium">菜品</th>
                        <th className="px-4 py-3 font-medium">风险</th>
                        <th className="px-4 py-3 font-medium">周影响</th>
                        <th className="px-4 py-3 font-medium">成本</th>
                        <th className="px-4 py-3 font-medium">成本率</th>
                        <th className="px-4 py-3 font-medium">目标</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-100">
                      {perServingResults.map((result) => (
                        <RiskRow key={result.id} result={result} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            <section className="mt-8 space-y-4">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">
                  菜品计算详情
                </h2>
                <p className="mt-1 text-sm text-stone-500">
                  点击任意菜品展开，查看菜谱、报价证据和行动建议。
                </p>
              </div>
              {analysis.results.map((result) => (
                <DishDetail key={result.id} result={result} />
              ))}
            </section>

            <section className="mt-8 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="font-semibold tracking-tight">处理时间线</h2>
              <p className="mt-1 text-xs text-stone-500">
                提取、确认、改价、计算和审计记录都在这里。
              </p>
              <ol className="mt-4 space-y-3">
                {report.timeline.map((event) => (
                  <li key={event.id} className="flex gap-3 text-sm">
                    <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-emerald-600" />
                    <div>
                      <p className="font-medium text-stone-800">
                        {eventLabel(event.eventType)}
                      </p>
                      <p className="text-xs text-stone-500">
                        {formatDateTime(event.createdAt)} · {event.actorType}
                        {event.actorLabel ? ` · ${event.actorLabel}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </>
        ) : (
          <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="font-semibold tracking-tight">还没有分析结果</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              如果报价已经完成匹配和确认，点击“计算毛利风险”会先应用价格历史，
              再生成成本和风险快照。
            </p>
            <div className="mt-4">
              {report.quote.status === "ready" ||
              report.quote.status === "applied" ? (
                <AnalyzeButton quoteId={report.quote.id} />
              ) : (
                <Link
                  href="/quotes/new"
                  className="text-sm font-medium text-emerald-800 hover:underline"
                >
                  先回到报价页完成确认 →
                </Link>
              )}
            </div>
          </section>
        )}

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-5 text-xs text-stone-500">
          <p>
            计算的是核心食材成本；不包含房租、人工、水电、平台抽佣和税费。
          </p>
          <p>规则版本 {analysis?.rulesVersion ?? "—"}</p>
        </footer>
      </div>
    </main>
  );
}
