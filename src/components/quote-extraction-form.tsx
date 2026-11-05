"use client";

import { useState } from "react";

import type {
  ExtractionQuestion,
  ExtractionResponse,
  ExtractionResponseItem,
} from "@/domain/quote-extraction";

type QuoteExtractionFormProps = {
  sampleText: string;
};

function confidenceLabel(value: number): string {
  if (value >= 0.85) {
    return "高";
  }

  if (value >= 0.6) {
    return "中";
  }

  return "低";
}

function confidenceClass(value: number): string {
  if (value >= 0.85) {
    return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  }

  if (value >= 0.6) {
    return "bg-amber-50 text-amber-800 ring-amber-200";
  }

  return "bg-red-50 text-red-700 ring-red-200";
}

function questionLabel(type: ExtractionQuestion["type"]): string {
  if (type === "package_unknown") {
    return "包装待确认";
  }

  if (type === "supplier_unmatched") {
    return "供应商待确认";
  }

  return "低置信度";
}

function quantityText(item: ExtractionResponseItem): string {
  const quantity = [item.quantityValue, item.quantityUnit]
    .filter(Boolean)
    .join(" ");

  return quantity || "未识别";
}

function priceText(item: ExtractionResponseItem): string {
  if (item.priceUnit === "元") {
    return `¥${item.priceValue}`;
  }

  return `${item.priceValue} ${item.priceUnit ?? ""}`.trim();
}

function packageText(item: ExtractionResponseItem): string {
  if (item.packageSpecRaw) {
    return item.packageSpecRaw;
  }

  if (item.packageQuantityValue && item.packageUnit) {
    return `${item.packageQuantityValue}${item.packageUnit}`;
  }

  return "未注明";
}

export default function QuoteExtractionForm({
  sampleText,
}: QuoteExtractionFormProps) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<ExtractionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitQuote() {
    setError(null);
    setResult(null);

    if (!text.trim()) {
      setError("请先粘贴报价文本。");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/quotes/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      const payload = (await response.json()) as
        | ExtractionResponse
        | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "提取失败，请稍后重试。",
        );
      }

      setResult(payload as ExtractionResponse);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "提取失败，请稍后重试。",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function loadSample() {
    setText(sampleText);
    setError(null);
    setResult(null);
  }

  function clearAll() {
    setText("");
    setError(null);
    setResult(null);
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold tracking-tight">报价原文</h2>
              <p className="mt-1 text-xs text-stone-500">
                支持一行一个食材；至少包含供应商和报价日期。
              </p>
            </div>
            <button
              type="button"
              onClick={loadSample}
              className="rounded-full border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800"
            >
              使用样例文本
            </button>
          </div>

          <label htmlFor="quote-text" className="sr-only">
            报价文本
          </label>
          <textarea
            id="quote-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={16}
            placeholder={`例如：\n鲜源蔬菜配送\n报价日期：2026-11-01\n去骨鸡腿 2袋×5kg 220.00`}
            className="mt-4 w-full resize-y rounded-2xl border border-stone-200 bg-stone-50 p-4 font-mono text-sm leading-6 text-stone-800 outline-none transition placeholder:text-stone-400 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
          />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-stone-500">
              当前长度：{text.length} 字符
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={clearAll}
                className="rounded-full px-3 py-1.5 text-xs font-medium text-stone-500 transition hover:bg-stone-100 hover:text-stone-800"
              >
                清空
              </button>
              <button
                type="button"
                onClick={submitQuote}
                disabled={isSubmitting || !text.trim()}
                className="rounded-full bg-emerald-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? "正在提取…" : "提取报价草稿"}
              </button>
            </div>
          </div>
        </div>

        <aside className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-stone-400">
            提取后会发生什么
          </p>
          <ol className="mt-4 space-y-4 text-sm text-stone-600">
            <li className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-stone-100 text-xs font-bold text-stone-700">
                1
              </span>
              <span>保存报价原文和一条草稿记录。</span>
            </li>
            <li className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-stone-100 text-xs font-bold text-stone-700">
                2
              </span>
              <span>拆出食材、数量、包装、价格、单位和证据。</span>
            </li>
            <li className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-stone-100 text-xs font-bold text-stone-700">
                3
              </span>
              <span>低置信度字段变成确认问题，不悄悄改价。</span>
            </li>
            <li className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-stone-100 text-xs font-bold text-stone-700">
                4
              </span>
              <span>只写报价草稿，不写价格历史。</span>
            </li>
          </ol>
          <div className="mt-5 rounded-2xl bg-amber-50 p-4 text-xs leading-6 text-amber-900">
            当前默认使用 <strong>mock</strong> 模式，不调用外部模型。
            配置真实模型后才能识别更自由的报价格式。
          </div>
        </aside>
      </section>

      <div aria-live="polite">
        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p className="font-semibold">没有完成提取</p>
            <p className="mt-1">{error}</p>
            <p className="mt-2 text-xs text-red-600">
              如果这是格式问题，可以先去掉表头或改成每行一个食材。
            </p>
          </div>
        ) : null}

        {result ? <ExtractionResult result={result} /> : null}
      </div>
    </div>
  );
}

