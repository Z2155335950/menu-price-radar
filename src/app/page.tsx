import Link from "next/link";

import {
  APP_NAME,
  APP_TAGLINE,
  CURRENT_STAGE,
  CURRENT_STAGE_LABEL,
} from "@/lib/app-meta";

const checks = [
  {
    title: "报价单可以读",
    detail: "支持图片、电子 PDF 和粘贴文本，并保留原件、证据和置信度。",
  },
  {
    title: "风险清单可以看",
    detail: "确认模糊项后，应用价格历史并计算成本、成本率和风险排序。",
  },
  {
    title: "全链路可追溯",
    detail: "报价、匹配、确认、改价、计算和建议都有审计记录与自动化测试。",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <div className="mx-auto max-w-6xl px-6 py-8 sm:py-12">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-900 text-lg font-bold text-white">
              菜
            </div>
            <div>
              <p className="font-semibold tracking-tight">{APP_NAME}</p>
              <p className="text-xs text-stone-500">{APP_TAGLINE}</p>
            </div>
          </div>

          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
            阶段 {CURRENT_STAGE} / 12 · {CURRENT_STAGE_LABEL}
          </span>
        </header>

        <section className="grid gap-10 py-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:py-16">
          <div>
            <p className="mb-4 text-sm font-semibold tracking-wide text-emerald-800">
              报价单 → 确认 → 风险清单
            </p>
            <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              一张报价单，
              <br />
              <span className="text-emerald-800">
                找出正在变薄的食材毛利。
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-8 text-stone-600">
              上传供应商报价，系统提取食材和价格，确认模糊项，再按预计影响给受影响的菜排序。
              最终数字由确定性代码计算，不交给模型心算。
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/quotes/new"
                className="rounded-full bg-emerald-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
              >
                开始处理报价
              </Link>
              <a
                href="/api/health"
                className="rounded-full border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-stone-600 transition hover:bg-stone-50 hover:text-stone-900"
              >
                查看健康检查
              </a>
              <span className="text-sm text-stone-500">
                mock 模式，不需要 AI Key
              </span>
            </div>
          </div>

          <aside className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-stone-500">
              运行状态
            </p>

            <dl className="mt-5 divide-y divide-stone-100">
              <div className="flex items-center justify-between py-3">
                <dt className="text-sm text-stone-500">当前阶段</dt>
                <dd className="text-sm font-semibold text-stone-900">
                  {String(CURRENT_STAGE).padStart(2, "0")} / 12
                </dd>
              </div>
              <div className="flex items-center justify-between py-3">
                <dt className="text-sm text-stone-500">页面</dt>
                <dd className="text-sm font-semibold text-emerald-700">
                  已渲染
                </dd>
              </div>
              <div className="flex items-center justify-between py-3">
                <dt className="text-sm text-stone-500">数据库驱动</dt>
                <dd className="text-sm font-semibold text-stone-900">
                  node:sqlite
                </dd>
              </div>
              <div className="flex items-center justify-between py-3">
                <dt className="text-sm text-stone-500">Schema</dt>
                <dd className="text-sm font-semibold text-stone-900">001</dd>
              </div>
              <div className="flex items-center justify-between py-3">
                <dt className="text-sm text-stone-500">演示餐厅</dt>
                <dd className="text-sm font-semibold text-stone-900">临江小馆</dd>
              </div>
              <div className="flex items-center justify-between py-3">
                <dt className="text-sm text-stone-500">AI 模式</dt>
                <dd className="text-sm font-semibold text-stone-900">mock</dd>
              </div>
            </dl>

            <a
              href="/api/health"
              className="mt-5 block rounded-2xl bg-stone-50 px-4 py-3 text-sm text-stone-600 transition hover:bg-stone-100 hover:text-stone-900"
            >
              健康检查会真实执行一次 SQLite 查询 →
            </a>
          </aside>
        </section>

        <section aria-labelledby="checks-heading" className="pb-12">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2
                id="checks-heading"
                className="text-lg font-semibold tracking-tight"
              >
                MVP 已经打通
              </h2>
              <p className="mt-1 text-sm text-stone-500">
                从报价单读取到按毛利影响排序的完整链路。
              </p>
            </div>
            <span className="text-xs font-medium text-stone-400">
              12 / 12 · 可现场演示
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {checks.map((check, index) => (
              <article
                key={check.title}
                className="rounded-2xl border border-stone-200 bg-white p-5"
              >
                <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-50 text-sm font-bold text-emerald-800">
                  {index + 1}
                </span>
                <h3 className="mt-4 text-sm font-semibold text-stone-900">
                  {check.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-stone-500">
                  {check.detail}
                </p>
              </article>
            ))}
          </div>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-5 text-xs text-stone-500">
          <p>当前只使用虚构演示数据，不包含真实餐厅或供应商信息。</p>
          <p>MVP 已完成 · 可完整演示</p>
        </footer>
      </div>
    </main>
  );
}
