"use client";

import { useEffect, useState } from "react";

import type {
  CatalogIngredient,
  CatalogIngredientListResponse,
  CatalogUnitConversion,
} from "@/domain/catalog";

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T;

  if (!response.ok) {
    const failure = payload as { error?: string };
    throw new Error(failure.error ?? "操作失败，请稍后重试。");
  }

  return payload;
}

type IngredientCardProps = {
  ingredient: CatalogIngredient;
  onUpdated: (ingredient: CatalogIngredient) => void;
};

function IngredientCard({
  ingredient,
  onUpdated,
}: IngredientCardProps) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(ingredient.name);
  const [keepOldNameAsAlias, setKeepOldNameAsAlias] = useState(false);
  const [showAliasForm, setShowAliasForm] = useState(false);
  const [newAlias, setNewAlias] = useState("");
  const [editingAliasId, setEditingAliasId] = useState<number | null>(null);
  const [aliasDraft, setAliasDraft] = useState("");
  const [showUnitForm, setShowUnitForm] = useState(false);
  const [newUnit, setNewUnit] = useState("");
  const [newFactor, setNewFactor] = useState("");
  const [editingUnitId, setEditingUnitId] = useState<number | null>(null);
  const [unitName, setUnitName] = useState("");
  const [unitFactor, setUnitFactor] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function renameIngredient() {
    if (!name.trim()) {
      setError("食材名称不能为空。");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/catalog/ingredients/${ingredient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          keepOldNameAsAlias,
        }),
      });
      const updated = await readJson<CatalogIngredient>(response);
      onUpdated(updated);
      setEditingName(false);
      setKeepOldNameAsAlias(false);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "修改食材失败。",
      );
    } finally {
      setBusy(false);
    }
  }

  function sortAliases(aliases: CatalogIngredient["aliases"]) {
    return [...aliases].sort((a, b) =>
      a.alias.localeCompare(b.alias, "zh-CN"),
    );
  }

  async function saveAlias() {
    if (!newAlias.trim()) {
      setError("请填写一个常见叫法。");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/catalog/ingredients/${ingredient.id}/aliases`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ alias: newAlias.trim() }),
        },
      );
      const saved = await readJson<CatalogIngredient["aliases"][number]>(
        response,
      );
      const withoutOld = ingredient.aliases.filter(
        (alias) => alias.id !== saved.id,
      );
      onUpdated({
        ...ingredient,
        aliases: sortAliases([...withoutOld, saved]),
      });
      setNewAlias("");
      setShowAliasForm(false);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "保存别名失败。",
      );
    } finally {
      setBusy(false);
    }
  }

  async function updateAlias(aliasId: number) {
    if (!aliasDraft.trim()) {
      setError("别名不能为空。");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/catalog/ingredients/${ingredient.id}/aliases/${aliasId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ alias: aliasDraft.trim() }),
        },
      );
      const saved = await readJson<CatalogIngredient["aliases"][number]>(
        response,
      );
      onUpdated({
        ...ingredient,
        aliases: sortAliases(
          ingredient.aliases.map((alias) =>
            alias.id === saved.id ? saved : alias,
          ),
        ),
      });
      setEditingAliasId(null);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "修改别名失败。",
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteAlias(aliasId: number, alias: string) {
    if (!window.confirm(`确定删除别名“${alias}”吗？`)) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/catalog/ingredients/${ingredient.id}/aliases/${aliasId}`,
        { method: "DELETE" },
      );
      await readJson<{ deleted: boolean }>(response);
      onUpdated({
        ...ingredient,
        aliases: ingredient.aliases.filter((item) => item.id !== aliasId),
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "删除别名失败。",
      );
    } finally {
      setBusy(false);
    }
  }

  function sortUnits(units: CatalogUnitConversion[]): CatalogUnitConversion[] {
    return [...units].sort((a, b) =>
      a.fromUnit.localeCompare(b.fromUnit, "zh-CN"),
    );
  }

  async function saveUnit() {
    const factor = Number(newFactor);

    if (!newUnit.trim() || !Number.isInteger(factor) || factor <= 0) {
      setError("请填写包装单位和正整数换算数量。");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/catalog/ingredients/${ingredient.id}/units`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromUnit: newUnit.trim(),
            factor,
          }),
        },
      );
      const saved = await readJson<CatalogUnitConversion>(response);
      const withoutOld = ingredient.unitConversions.filter(
        (unit) => unit.id !== saved.id,
      );
      onUpdated({
        ...ingredient,
        unitConversions: sortUnits([...withoutOld, saved]),
      });
      setNewUnit("");
      setNewFactor("");
      setShowUnitForm(false);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "保存单位失败。",
      );
    } finally {
      setBusy(false);
    }
  }

  function beginEditUnit(unit: CatalogUnitConversion) {
    setEditingUnitId(unit.id);
    setUnitName(unit.fromUnit);
    setUnitFactor(String(unit.factor));
    setError(null);
  }

  async function updateUnit() {
    if (editingUnitId === null) {
      return;
    }

    const factor = Number(unitFactor);

    if (!unitName.trim() || !Number.isInteger(factor) || factor <= 0) {
      setError("请填写包装单位和正整数换算数量。");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/catalog/ingredients/${ingredient.id}/units/${editingUnitId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromUnit: unitName.trim(),
            factor,
          }),
        },
      );
      const saved = await readJson<CatalogUnitConversion>(response);
      onUpdated({
        ...ingredient,
        unitConversions: sortUnits(
          ingredient.unitConversions.map((unit) =>
            unit.id === saved.id ? saved : unit,
          ),
        ),
      });
      setEditingUnitId(null);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "修改单位失败。",
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteUnit(unit: CatalogUnitConversion) {
    if (
      !window.confirm(
        `确定删除“1 ${unit.fromUnit} = ${unit.factor} ${unit.toUnit}”吗？`,
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/catalog/ingredients/${ingredient.id}/units/${unit.id}`,
        { method: "DELETE" },
      );
      await readJson<{ deleted: boolean }>(response);
      onUpdated({
        ...ingredient,
        unitConversions: ingredient.unitConversions.filter(
          (item) => item.id !== unit.id,
        ),
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "删除单位失败。",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-2xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(20,35,28,0.03)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {editingName ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
                />
                <button
                  type="button"
                  onClick={renameIngredient}
                  disabled={busy}
                  className="rounded-lg bg-ink px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-50"
                >
                  保存名称
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setName(ingredient.name);
                    setEditingName(false);
                    setKeepOldNameAsAlias(false);
                    setError(null);
                  }}
                  className="text-[11px] text-muted"
                >
                  取消
                </button>
              </div>
              <label className="flex items-center gap-2 text-[11px] text-muted">
                <input
                  type="checkbox"
                  checked={keepOldNameAsAlias}
                  onChange={(event) =>
                    setKeepOldNameAsAlias(event.target.checked)
                  }
                  className="accent-brand"
                />
                把旧名称继续保留为别名
              </label>
              <p className="text-[10px] leading-5 text-muted">
                如果只是纠正错别字，不需要勾选。
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold tracking-tight text-ink">
                {ingredient.name}
              </h2>
              <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-semibold text-brand-strong">
                统一按 {ingredient.baseUnit} 计算
              </span>
              <button
                type="button"
                onClick={() => {
                  setName(ingredient.name);
                  setEditingName(true);
                }}
                className="text-[11px] font-medium text-brand hover:underline"
              >
                修改名称
              </button>
            </div>
          )}

          <div className="mt-4 rounded-xl border border-line bg-canvas/35 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold text-ink">
                  其他常见叫法
                </p>
                <p className="mt-0.5 text-[10px] text-muted">
                  报价单里写成这些名字时，也能认出同一种食材。
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAliasForm((current) => !current);
                  setError(null);
                }}
                className="rounded-md bg-white px-2.5 py-1.5 text-[10px] font-semibold text-brand-strong ring-1 ring-line"
              >
                + 添加别名
              </button>
            </div>

            <div className="mt-2 space-y-1.5">
              {ingredient.aliases.length > 0 ? (
                ingredient.aliases.map((alias) =>
                  editingAliasId === alias.id ? (
                    <div
                      key={alias.id}
                      className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-2.5 py-2"
                    >
                      <input
                        value={aliasDraft}
                        onChange={(event) => setAliasDraft(event.target.value)}
                        className="min-w-0 flex-1 rounded-md border border-line px-2 py-1.5 text-xs outline-none focus:border-brand"
                      />
                      <button
                        type="button"
                        onClick={() => updateAlias(alias.id)}
                        disabled={busy}
                        className="text-[10px] font-semibold text-brand disabled:opacity-50"
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingAliasId(null)}
                        className="text-[10px] text-muted"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <div
                      key={alias.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-2"
                    >
                      <div>
                        <span className="text-xs font-medium text-ink">
                          {alias.alias}
                        </span>
                        {alias.supplierName ? (
                          <span className="ml-2 text-[10px] text-muted">
                            仅限 {alias.supplierName}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-3 text-[10px]">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingAliasId(alias.id);
                            setAliasDraft(alias.alias);
                            setError(null);
                          }}
                          className="font-medium text-brand hover:underline"
                        >
                          修改
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteAlias(alias.id, alias.alias)}
                          disabled={busy}
                          className="font-medium text-danger hover:underline disabled:opacity-50"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  ),
                )
              ) : (
                <p className="text-[10px] text-muted">还没有添加别名。</p>
              )}
            </div>

            {showAliasForm ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-brand/20 bg-white p-2.5">
                <input
                  value={newAlias}
                  onChange={(event) => setNewAlias(event.target.value)}
                  placeholder="例如：洋芋、西红柿、鸡腿"
                  className="min-w-0 flex-1 rounded-md border border-line px-2.5 py-1.5 text-xs outline-none focus:border-brand"
                />
                <button
                  type="button"
                  onClick={saveAlias}
                  disabled={busy}
                  className="rounded-md bg-ink px-3 py-1.5 text-[10px] font-semibold text-white disabled:opacity-50"
                >
                  保存别名
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setShowUnitForm((current) => !current);
            setError(null);
          }}
          className="rounded-lg border border-line bg-white px-3 py-1.5 text-[11px] font-semibold text-ink-soft transition hover:border-brand/40 hover:text-brand-strong"
        >
          + 添加包装换算
        </button>
      </div>

      <div className="mt-4 border-t border-line pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
          包装换算
        </p>
        <div className="mt-2 space-y-2">
          {ingredient.unitConversions.length > 0 ? (
            ingredient.unitConversions.map((unit) => (
              <div
                key={unit.id}
                className="rounded-lg border border-line bg-canvas/45 px-3 py-2.5"
              >
                {editingUnitId === unit.id ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="text-[10px] text-muted">
                      包装单位
                      <input
                        value={unitName}
                        onChange={(event) => setUnitName(event.target.value)}
                        className="mt-1 block w-24 rounded-md border border-line bg-white px-2 py-1.5 text-xs text-ink outline-none focus:border-brand"
                      />
                    </label>
                    <span className="pb-2 text-[11px] text-muted">=</span>
                    <label className="text-[10px] text-muted">
                      数量
                      <input
                        value={unitFactor}
                        onChange={(event) => setUnitFactor(event.target.value)}
                        inputMode="numeric"
                        className="mt-1 block w-24 rounded-md border border-line bg-white px-2 py-1.5 text-xs text-ink outline-none focus:border-brand"
                      />
                    </label>
                    <span className="pb-2 text-[11px] text-muted">
                      {unit.toUnit}
                    </span>
                    <button
                      type="button"
                      onClick={updateUnit}
                      disabled={busy}
                      className="ml-auto rounded-md bg-ink px-2.5 py-1.5 text-[10px] font-semibold text-white disabled:opacity-50"
                    >
                      保存
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingUnitId(null)}
                      className="pb-1.5 text-[10px] text-muted"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-medium text-ink">
                      1 {unit.fromUnit}
                      <span className="mx-1.5 text-muted">=</span>
                      {unit.factor.toLocaleString("zh-CN")} {unit.toUnit}
                    </p>
                    <div className="flex items-center gap-3 text-[10px]">
                      <span className="text-muted">
                        {unit.source === "user_confirmed"
                          ? "客户设置"
                          : "初始设置"}
                      </span>
                      <button
                        type="button"
                        onClick={() => beginEditUnit(unit)}
                        className="font-medium text-brand hover:underline"
                      >
                        修改
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteUnit(unit)}
                        disabled={busy}
                        className="font-medium text-danger hover:underline disabled:opacity-50"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          ) : (
            <p className="rounded-lg border border-dashed border-line px-3 py-2.5 text-[11px] text-muted">
              还没有设置包装换算。遇到“瓶、桶、箱”等报价时会要求确认。
            </p>
          )}
        </div>

        {showUnitForm ? (
          <div className="mt-3 rounded-lg border border-brand/20 bg-brand-soft/35 p-3">
            <p className="text-[11px] font-semibold text-ink">
              为“{ingredient.name}”设置包装换算
            </p>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="text-[10px] text-muted">
                包装怎么写
                <input
                  value={newUnit}
                  onChange={(event) => setNewUnit(event.target.value)}
                  placeholder="瓶 / 桶 / 箱"
                  className="mt-1 block w-28 rounded-md border border-line bg-white px-2 py-1.5 text-xs text-ink outline-none focus:border-brand"
                />
              </label>
              <span className="pb-2 text-[11px] text-muted">=</span>
              <label className="text-[10px] text-muted">
                1 个等于多少
                <input
                  value={newFactor}
                  onChange={(event) => setNewFactor(event.target.value)}
                  inputMode="numeric"
                  placeholder="500"
                  className="mt-1 block w-24 rounded-md border border-line bg-white px-2 py-1.5 text-xs text-ink outline-none focus:border-brand"
                />
              </label>
              <span className="pb-2 text-[11px] text-muted">
                {ingredient.baseUnit}
              </span>
              <button
                type="button"
                onClick={saveUnit}
                disabled={busy}
                className="rounded-md bg-ink px-3 py-1.5 text-[10px] font-semibold text-white disabled:opacity-50"
              >
                保存换算
              </button>
            </div>
            <p className="mt-2 text-[10px] leading-5 text-muted">
              这里只影响当前食材。例如醋的“1瓶”和香油的“1瓶”可以设置不同容量。
            </p>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="mt-2 text-[11px] text-red-600">{error}</p>
      ) : null}
    </article>
  );
}

