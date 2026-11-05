"use client";

import { useState } from "react";

type AnalyzeButtonProps = {
  quoteId: number;
  label?: string;
  tone?: "dark" | "light";
};

export default function AnalyzeButton({
  quoteId,
  label = "应用价格并分析",
  tone = "dark",
}: AnalyzeButtonProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyze() {
    setError(null);
    setIsRunning(true);

    try {
      const response = await fetch(`/api/quotes/${quoteId}/analyze`, {
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "分析失败。");
      }

      window.location.href = `/quotes/${quoteId}`;
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "分析失败。",
      );
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={analyze}
        disabled={isRunning}
        className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
          tone === "light"
            ? "bg-white text-brand-strong hover:bg-brand-soft"
            : "bg-ink text-white hover:bg-brand-strong"
        }`}
      >
        {isRunning ? "正在计算…" : label}
        <span aria-hidden="true">→</span>
      </button>
      {error ? (
        <span
          className={`text-[11px] ${
            tone === "light" ? "text-red-100" : "text-red-600"
          }`}
        >
          {error}
        </span>
      ) : null}
    </div>
  );
}
