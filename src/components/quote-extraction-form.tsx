"use client";

import { useState, type DragEvent } from "react";

import type {
  ExtractionQuestion,
  ExtractionResponse,
  ExtractionResponseItem,
} from "@/domain/quote-extraction";
import type { StandardizationResult } from "@/domain/standardization";
import {
  DEMO_QUOTE_IMAGE_PATH,
  DEMO_QUOTE_PDF_PATH,
} from "@/lib/demo-files";
import StandardizationPanel from "./standardization-panel";

type QuoteExtractionFormProps = {
  sampleText: string;
};

type InputMode = "file" | "text";

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
    return "bg-brand-soft text-brand-strong ring-brand/15";
  }

  if (value >= 0.6) {
    return "bg-amber-50 text-amber-800 ring-amber-200";
  }

  return "bg-red-50 text-red-700 ring-red-200";
}

function sourceTypeLabel(type: ExtractionResponse["sourceType"]): string {
  if (type === "image") {
    return "图片";
  }

  if (type === "pdf") {
    return "电子 PDF";
  }

  return "粘贴文本";
}

function providerLabel(provider: string): string {
  if (provider === "mock") {
    return "样例识别";
  }

  return provider;
}

function questionLabel(type: ExtractionQuestion["type"]): string {
  if (type === "package_unknown") {
    return "包装待确认";
  }

  if (type === "supplier_unmatched") {
    return "供应商待确认";
  }

  return "低置信度字段";
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

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-6 w-6">
      <path
        d="M7 3.75h6.75L19 9v11.25H7V3.75Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M13.5 3.75V9H19M10 13h6M10 16.5h4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <path
        d="M10 3.5 11.2 7l3.3 1.2-3.3 1.2L10 12.9 8.8 9.4 5.5 8.2 8.8 7 10 3.5ZM15.5 12.5l.6 1.7 1.6.6-1.6.6-.6 1.7-.6-1.7-1.6-.6 1.6-.6.6-1.7Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function QuoteExtractionForm({
  sampleText,
}: QuoteExtractionFormProps) {
  const [inputMode, setInputMode] = useState<InputMode>("file");
  const [text, setText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [result, setResult] = useState<ExtractionResponse | null>(null);
  const [standardization, setStandardization] =
    useState<StandardizationResult | null>(null);
  const [standardizationError, setStandardizationError] = useState<
    string | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isStandardizing, setIsStandardizing] = useState(false);

  async function submitQuote() {
    setError(null);
    setResult(null);
    setStandardization(null);
    setStandardizationError(null);

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

      const extraction = payload as ExtractionResponse;
      setResult(extraction);
      await standardize(extraction.quoteId);
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

  async function standardize(quoteId: number) {
    setStandardizationError(null);
    setIsStandardizing(true);

    try {
      const response = await fetch(
        `/api/quotes/${quoteId}/standardize`,
        { method: "POST" },
      );
      const payload = (await response.json()) as
        | StandardizationResult
        | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "食材匹配和单位检查失败。",
        );
      }

      setStandardization(payload as StandardizationResult);
    } catch (requestError) {
      setStandardizationError(
        requestError instanceof Error
          ? requestError.message
          : "食材匹配和单位检查失败。",
      );
    } finally {
      setIsStandardizing(false);
    }
  }

  async function uploadFile(file: File) {
    setError(null);
    setResult(null);
    setStandardization(null);
    setStandardizationError(null);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/quotes/upload", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as
        | ExtractionResponse
        | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "处理报价文件失败，请稍后重试。",
        );
      }

      const extraction = payload as ExtractionResponse;
      setResult(extraction);
      await standardize(extraction.quoteId);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "处理报价文件失败，请稍后重试。",
      );
    } finally {
      setIsUploading(false);
    }
  }

  async function loadSampleFile(
    path: string,
    fileName: string,
    mimeType: string,
  ) {
    setError(null);
    setResult(null);
    setStandardization(null);
    setStandardizationError(null);
    setInputMode("file");
    setIsUploading(true);

    try {
      const response = await fetch(path);

      if (!response.ok) {
        throw new Error("样例文件加载失败。");
      }

      const blob = await response.blob();
      const file = new File([blob], fileName, { type: mimeType });
      setSelectedFile(file);
      setIsUploading(false);
      await uploadFile(file);
    } catch (sampleError) {
      setIsUploading(false);
      setError(
        sampleError instanceof Error
          ? sampleError.message
          : "样例文件加载失败。",
      );
    }
  }

  function loadSample() {
    setInputMode("text");
    setText(sampleText);
    setError(null);
    setResult(null);
    setStandardization(null);
    setStandardizationError(null);
  }

  function clearAll() {
    setText("");
    setSelectedFile(null);
    setError(null);
    setResult(null);
    setStandardization(null);
    setStandardizationError(null);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);

    const file = event.dataTransfer.files?.[0];

    if (file) {
      setSelectedFile(file);
    }
  }

  const isBusy = isSubmitting || isUploading || isStandardizing;

  return (
    <div className="space-y-5">
      {!result ? (
        <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(20,35,28,0.04)]">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-5 py-5 sm:px-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-md bg-brand-soft text-brand-strong">
                  <SparkIcon />
                </span>
                <h2 className="text-sm font-semibold tracking-tight">
                  添加报价单
                </h2>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted">
                选择一种方式导入。系统会先生成可核对的草稿，不会直接修改价格。
              </p>
            </div>
            <span className="rounded-full border border-line px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
              Step 01
            </span>
          </div>

          <div className="px-5 py-4 sm:px-6">
            <div className="inline-flex rounded-lg bg-canvas p-1">
              <button
                type="button"
                onClick={() => setInputMode("file")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  inputMode === "file"
                    ? "bg-white text-ink shadow-sm"
                    : "text-muted hover:text-ink"
                }`}
              >
                上传文件
              </button>
              <button
                type="button"
                onClick={() => setInputMode("text")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  inputMode === "text"
                    ? "bg-white text-ink shadow-sm"
                    : "text-muted hover:text-ink"
                }`}
              >
                粘贴文本
              </button>
            </div>

            {inputMode === "file" ? (
              <div className="mt-4">
                <label
                  htmlFor="quote-file"
                  onDragEnter={() => setIsDragging(true)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  className={`flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-8 text-center transition ${
                    isDragging
                      ? "border-brand bg-brand-soft/60"
                      : "border-line-strong bg-canvas/40 hover:border-brand/50 hover:bg-brand-soft/30"
                  }`}
                >
                  <input
                    id="quote-file"
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf"
                    className="sr-only"
                    onChange={(event) =>
                      setSelectedFile(event.target.files?.[0] ?? null)
                    }
                  />
                  <span className="grid h-11 w-11 place-items-center rounded-full border border-line bg-white text-brand shadow-sm">
                    <FileIcon />
                  </span>
                  <p className="mt-4 text-sm font-semibold text-ink">
                    {selectedFile ? selectedFile.name : "拖入报价单，或点击选择"}
                  </p>
                  <p className="mt-1 text-[11px] leading-5 text-muted">
                    {selectedFile
                      ? `${(selectedFile.size / 1024).toFixed(1)} KB · 准备识别`
                      : "支持 PNG、JPG、WebP、PDF，单文件不超过 10 MB"}
                  </p>
                  {selectedFile ? (
                    <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-[10px] font-medium text-brand-strong">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                      已选择
                    </span>
                  ) : null}
                </label>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => selectedFile && uploadFile(selectedFile)}
                    disabled={!selectedFile || isBusy}
                    className="rounded-lg bg-ink px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isUploading ? "正在识别…" : "开始识别"}
                  </button>
                  <span className="text-[11px] text-muted">或使用</span>
                  <button
                    type="button"
                    onClick={() =>
                      loadSampleFile(
                        DEMO_QUOTE_IMAGE_PATH,
                        "demo-quote.png",
                        "image/png",
                      )
                    }
                    disabled={isBusy}
                    className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[11px] font-medium text-ink-soft transition hover:border-brand/40 hover:text-brand-strong disabled:opacity-50"
                  >
                    样例图片
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      loadSampleFile(
                        DEMO_QUOTE_PDF_PATH,
                        "demo-quote.pdf",
                        "application/pdf",
                      )
                    }
                    disabled={isBusy}
                    className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[11px] font-medium text-ink-soft transition hover:border-brand/40 hover:text-brand-strong disabled:opacity-50"
                  >
                    样例 PDF
                  </button>
                </div>

                <p className="mt-3 text-[11px] leading-5 text-muted">
                  当前识别模式只支持内置样例图片；电子 PDF 会读取文字层。
                  扫描件建议切换到“粘贴文本”。
                </p>
              </div>
            ) : (
              <div className="mt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] text-muted">
                    一行一个食材，至少包含供应商和报价日期。
                  </p>
                  <button
                    type="button"
                    onClick={loadSample}
                    className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[11px] font-medium text-ink-soft transition hover:border-brand/40 hover:text-brand-strong"
                  >
                    填入样例
                  </button>
                </div>

                <label htmlFor="quote-text" className="sr-only">
                  报价文本
                </label>
                <textarea
                  id="quote-text"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  rows={14}
                  placeholder={`例如：\n鲜源蔬菜配送\n报价日期：2026-11-01\n去骨鸡腿 2袋×5kg 220.00`}
                  className="mt-2 w-full resize-y rounded-xl border border-line bg-canvas/40 p-4 font-mono text-[13px] leading-6 text-ink outline-none transition placeholder:text-muted/60 focus:border-brand/60 focus:bg-white focus:ring-2 focus:ring-brand/10"
                />

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[11px] text-muted">
                    {text.length} 字符
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={clearAll}
                      className="rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-muted transition hover:bg-canvas hover:text-ink"
                    >
                      清空
                    </button>
                    <button
                      type="button"
                      onClick={submitQuote}
                      disabled={isBusy || !text.trim()}
                      className="rounded-lg bg-ink px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isSubmitting ? "正在提取…" : "提取报价草稿"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {isBusy && !result ? (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-3 text-xs text-muted">
          <span className="h-2 w-2 animate-pulse rounded-full bg-brand" />
          {isStandardizing
            ? "正在匹配食材、换算单位并检查历史价格…"
            : "正在读取报价，请稍候…"}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-semibold">没有完成提取</p>
          <p className="mt-1">{error}</p>
          <p className="mt-2 text-[11px] text-red-600">
            如果格式无法识别，可以改成每行一个食材，或改用粘贴文本。
          </p>
        </div>
      ) : null}

      <div aria-live="polite">
        {result ? (
          <>
            <ExtractionResult
              result={result}
              questions={
                standardization
                  ? result.questions.filter(
                      (question) => question.type !== "package_unknown",
                    )
                  : result.questions
              }
              standardizationStatus={standardization?.status ?? null}
              onReset={clearAll}
            />

            {isStandardizing ? (
              <div className="mt-4 flex items-center gap-3 rounded-xl border border-brand/15 bg-brand-soft/60 px-4 py-3 text-xs text-brand-strong">
                <span className="h-2 w-2 animate-pulse rounded-full bg-brand" />
                正在匹配食材、换算包装并检查历史价格…
              </div>
            ) : null}

            {standardizationError ? (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <p className="font-semibold">食材检查没有完成</p>
                <p className="mt-1">{standardizationError}</p>
              </div>
            ) : null}

            {standardization ? (
              <div className="mt-5">
                <StandardizationPanel
                  quoteId={result.quoteId}
                  result={standardization}
                  onUpdated={setStandardization}
                />
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function ExtractionResult({
  result,
  questions,
  standardizationStatus,
  onReset,
}: {
  result: ExtractionResponse;
  questions: ExtractionQuestion[];
  standardizationStatus: StandardizationResult["status"] | null;
  onReset: () => void;
}) {
  const isReady = standardizationStatus === "ready";
  const needsConfirmation = standardizationStatus
    ? !isReady
    : result.status === "needs_confirmation";

  return (
    <section className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(20,35,28,0.04)]">
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-5 sm:px-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
              <span>报价草稿 #{result.quoteId}</span>
              <span className="text-line-strong">·</span>
              <span>{sourceTypeLabel(result.sourceType)}</span>
              <span className="text-line-strong">·</span>
              <span>{providerLabel(result.provider)}</span>
            </div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-ink">
              {result.supplierNameRaw}
            </h2>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <span>报价日期 {result.quoteDate}</span>
              <span>币种 {result.currency}</span>
              <span>{result.items.length} 行报价</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${
                needsConfirmation
                  ? "bg-amber-50 text-amber-800 ring-amber-200"
                  : "bg-brand-soft text-brand-strong ring-brand/15"
              }`}
            >
              {needsConfirmation ? "待核对" : "已核对"}
            </span>
            <button
              type="button"
              onClick={onReset}
              className="rounded-lg border border-line px-2.5 py-1 text-[11px] font-medium text-muted transition hover:bg-canvas hover:text-ink"
            >
              处理下一张
            </button>
          </div>
        </div>

        <div className="mx-5 mb-5 flex flex-wrap items-center gap-2 rounded-lg bg-canvas/70 px-3 py-2.5 text-[11px] text-ink-soft sm:mx-6 sm:mb-6">
          <span className="h-1.5 w-1.5 rounded-full bg-brand" />
          草稿已保存。当前还没有修改任何正式食材价格。
        </div>

        {result.warnings.length > 0 ? (
          <div className="mx-5 mb-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900 sm:mx-6 sm:mb-6">
            {result.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        ) : null}
      </div>

      {result.sourceType !== "text" && result.sourceUrl ? (
        <details className="group rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(20,35,28,0.03)]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-semibold text-ink">
            <span>查看报价原件</span>
            <span className="text-[11px] font-normal text-muted group-open:hidden">
              展开
            </span>
            <span className="hidden text-[11px] font-normal text-muted group-open:inline">
              收起
            </span>
          </summary>
          <div className="border-t border-line p-5">
            <div className="mb-3 flex justify-end">
              <a
                href={result.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-medium text-brand hover:underline"
              >
                在新窗口打开 ↗
              </a>
            </div>
            <div className="overflow-hidden rounded-xl border border-line bg-canvas">
              {result.sourceType === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={result.sourceUrl}
                  alt="上传的报价单原件"
                  className="mx-auto max-h-96 w-full object-contain"
                />
              ) : (
                <iframe
                  src={result.sourceUrl}
                  title="上传的报价单 PDF"
                  className="h-96 w-full bg-white"
                />
              )}
            </div>
          </div>
        </details>
      ) : null}

      {questions.length > 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-amber-950">
              提取阶段还有 {questions.length} 项需要核对
            </h2>
            <span className="text-[11px] text-amber-800">
              低置信度或供应商未匹配
            </span>
          </div>
          <div className="mt-3 grid gap-2">
            {questions.map((question, index) => (
              <article
                key={`${question.type}-${question.lineNo ?? "quote"}-${index}`}
                className="rounded-lg border border-amber-200 bg-white/80 p-3.5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                    {questionLabel(question.type)}
                  </span>
                  {question.lineNo ? (
                    <span className="text-[11px] text-muted">
                      第 {question.lineNo} 行
                    </span>
                  ) : null}
                </div>
                <p className="mt-1.5 text-xs leading-5 text-ink-soft">
                  {question.message}
                </p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(20,35,28,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">报价明细</h2>
            <p className="mt-1 text-[11px] text-muted">
              每一行都能回到原文证据。
            </p>
          </div>
          <span className="text-[11px] text-muted">共 {result.items.length} 行</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] text-left text-sm">
            <thead className="bg-canvas/70 text-[10px] uppercase tracking-[0.08em] text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">行</th>
                <th className="px-4 py-3 font-medium">原始食材</th>
                <th className="px-4 py-3 font-medium">数量 / 包装</th>
                <th className="px-4 py-3 font-medium">报价</th>
                <th className="px-4 py-3 font-medium">原文证据</th>
                <th className="px-4 py-3 font-medium">置信度</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {result.items.map((item) => (
                <tr key={item.lineNo} className="align-top">
                  <td className="px-4 py-3.5 text-[11px] tabular text-muted">
                    {item.lineNo}
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="font-medium text-ink">{item.itemNameRaw}</p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {item.priceType === "total" ? "行总价" : "单价"}
                    </p>
                    {item.notes ? (
                      <p className="mt-1 text-[11px] text-amber-700">
                        {item.notes}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-ink-soft">
                    <p>{quantityText(item)}</p>
                    <p className="mt-1 text-[11px] text-muted">
                      包装 {packageText(item)}
                    </p>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="font-medium tabular text-ink">
                      {priceText(item)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {item.priceUnit ?? "单位未识别"}
                    </p>
                  </td>
                  <td className="max-w-[260px] px-4 py-3.5 font-mono text-[11px] leading-5 text-muted">
                    {item.evidenceText}
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${confidenceClass(item.confidence)}`}
                    >
                      {confidenceLabel(item.confidence)}{" "}
                      {Math.round(item.confidence * 100)}%
                    </span>
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
