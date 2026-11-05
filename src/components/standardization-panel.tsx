"use client";

import { useState } from "react";

import type {
  StandardizationQuestion,
  StandardizationResult,
  StandardizedItem,
} from "@/domain/standardization";

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
          "error" in body && body.error
            ? body.error
            : "保存确认失败。",
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
    <article className="rounded-2xl border border-amber-200 bg-white/85 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
          {questionLabel(question.type)}
        </span>
        <span className="text-xs text-stone-500">第 {question.lineNo} 行</span>
        {!question.blocking ? (
          <span className="rounded-full bg-stone-100 px-2 py-1 text-xs text-stone-500">
            非阻塞
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-sm leading-6 text-stone-800">
        {question.message}
      </p>

      {question.evidenceText ? (
        <p className="mt-2 rounded-lg bg-stone-50 px-3 py-2 font-mono text-xs text-stone-500">
          {question.evidenceText}
        </p>
      ) : null}

      {isMapping ? (
        <div className="mt-3 space-y-3">
          <label className="block text-xs font-medium text-stone-600">
            选择标准食材
            <select
              value={ingredientId}
              onChange={(event) => setIngredientId(event.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
            >
              <option value="">请选择</option>
              {question.options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}（{option.baseUnit}）
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-stone-600">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />
            记住这个别名，下次自动匹配
          </label>
        </div>
      ) : null}

      {isPackage ? (
        <div className="mt-3 space-y-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
            <label className="text-xs font-medium text-stone-600">
              每{question.quantityUnit ?? "包装"}包含的数量
              <input
                value={packageQuantity}
                onChange={(event) => setPackageQuantity(event.target.value)}
                inputMode="decimal"
                placeholder="例如 20"
                className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
              />
            </label>
            <label className="text-xs font-medium text-stone-600">
              单位
              <select
                value={packageUnit}
                onChange={(event) => setPackageUnit(event.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
              >
                {unitOptions(question.baseUnit).map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-xs text-stone-600">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />
            记住这个包装换算，下次自动使用
          </label>
        </div>
      ) : null}

      {isAcknowledgment ? (
        <p className="mt-3 text-xs text-stone-500">
          确认后本次报价不再重复提示这个异常。
        </p>
      ) : null}

      {isInformational ? (
        <p className="mt-3 text-xs text-stone-500">
          这条信息不会阻塞后续，但会影响成本变化解释。
        </p>
      ) : null}

      {error ? (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      ) : null}

      {!isInformational ? (
        <button
          type="button"
          onClick={submit}
          disabled={isSaving}
          className="mt-3 rounded-full bg-emerald-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-50"
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
  return (
    <section className="space-y-4">
      <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold tracking-tight">
              食材匹配和单位检查
            </h2>
            <p className="mt-1 text-xs text-stone-500">
              规则自动匹配标准食材并归一化价格；不确定的地方会停下来问。
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
              result.status === "ready"
                ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                : "bg-amber-50 text-amber-800 ring-amber-200"
            }`}
          >
            {result.status === "ready" ? "已就绪" : "待确认"}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-stone-50 p-3">
            <p className="text-xs text-stone-500">报价行</p>
            <p className="mt-1 text-lg font-semibold">
              {result.summary.totalItems}
            </p>
          </div>
          <div className="rounded-2xl bg-stone-50 p-3">
            <p className="text-xs text-stone-500">已匹配</p>
            <p className="mt-1 text-lg font-semibold">
              {result.summary.matchedItems}
            </p>
          </div>
          <div className="rounded-2xl bg-stone-50 p-3">
            <p className="text-xs text-stone-500">可继续</p>
            <p className="mt-1 text-lg font-semibold">
              {result.summary.readyItems}
            </p>
          </div>
          <div className="rounded-2xl bg-stone-50 p-3">
            <p className="text-xs text-stone-500">阻塞问题</p>
            <p className="mt-1 text-lg font-semibold">
              {result.summary.blockingQuestions}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-stone-50 px-4 py-3 text-xs text-stone-600">
          这一步只更新报价行的匹配和归一化字段，
          <strong className="text-stone-900">仍然没有写入价格历史</strong>。
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-3 font-medium">行</th>
                <th className="px-4 py-3 font-medium">原始 → 标准食材</th>
                <th className="px-4 py-3 font-medium">原始数量 / 包装</th>
                <th className="px-4 py-3 font-medium">归一化数量</th>
                <th className="px-4 py-3 font-medium">单价</th>
                <th className="px-4 py-3 font-medium">较历史价</th>
                <th className="px-4 py-3 font-medium">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {result.items.map((item) => (
                <tr key={item.id} className="align-top">
                  <td className="px-4 py-4 text-stone-400">{item.lineNo}</td>
                  <td className="px-4 py-4">
                    <p className="font-medium text-stone-900">
                      {item.itemNameRaw}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      {item.ingredientName ?? "未匹配"}
                    </p>
                    {item.matchEvidence ? (
                      <p className="mt-1 text-xs text-stone-400">
                        {item.matchEvidence}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-4 text-stone-600">
                    <p>
                      {item.quantityValue ?? "—"} {item.quantityUnit ?? ""}
                    </p>
                    <p className="mt-1 text-xs text-stone-400">
                      {item.packageQuantityValue && item.packageUnit
                        ? `${item.packageQuantityValue}${item.packageUnit}/包装`
                        : "包装未注明"}
                    </p>
                  </td>
                  <td className="px-4 py-4 text-stone-600">
                    {quantityLabel(item)}
                  </td>
                  <td className="px-4 py-4 font-medium text-stone-900">
                    {unitPriceLabel(item)}
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={
                        item.priceChangeRatio !== null &&
                        item.priceChangeRatio > 0
                          ? "text-red-600"
                          : "text-stone-500"
                      }
                    >
                      {changeLabel(item)}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        item.status === "ready"
                          ? "bg-emerald-50 text-emerald-800"
                          : "bg-amber-50 text-amber-800"
                      }`}
                    >
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
        <section className="rounded-3xl border border-amber-200 bg-amber-50/70 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold tracking-tight text-amber-950">
              需要你确认的 {result.questions.length} 项
            </h2>
            <span className="text-xs text-amber-700">
              确认后才可能进入成本计算
            </span>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
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
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          所有报价行已经匹配并完成归一化，可以进入成本计算。
        </div>
      )}
    </section>
  );
}