export default function CatalogManager() {
  const [query, setQuery] = useState("");
  const [ingredients, setIngredients] = useState<CatalogIngredient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/catalog/ingredients?q=${encodeURIComponent(query.trim())}`,
          { signal: controller.signal },
        );
        const payload = await readJson<CatalogIngredientListResponse>(response);
        setIngredients(payload.ingredients);
      } catch (requestError) {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        ) {
          return;
        }

        setError(
          requestError instanceof Error
            ? requestError.message
            : "读取食材失败。",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function updateIngredient(updated: CatalogIngredient) {
    setIngredients((current) =>
      current.map((ingredient) =>
        ingredient.id === updated.id ? updated : ingredient,
      ),
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-ink">搜索食材</h2>
            <p className="mt-1 text-[11px] leading-5 text-muted">
              输入食材名称或常见叫法就能找到，然后修改名称、别名和包装。
            </p>
          </div>
          <span className="text-[11px] text-muted">
            当前显示 {ingredients.length} 项
          </span>
        </div>
        <label className="mt-4 block">
          <span className="sr-only">搜索食材</span>
          <div className="flex items-center gap-3 rounded-xl border border-line bg-canvas/45 px-4 py-3 focus-within:border-brand focus-within:bg-white focus-within:ring-2 focus-within:ring-brand/10">
            <svg
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-muted"
            >
              <circle cx="8.5" cy="8.5" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="m12.5 12.5 4 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="输入食材名称或别名，例如：香醋、洋芋、鸡腿"
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted/70"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="text-xs text-muted hover:text-ink"
              >
                清空
              </button>
            ) : null}
          </div>
        </label>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <section className="space-y-3">
          {isLoading ? (
            <div className="rounded-2xl border border-line bg-white px-5 py-8 text-center text-xs text-muted">
              正在读取食材…
            </div>
          ) : null}

          {!isLoading && error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {!isLoading && !error && ingredients.length === 0 ? (
            <div className="rounded-2xl border border-line bg-white px-5 py-10 text-center">
              <p className="text-sm font-semibold text-ink">没有找到匹配食材</p>
              <p className="mt-1 text-[11px] text-muted">
                可以换一个名称或别名搜索。
              </p>
            </div>
          ) : null}

          {!isLoading && !error
            ? ingredients.map((ingredient) => (
                <IngredientCard
                  key={ingredient.id}
                  ingredient={ingredient}
                  onUpdated={updateIngredient}
                />
              ))
            : null}
        </section>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="text-sm font-semibold text-ink">
              为什么“一瓶”要分开设置
            </h2>
            <p className="mt-2 text-[11px] leading-6 text-muted">
              不同的瓶大小不同。哪怕都叫“瓶”，也要分别告诉系统这一瓶有多少。
            </p>
            <div className="mt-4 space-y-2 text-[11px]">
              <p className="rounded-lg bg-canvas px-3 py-2">
                香醋：1 瓶 = 500 ml
              </p>
              <p className="rounded-lg bg-canvas px-3 py-2">
                香油：1 瓶 = 250 ml
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5">
            <h2 className="text-sm font-semibold text-amber-950">
              修改后什么时候生效
            </h2>
            <p className="mt-2 text-[11px] leading-5 text-amber-900/80">
              用于以后导入或重新核对的报价。已经算完和改过价格的报价不会被改动。
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
