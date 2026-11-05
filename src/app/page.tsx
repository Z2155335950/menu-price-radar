import Link from "next/link";

import AppShell from "@/components/app-shell";

const workflow = [
  {
    step: "01",
    title: "导入报价",
    detail: "上传图片、电子 PDF，或直接粘贴供应商发来的文本。",
  },
  {
    step: "02",
    title: "核对异常",
    detail: "系统完成食材匹配和单位换算，只把不确定项交给你确认。",
  },
  {
    step: "03",
    title: "应用新价",
    detail: "确认后写入价格历史，旧价格保留，不覆盖可追溯记录。",
  },
  {
    step: "04",
    title: "处理风险",
    detail: "按预计周影响排序，直接看到先谈哪家、先改哪道菜。",
  },
];

const capabilities = [
  {
    label: "输入",
    title: "三种报价格式",
    detail: "图片、电子 PDF、粘贴文本都能进入同一套提取流程。",
  },
  {
    label: "计算",
    title: "确定性成本引擎",
    detail: "数量、单位、成本和风险都由代码计算，不交给模型心算。",
  },
  {
    label: "输出",
    title: "可执行的行动清单",
    detail: "风险排序、报价证据、菜谱用量和行动建议放在同一个页面。",
  },
];

export default function HomePage() {
  return (
    <AppShell active="dashboard">
      <section className="flex flex-wrap items-end justify-between gap-6 pb-6">
        <div className="max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">
            运营工作台 · 临江小馆
          </p>
          <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-[-0.03em] text-ink sm:text-[38px]">
            把报价单，变成今天的
            <span className="text-brand">成本行动清单。</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-soft">
            不再只看“涨了几毛”。系统会把供应商报价拆成标准食材，
            计算每道菜的成本变化，再按预计周影响告诉先处理什么。
          </p>
        </div>

        <Link
          href="/quotes/new"
          className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-strong"
        >
          导入供应商报价
          <span aria-hidden="true">→</span>
        </Link>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(20,35,28,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">
                一次处理，四步闭环
              </h2>
              <p className="mt-1 text-xs text-muted">
                从原始报价到处置建议，每一步都留下记录。
              </p>
            </div>
            <span className="rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-medium text-brand-strong">
              约 2 分钟
            </span>
          </div>

          <div className="grid sm:grid-cols-2">
            {workflow.map((item, index) => (
              <div
                key={item.step}
                className={`relative p-5 sm:p-6 ${
                  index < 2 ? "border-b border-line" : ""
                } ${index % 2 === 0 ? "sm:border-r" : ""}`}
              >
                <span className="text-[11px] font-semibold tabular text-brand">
                  {item.step}
                </span>
                <h3 className="mt-3 text-base font-semibold tracking-tight text-ink">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted">{item.detail}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-canvas/60 px-5 py-4 sm:px-6">
            <p className="text-xs leading-5 text-muted">
              样本数据中的土豆会停在“包装待确认”，这是正常的核对流程。
            </p>
            <Link
              href="/quotes/new"
              className="text-xs font-semibold text-brand hover:text-brand-strong"
            >
              从样例开始 →
            </Link>
          </div>
        </section>

        <aside className="flex flex-col justify-between rounded-2xl bg-brand-strong p-5 text-white shadow-sm sm:p-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">
              这套系统的边界
            </p>
            <h2 className="mt-3 text-lg font-semibold leading-7 tracking-tight">
              不猜数据，
              <br />
              只把不确定项交给人。
            </h2>

            <ul className="mt-6 space-y-4 text-sm text-white/80">
              <li className="flex gap-3">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-white/60" />
                <span>包装缺失就暂停确认，不默认“一箱 10kg”。</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-white/60" />
                <span>缺少周销量就显示为空，不编造损失金额。</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-white/60" />
                <span>改价写入历史，旧价格和审计记录都能回看。</span>
              </li>
            </ul>
          </div>

          <div className="mt-8 border-t border-white/15 pt-4 text-[11px] leading-5 text-white/55">
            计算口径：核心食材成本。
            <br />
            不含房租、人工、水电、平台抽佣和税费。
          </div>
        </aside>
      </div>

      <section className="mt-5 grid gap-4 md:grid-cols-3">
        {capabilities.map((item) => (
          <article
            key={item.label}
            className="rounded-2xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(20,35,28,0.03)]"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              {item.label}
            </p>
            <h2 className="mt-3 text-sm font-semibold tracking-tight text-ink">
              {item.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">{item.detail}</p>
          </article>
        ))}
      </section>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-[11px] text-muted">
        <p>本地样本数据：临江小馆 · 3 家供应商 · 15 道菜 · 38 种食材</p>
        <p>所有金额均为本地样本数据，不包含真实经营信息。</p>
      </div>
    </AppShell>
  );
}
