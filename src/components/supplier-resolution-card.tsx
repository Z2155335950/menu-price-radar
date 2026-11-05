"use client";

import { useEffect, useState } from "react";

import type {
  CatalogSupplier,
  SupplierResolutionResponse,
} from "@/domain/catalog";

type SupplierResolutionCardProps = {
  quoteId: number;
  supplierNameRaw: string;
  onResolved: (supplierName: string) => Promise<void> | void;
};

export default function SupplierResolutionCard({
  quoteId,
  supplierNameRaw,
  onResolved,
}: SupplierResolutionCardProps) {
  const [suppliers, setSuppliers] = useState<CatalogSupplier[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [newName, setNewName] = useState(supplierNameRaw);
  const [rememberAlias, setRememberAlias] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSuppliers() {
      setError(null);

      try {
        const response = await fetch(`/api/quotes/${quoteId}/supplier`);
        const payload = (await response.json()) as
          | SupplierResolutionResponse
          | { error?: string };

        if (!response.ok) {
          throw new Error(
            "error" in payload && payload.error
              ? payload.error
              : "读取供应商列表失败。",
          );
        }

        if (!cancelled) {
          setSuppliers((payload as SupplierResolutionResponse).suppliers);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "读取供应商列表失败。",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadSuppliers();

    return () => {
      cancelled = true;
    };
  }, [quoteId]);

  async function saveSupplier() {
    setError(null);

    if (!supplierId && !newName.trim()) {
      setError("请选择已有供应商，或填写新供应商名称。");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(`/api/quotes/${quoteId}/supplier`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: supplierId ? Number(supplierId) : null,
          newName: supplierId ? null : newName.trim(),
          rememberAlias,
        }),
      });
      const payload = (await response.json()) as
        | SupplierResolutionResponse
        | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "保存供应商失败。",
        );
      }

      const resolution = payload as SupplierResolutionResponse;

      if (!resolution.supplier) {
        throw new Error("供应商没有保存成功。");
      }

      await onResolved(resolution.supplier.name);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "保存供应商失败。",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-amber-950">
            先确认供应商
          </h2>
          <p className="mt-1 text-[11px] leading-5 text-amber-900/75">
            报价单写的是“{supplierNameRaw}”。可以关联已有供应商，也可以直接新建。
          </p>
        </div>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
          供应商待确认
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-[11px] font-medium text-ink-soft">
          已有供应商
          <select
            value={supplierId}
            onChange={(event) => setSupplierId(event.target.value)}
            disabled={isLoading || isSaving}
            className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 disabled:opacity-60"
          >
            <option value="">新建供应商</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-[11px] font-medium text-ink-soft">
          新供应商名称
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            disabled={Boolean(supplierId) || isSaving}
            className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 disabled:bg-canvas disabled:text-muted"
          />
        </label>
      </div>

      <label className="mt-3 flex items-center gap-2 text-[11px] text-muted">
        <input
          type="checkbox"
          checked={rememberAlias}
          onChange={(event) => setRememberAlias(event.target.checked)}
          className="accent-brand"
        />
        记住“{supplierNameRaw}”这个写法，下次自动识别
      </label>

      {error ? (
        <p className="mt-2 text-[11px] text-red-600">{error}</p>
      ) : null}

      <button
        type="button"
        onClick={saveSupplier}
        disabled={isLoading || isSaving}
        className="mt-3 rounded-lg bg-ink px-3.5 py-2 text-[11px] font-semibold text-white transition hover:bg-brand-strong disabled:opacity-50"
      >
        {isSaving ? "正在保存…" : "保存供应商并继续匹配"}
      </button>
    </section>
  );
}
