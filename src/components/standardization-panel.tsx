"use client";

import { useState } from "react";

import type {
  StandardizationQuestion,
  StandardizationResult,
  StandardizedItem,
} from "@/domain/standardization";
import AnalyzeButton from "./analyze-button";

type StandardizationPanelProps = {
  quoteId: number;
  result: StandardizationResult;
  onUpdated: (result: StandardizationResult) => void;
};

function unitPriceLabel(item: StandardizedItem): string {
  if (item.normalizedUnitPriceMicroYuan === null || !item.baseUnit) {
    return "待换算";
  }

  if (item.baseUnit === "g") {
    return `¥${((item.normalizedUnitPriceMicroYuan * 1000) / 1_000_000).toFixed(2)}/kg`;
  }

  if (item.baseUnit === "ml") {
    return `¥${((item.normalizedUnitPriceMicroYuan * 1000) / 1_000_000).toFixed(2)}/L`;
  }

  return `¥${(item.normalizedUnitPriceMicroYuan / 1_000_000).toFixed(2)}/个`;
}

function quantityLabel(item: StandardizedItem): string {
  if (item.normalizedQuantityBase === null || !item.baseUnit) {
    return "待换算";
  }

  return `${item.normalizedQuantityBase.toLocaleString("zh-CN")} ${item.baseUnit}`;
}

function changeLabel(item: StandardizedItem): string {
  if (item.priceChangeRatio === null) {
    return "无历史价";
  }

  const percent = item.priceChangeRatio * 100;
  return `${percent >= 0 ? "+" : ""}${percent.toFixed(1)}%`;
}

function questionLabel(type: StandardizationQuestion["type"]): string {
  const labels: Record<StandardizationQuestion["type"], string> = {
    mapping_not_found: "未匹配食材",
    mapping_ambiguous: "食材歧义",
    package_unknown: "包装待确认",
    unit_unknown: "单位待确认",
    price_basis_ambiguous: "价格口径待确认",
    abnormal_price: "异常价格",
    backdated_quote: "历史报价",
    new_ingredient_without_baseline: "缺少历史价格",
  };

  return labels[type];
}

function unitOptions(baseUnit: "g" | "ml" | "个" | null): string[] {
  if (baseUnit === "g") {
    return ["kg", "斤", "g"];
  }

  if (baseUnit === "ml") {
    return ["L", "ml"];
  }

  return ["个"];
}

type QuestionCardProps = {
  quoteId: number;
  question: StandardizationQuestion;
  onUpdated: (result: StandardizationResult) => void;
};

