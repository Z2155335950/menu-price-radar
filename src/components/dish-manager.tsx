"use client";

import { useEffect, useState } from "react";

import type { CatalogIngredient } from "@/domain/catalog";
import type {
  CatalogDish,
  DishListResponse,
} from "@/domain/dish-catalog";

async function readDishJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T;

  if (!response.ok) {
    const failure = payload as { error?: string };
    throw new Error(failure.error ?? "操作失败，请稍后重试。");
  }

  return payload;
}

function formatYuan(microYuan: number): string {
  return `¥${(microYuan / 1_000_000).toFixed(2)}`;
}

function baseUnitLabel(baseUnit: "g" | "ml" | "个"): string {
  if (baseUnit === "g") {
    return "克";
  }

  if (baseUnit === "ml") {
    return "毫升";
  }

  return "个";
}

type RecipeDraft = {
  ingredientId: string;
  quantityBase: string;
};

type DishEditorProps = {
  dish: CatalogDish | null;
  ingredients: CatalogIngredient[];
  onSaved: (dish: CatalogDish) => void;
  onCancel: () => void;
};

function DishEditor({
  dish,
  ingredients,
  onSaved,
  onCancel,
}: DishEditorProps) {
  const [name, setName] = useState(dish?.name ?? "");
  const [sellingPrice, setSellingPrice] = useState(
    dish ? (dish.sellingPriceMicroYuan / 1_000_000).toFixed(2) : "",
  );
  const [targetRate, setTargetRate] = useState(
    dish ? String(dish.targetFoodCostRateBps / 100) : "35",
  );
  const [weeklySales, setWeeklySales] = useState(
    dish?.weeklySales === null || dish?.weeklySales === undefined
      ? ""
      : String(dish.weeklySales),
  );
  const [recipe, setRecipe] = useState<RecipeDraft[]>(
    dish?.recipe.map((line) => ({
      ingredientId: String(line.ingredientId),
      quantityBase: String(line.quantityBase),
    })) ?? [
      {
        ingredientId: ingredients[0] ? String(ingredients[0].id) : "",
        quantityBase: "100",
      },
    ],
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function selectedIngredient(line: RecipeDraft) {
    return ingredients.find(
      (ingredient) => String(ingredient.id) === line.ingredientId,
    );
  }

  function updateRecipe(
    index: number,
    changes: Partial<RecipeDraft>,
  ) {
    setRecipe((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...changes } : line,
      ),
    );
  }

  function addRecipeLine() {
    const used = new Set(recipe.map((line) => line.ingredientId));
    const next = ingredients.find(
      (ingredient) => !used.has(String(ingredient.id)),
    );

    if (!next) {
      setError("所有食材都已经加入配方。");
      return;
    }

    setRecipe((current) => [
      ...current,
      { ingredientId: String(next.id), quantityBase: "100" },
    ]);
  }

  async function saveDish() {
    setError(null);

    if (!name.trim() || !sellingPrice.trim()) {
      setError("请填写菜名和每份售价。");
      return;
    }

    const targetRateNumber = Number(targetRate);
    const weeklySalesNumber =
      weeklySales.trim() === "" ? null : Number(weeklySales);
    const parsedRecipe = recipe.map((line) => ({
      ingredientId: Number(line.ingredientId),
      quantityBase: Number(line.quantityBase),
    }));

    if (
      !Number.isFinite(targetRateNumber) ||
      targetRateNumber <= 0 ||
      targetRateNumber > 100
    ) {
      setError("目标食材成本率需要在 0 到 100 之间。");
      return;
    }

    if (
      weeklySalesNumber !== null &&
      (!Number.isInteger(weeklySalesNumber) || weeklySalesNumber < 0)
    ) {
      setError("每周销量必须是不小于 0 的整数，也可以留空。");
      return;
    }

    if (
      parsedRecipe.length === 0 ||
      parsedRecipe.some(
        (line) =>
          !line.ingredientId ||
          !Number.isInteger(line.quantityBase) ||
          line.quantityBase <= 0,
      )
    ) {
      setError("请至少选择一种食材，并填写大于 0 的整数用量。");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(
        dish ? `/api/catalog/dishes/${dish.id}` : "/api/catalog/dishes",
        {
          method: dish ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            sellingPrice: sellingPrice.trim(),
            targetFoodCostRateBps: Math.round(targetRateNumber * 100),
            weeklySales: weeklySalesNumber,
            recipe: parsedRecipe,
          }),
        },
      );
      const saved = await readDishJson<CatalogDish>(response);
      onSaved(saved);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "保存菜品失败。",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-brand/25 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand">
            {dish ? "修改菜品" : "新增菜品"}
          </p>
          <h2 className="mt-1 text-base font-semibold text-ink">
            {dish ? `修改“${dish.name}”` : "填写一道菜的售价和配方"}
          </h2>
          <p className="mt-1 text-[11px] leading-5 text-muted">
            配方用量按食材资料中的统一单位填写。
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-[11px] font-medium text-muted hover:text-ink"
        >
          取消
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-[11px] font-medium text-ink-soft">
          菜名
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：西兰花炒肉"
            className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
          />
        </label>
        <label className="text-[11px] font-medium text-ink-soft">
          每份售价（元）
          <input
            value={sellingPrice}
            onChange={(event) => setSellingPrice(event.target.value)}
            inputMode="decimal"
            placeholder="例如：26.00"
            className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
          />
        </label>
        <label className="text-[11px] font-medium text-ink-soft">
          希望食材成本不超过（%）
          <input
            value={targetRate}
            onChange={(event) => setTargetRate(event.target.value)}
            inputMode="decimal"
            placeholder="35"
            className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
          />
        </label>
        <label className="text-[11px] font-medium text-ink-soft">
          每周大约卖多少份
          <input
            value={weeklySales}
            onChange={(event) => setWeeklySales(event.target.value)}
            inputMode="numeric"
            placeholder="不知道可以留空"
            className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
          />
        </label>
      </div>

      <div className="mt-5 rounded-xl border border-line bg-canvas/35 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-ink">每份要用哪些食材</h3>
            <p className="mt-1 text-[10px] text-muted">
              例如 250 克鸡肉、20 毫升食用油。
            </p>
          </div>
          <button
            type="button"
            onClick={addRecipeLine}
            disabled={recipe.length >= ingredients.length}
            className="rounded-lg bg-white px-3 py-1.5 text-[10px] font-semibold text-brand-strong ring-1 ring-line disabled:opacity-40"
          >
            + 再加一种
          </button>
        </div>

        <div className="mt-3 space-y-2">
          {recipe.map((line, index) => {
            const ingredient = selectedIngredient(line);
            const used = new Set(
              recipe
                .filter((_, lineIndex) => lineIndex !== index)
                .map((item) => item.ingredientId),
            );

            return (
              <div
                key={`${index}-${line.ingredientId}`}
                className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px_auto] sm:items-end"
              >
                <label className="text-[10px] text-muted">
                  食材
                  <select
                    value={line.ingredientId}
                    onChange={(event) =>
                      updateRecipe(index, {
                        ingredientId: event.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink outline-none focus:border-brand"
                  >
                    {ingredients.map((option) => (
                      <option
                        key={option.id}
                        value={option.id}
                        disabled={used.has(String(option.id))}
                      >
                        {option.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-[10px] text-muted">
                  每份用量（{ingredient ? baseUnitLabel(ingredient.baseUnit) : "单位"}）
                  <input
                    value={line.quantityBase}
                    onChange={(event) =>
                      updateRecipe(index, {
                        quantityBase: event.target.value,
                      })
                    }
                    inputMode="numeric"
                    className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink outline-none focus:border-brand"
                  />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setRecipe((current) =>
                      current.filter((_, lineIndex) => lineIndex !== index),
                    )
                  }
                  disabled={recipe.length === 1}
                  className="pb-2 text-[10px] font-medium text-danger disabled:opacity-30"
                >
                  删除
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {error ? <p className="mt-3 text-[11px] text-red-600">{error}</p> : null}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={saveDish}
          disabled={isSaving || ingredients.length === 0}
          className="rounded-lg bg-ink px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-brand-strong disabled:opacity-50"
        >
          {isSaving ? "正在保存…" : dish ? "保存修改" : "添加菜品"}
        </button>
      </div>
    </section>
  );
}

export default function DishManager() {
  const [query, setQuery] = useState("");
  const [dishes, setDishes] = useState<CatalogDish[]>([]);
  const [ingredients, setIngredients] = useState<CatalogIngredient[]>([]);
  const [editing, setEditing] = useState<{
    dish: CatalogDish | null;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadIngredients() {
      try {
        const response = await fetch("/api/catalog/ingredients", {
          signal: controller.signal,
        });
        const payload = await readDishJson<{
          ingredients: CatalogIngredient[];
        }>(response);
        setIngredients(payload.ingredients);
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "读取食材失败。",
          );
        }
      }
    }

    void loadIngredients();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/catalog/dishes?q=${encodeURIComponent(query.trim())}`,
          { signal: controller.signal },
        );
        const payload = await readDishJson<DishListResponse>(response);
        setDishes(payload.dishes);
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
            : "读取菜品失败。",
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

  function dishSaved(saved: CatalogDish) {
    setDishes((current) => {
      const exists = current.some((dish) => dish.id === saved.id);
      return exists
        ? current.map((dish) => (dish.id === saved.id ? saved : dish))
        : [...current, saved];
    });
    setEditing(null);
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">搜索菜品</h2>
            <p className="mt-1 text-[11px] leading-5 text-muted">
              找到菜名后可以修改售价、周销量和每份配方。
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditing({ dish: null })}
            className="rounded-lg bg-ink px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-strong"
          >
            + 添加菜品
          </button>
        </div>
        <label className="mt-4 block">
          <span className="sr-only">搜索菜品</span>
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
              placeholder="输入菜名，例如：宫保鸡丁"
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

      {editing ? (
        <DishEditor
          dish={editing.dish}
          ingredients={ingredients}
          onSaved={dishSaved}
          onCancel={() => setEditing(null)}
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <section className="space-y-3">
          {isLoading ? (
            <div className="rounded-2xl border border-line bg-white px-5 py-8 text-center text-xs text-muted">
              正在读取菜品…
            </div>
          ) : null}

          {!isLoading && error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {!isLoading && !error && dishes.length === 0 ? (
            <div className="rounded-2xl border border-line bg-white px-5 py-10 text-center">
              <p className="text-sm font-semibold text-ink">没有找到匹配菜品</p>
              <p className="mt-1 text-[11px] text-muted">
                可以换一个菜名搜索，或者添加新菜品。
              </p>
            </div>
          ) : null}

          {!isLoading && !error
            ? dishes.map((dish) => (
                <article
                  key={dish.id}
                  className="rounded-2xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(20,35,28,0.03)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-ink">
                        {dish.name}
                      </h2>
                      <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted">
                        <span className="rounded-full bg-canvas px-2 py-1">
                          售价 {formatYuan(dish.sellingPriceMicroYuan)}
                        </span>
                        <span className="rounded-full bg-canvas px-2 py-1">
                          目标成本率{" "}
                          {(dish.targetFoodCostRateBps / 100).toFixed(1)}%
                        </span>
                        <span className="rounded-full bg-canvas px-2 py-1">
                          {dish.weeklySales === null
                            ? "周销量未填写"
                            : `每周 ${dish.weeklySales} 份`}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditing({ dish })}
                      className="rounded-lg border border-line bg-white px-3 py-1.5 text-[11px] font-semibold text-brand-strong transition hover:border-brand/40"
                    >
                      修改资料
                    </button>
                  </div>

                  <div className="mt-4 border-t border-line pt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                      每份配方
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {dish.recipe.map((ingredient) => (
                        <span
                          key={ingredient.ingredientId}
                          className="rounded-lg bg-canvas/70 px-2.5 py-1.5 text-[11px] text-ink-soft"
                        >
                          {ingredient.ingredientName}{" "}
                          {ingredient.quantityBase.toLocaleString("zh-CN")}{" "}
                          {baseUnitLabel(ingredient.baseUnit)}
                        </span>
                      ))}
                    </div>
                  </div>
                </article>
              ))
            : null}
        </section>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="text-sm font-semibold text-ink">配方怎么写</h2>
            <p className="mt-2 text-[11px] leading-6 text-muted">
              填写做一份菜实际使用多少食材。系统会用统一单位计算成本，不需要填写整箱或整瓶的采购量。
            </p>
            <div className="mt-3 rounded-lg bg-canvas px-3 py-2.5 text-[11px] leading-5 text-ink-soft">
              例：宫保鸡丁每份使用 250 克去骨鸡腿、50 克花生米、100 克黄瓜。
            </div>
          </section>
          <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5">
            <h2 className="text-sm font-semibold text-amber-950">修改后何时生效</h2>
            <p className="mt-2 text-[11px] leading-5 text-amber-900/80">
              售价、周销量和配方用于下一次风险分析。已经生成的分析结果不会自动改变，需要重新分析。
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