function ExtractionResult({ result }: { result: ExtractionResponse }) {
  const needsConfirmation = result.status === "needs_confirmation";

  return (
    <section className="space-y-4">
      <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-stone-400">
              报价草稿 #{result.quoteId}
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">
              {result.supplierNameRaw}
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              报价日期：{result.quoteDate} · 币种：{result.currency} ·
              提供方：{result.provider}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
              needsConfirmation
                ? "bg-amber-50 text-amber-800 ring-amber-200"
                : "bg-emerald-50 text-emerald-800 ring-emerald-200"
            }`}
          >
            {needsConfirmation ? "待确认" : "已提取"}
          </span>
        </div>

        <div className="mt-4 rounded-2xl bg-stone-50 px-4 py-3 text-sm text-stone-600">
          草稿已保存，<strong className="text-stone-900">尚未修改任何正式食材价格</strong>。
          价格历史要等确认和处理后才写入。
        </div>

        {result.warnings.length > 0 ? (
          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {result.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        ) : null}
      </div>

      {result.questions.length > 0 ? (
        <section className="rounded-3xl border border-amber-200 bg-amber-50/70 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold tracking-tight text-amber-950">
              需要你确认的 {result.questions.length} 项
            </h2>
            <span className="text-xs text-amber-700">
              本阶段只展示问题，确认写回在第七阶段
            </span>
          </div>
          <div className="mt-4 grid gap-3">
            {result.questions.map((question, index) => (
              <article
                key={`${question.type}-${question.lineNo ?? "quote"}-${index}`}
                className="rounded-2xl border border-amber-200 bg-white/80 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
                    {questionLabel(question.type)}
                  </span>
                  {question.lineNo ? (
                    <span className="text-xs text-stone-500">
                      第 {question.lineNo} 行
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
              </article>
            ))}
          </div>
        </section>
      ) : (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          本次没有发现需要阻塞确认的低置信度字段。
        </div>
      )}

      <section className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-5 py-4">
          <div>
            <h2 className="font-semibold tracking-tight">结构化提取结果</h2>
            <p className="mt-1 text-xs text-stone-500">
              每一行都能回到原文证据。
            </p>
          </div>
          <span className="text-xs text-stone-500">
            共 {result.items.length} 行
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-3 font-medium">行</th>
                <th className="px-4 py-3 font-medium">原始食材</th>
                <th className="px-4 py-3 font-medium">数量 / 包装</th>
                <th className="px-4 py-3 font-medium">报价</th>
                <th className="px-4 py-3 font-medium">证据</th>
                <th className="px-4 py-3 font-medium">置信度</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {result.items.map((item) => (
                <tr key={item.lineNo} className="align-top">
                  <td className="px-4 py-4 text-stone-400">{item.lineNo}</td>
                  <td className="px-4 py-4">
                    <p className="font-medium text-stone-900">
                      {item.itemNameRaw}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      {item.priceType === "total" ? "行总价" : "单价"}
                    </p>
                    {item.notes ? (
                      <p className="mt-1 text-xs text-amber-700">{item.notes}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-4 text-stone-600">
                    <p>{quantityText(item)}</p>
                    <p className="mt-1 text-xs text-stone-400">
                      包装：{packageText(item)}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-medium text-stone-900">
                      {priceText(item)}
                    </p>
                    <p className="mt-1 text-xs text-stone-400">
                      {item.priceUnit ?? "单位未识别"}
                    </p>
                  </td>
                  <td className="max-w-xs px-4 py-4 font-mono text-xs leading-5 text-stone-500">
                    {item.evidenceText}
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${confidenceClass(item.confidence)}`}
                    >
                      {confidenceLabel(item.confidence)}{" "}
                      {Math.round(item.confidence * 100)}%
                    </span>
                    <p className="mt-2 text-xs text-stone-400">
                      {item.status === "needs_confirmation"
                        ? "待确认"
                        : "可继续"}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
