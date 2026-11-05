"use client";

import { useState } from "react";

type AnalyzeButtonProps = {
  quoteId: number;
  label?: string;
};

export default function AnalyzeButton({
  quoteId,
  label = "计算毛利风险",
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
        className="rounded-full bg-emerald-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isRunning ? "正在计算…" : label}
      </button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