function QuestionCard({ quoteId, question, onUpdated }: QuestionCardProps) {
  const [ingredientId, setIngredientId] = useState("");
  const [packageQuantity, setPackageQuantity] = useState("");
  const [packageUnit, setPackageUnit] = useState(
    unitOptions(question.baseUnit)[0] ?? "",
  );
  const [remember, setRemember] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMapping =
    question.type === "mapping_ambiguous" ||
    question.type === "mapping_not_found";
  const isPackage =
    question.type === "package_unknown" ||
    question.type === "unit_unknown";
  const isAcknowledgment =
    question.type === "abnormal_price" ||
    question.type === "backdated_quote";
  const isInformational =
    question.type === "new_ingredient_without_baseline" ||
    question.type === "price_basis_ambiguous";

  async function submit() {
    setError(null);
    setIsSaving(true);

    let payload: Record<string, unknown> = {
      type: question.type,
      quoteItemId: question.quoteItemId,
      remember,
    };

    if (isMapping) {
      if (!ingredientId) {
        setError("请选择一个标准食材。");
        setIsSaving(false);
        return;
      }

      payload = { ...payload, ingredientId: Number(ingredientId) };
    } else if (isPackage) {
      if (!packageQuantity.trim() || !packageUnit) {
        setError("请填写包装数量。");
        setIsSaving(false);
        return;
      }

      payload = {
        ...payload,
        packageQuantityValue: packageQuantity.trim(),
        packageUnit,
      };
    } else if (isAcknowledgment) {
      payload = { ...payload, remember: false, acknowledged: true };
    }

    try {
      const response = await fetch(
        `/api/quotes/${quoteId}/confirmations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body = (await response.json()) as
        | StandardizationResult
        | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in body && body.error ? body.error : "保存确认失败。",
        );
      }

      onUpdated(body as StandardizationResult);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "保存确认失败。",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <article className="rounded-xl border border-amber-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
          {questionLabel(question.type)}
        </span>
        <span className="text-[11px] text-muted">第 {question.lineNo} 行</span>
        {!question.blocking ? (
          <span className="rounded-full bg-canvas px-2 py-0.5 text-[10px] text-muted">
            提示
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-xs leading-5 text-ink-soft">
        {question.message}
      </p>

      {question.evidenceText ? (
        <p className="mt-2 rounded-md bg-canvas px-2.5 py-2 font-mono text-[10px] leading-5 text-muted">
          {question.evidenceText}
        </p>
      ) : null}

      {isMapping ? (
        <div className="mt-3 space-y-3">
          <label className="block text-[11px] font-medium text-ink-soft">
            标准食材
            <select
              value={ingredientId}
              onChange={(event) => setIngredientId(event.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
            >
              <option value="">请选择</option>
              {question.options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}（{option.baseUnit}）
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-[11px] text-muted">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              className="accent-brand"
            />
            记住这个别名，下次自动匹配
          </label>
        </div>
      ) : null}

      {isPackage ? (
        <div className="mt-3 space-y-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_110px]">
            <label className="text-[11px] font-medium text-ink-soft">
              每{question.quantityUnit ?? "包装"}包含的数量
              <input
                value={packageQuantity}
                onChange={(event) => setPackageQuantity(event.target.value)}
                inputMode="decimal"
                placeholder="例如 20"
                className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
              />
            </label>
            <label className="text-[11px] font-medium text-ink-soft">
              单位
              <select
                value={packageUnit}
                onChange={(event) => setPackageUnit(event.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
              >
                {unitOptions(question.baseUnit).map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-muted">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              className="accent-brand"
            />
            记住这个包装换算，下次自动使用
          </label>
        </div>
      ) : null}

      {isAcknowledgment ? (
        <p className="mt-3 text-[11px] leading-5 text-muted">
          确认后，本次报价不再重复提示这个异常。
        </p>
      ) : null}

      {isInformational ? (
        <p className="mt-3 text-[11px] leading-5 text-muted">
          这条信息不会阻塞后续，但会影响成本变化的解释。
        </p>
      ) : null}

      {error ? <p className="mt-2 text-[11px] text-red-600">{error}</p> : null}

      {!isInformational ? (
        <button
          type="button"
          onClick={submit}
          disabled={isSaving}
          className="mt-3 rounded-lg bg-ink px-3.5 py-2 text-[11px] font-semibold text-white transition hover:bg-brand-strong disabled:opacity-50"
        >
          {isSaving ? "正在保存…" : "确认并继续"}
        </button>
      ) : null}
    </article>
  );
}

export default function StandardizationPanel({
  quoteId,
  result,
  onUpdated,
}: StandardizationPanelProps) {
  const progress =
    result.summary.totalItems > 0
      ? Math.round(
          (result.summary.readyItems / result.summary.totalItems) * 100,
        )
      : 0;

  return (
    <section className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(20,35,28,0.04)]">
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-5 sm:px-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
              Step 03
            </p>
            <h2 className="mt-1 text-sm font-semibold tracking-tight text-ink">
              食材与单位核对
            </h2>
            <p className="mt-1 text-[11px] leading-5 text-muted">
              规则完成匹配和归一化；不确定的地方会停下来询问。
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${
              result.status === "ready"
                ? "bg-brand-soft text-brand-strong ring-brand/15"
                : "bg-amber-50 text-amber-800 ring-amber-200"
            }`}
          >
            {result.status === "ready" ? "已就绪" : "待确认"}
          </span>
        </div>

        <div className="grid grid-cols-2 border-y border-line sm:grid-cols-4">
          <div className="border-b border-line p-4 sm:border-b-0 sm:border-r">
            <p className="text-[10px] text-muted">报价行</p>
            <p className="mt-1 text-lg font-semibold tabular">
              {result.summary.totalItems}
            </p>
          </div>
          <div className="border-b border-line p-4 sm:border-b-0 sm:border-r">
            <p className="text-[10px] text-muted">已匹配</p>
            <p className="mt-1 text-lg font-semibold tabular">
              {result.summary.matchedItems}
            </p>
          </div>
          <div className="border-r border-line p-4">
            <p className="text-[10px] text-muted">可继续</p>
            <p className="mt-1 text-lg font-semibold tabular text-brand">
              {result.summary.readyItems}
            </p>
          </div>
          <div className="p-4">
            <p className="text-[10px] text-muted">阻塞项</p>
            <p className="mt-1 text-lg font-semibold tabular">
              {result.summary.blockingQuestions}
            </p>
          </div>
        </div>

        <div className="px-5 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-3 text-[10px] text-muted">
            <span>核对进度</span>
            <span className="tabular">{progress}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-canvas">
            <div
              className="h-full rounded-full bg-brand transition-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-2 text-[10px] leading-5 text-muted">
            这一步只更新报价行的匹配和归一化字段，还没有写入价格历史。
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(20,35,28,0.04)]">
        <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">匹配明细</h2>
            <p className="mt-1 text-[11px] text-muted">
              原始名称、归一化结果和历史价格变化。
            </p>
          </div>
          <span className="text-[11px] text-muted">
            {result.items.length} 行
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-canvas/70 text-[10px] uppercase tracking-[0.08em] text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">行</th>
                <th className="px-4 py-3 font-medium">原始 → 标准食材</th>
                <th className="px-4 py-3 font-medium">原始数量</th>
                <th className="px-4 py-3 font-medium">归一化</th>
                <th className="px-4 py-3 font-medium">单价</th>
                <th className="px-4 py-3 font-medium">较历史价</th>
                <th className="px-4 py-3 font-medium">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {result.items.map((item) => (
                <tr key={item.id} className="align-top">
                  <td className="px-4 py-3.5 text-[11px] tabular text-muted">
                    {item.lineNo}
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="font-medium text-ink">{item.itemNameRaw}</p>
                    <p className="mt-0.5 text-[11px] text-brand">
                      {item.ingredientName ?? "未匹配"}
                    </p>
                    {item.matchEvidence ? (
                      <p className="mt-0.5 text-[10px] text-muted">
                        {item.matchEvidence}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-ink-soft">
                    <p>
                      {item.quantityValue ?? "—"} {item.quantityUnit ?? ""}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted">
                      {item.packageQuantityValue && item.packageUnit
                        ? `${item.packageQuantityValue}${item.packageUnit}/包装`
                        : "包装未注明"}
                    </p>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-ink-soft">
                    {quantityLabel(item)}
                  </td>
                  <td className="px-4 py-3.5 text-xs font-medium tabular text-ink">
                    {unitPriceLabel(item)}
                  </td>
                  <td className="px-4 py-3.5 text-xs tabular">
                    <span
                      className={
                        item.priceChangeRatio !== null &&
                        item.priceChangeRatio > 0
                          ? "font-medium text-red-600"
                          : "text-muted"
                      }
                    >
                      {changeLabel(item)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        item.status === "ready"
                          ? "bg-brand-soft text-brand-strong"
                          : "bg-amber-50 text-amber-800"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          item.status === "ready" ? "bg-brand" : "bg-amber-500"
                        }`}
                      />
                      {item.status === "ready" ? "可继续" : "待确认"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {result.questions.length > 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-amber-950">
              需要你确认 {result.questions.length} 项
            </h2>
            <span className="text-[11px] text-amber-800">
              确认后才能应用价格
            </span>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {result.questions.map((item) => (
              <QuestionCard
                key={item.id}
                quoteId={quoteId}
                question={item}
                onUpdated={onUpdated}
              />
            ))}
          </div>
        </section>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-brand-strong p-5 text-white">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">
              Ready for analysis
            </p>
            <h2 className="mt-1 text-sm font-semibold">
              全部报价行已完成核对
            </h2>
            <p className="mt-1 text-[11px] leading-5 text-white/70">
              下一步会应用价格历史，并生成成本和风险快照。
            </p>
          </div>
          <AnalyzeButton quoteId={quoteId} tone="light" />
        </div>
      )}
    </section>
  );
}
