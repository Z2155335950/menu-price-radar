import type { DatabaseSync } from "node:sqlite";

import type {
  AnalysisCalculation,
  AnalysisDishResultView,
  AnalysisRunView,
  AnalysisSummary,
} from "../domain/analysis";
import type { RankingGroup, RiskLevel } from "../domain/risk";
import { openDatabase } from "../db/client";

type QuoteReportRow = {
  id: number;
  supplier_name: string | null;
  supplier_name_raw: string | null;
  quote_date: string | null;
  status: string;
  source_type: "text" | "image" | "pdf";
  source_file_path: string | null;
  applied_at: string | null;
};

type AnalysisRunRow = {
  id: number;
  quote_id: number;
  status: "running" | "completed" | "failed";
  rules_version: string;
  summary_json: string | null;
  started_at: string;
  completed_at: string | null;
};

type AnalysisResultRow = {
  id: number;
  dish_id: number;
  dish_name_snapshot: string;
  cost_before_micro_yuan: number;
  cost_after_micro_yuan: number;
  cost_delta_micro_yuan: number;
  food_cost_rate_before_bps: number | null;
  food_cost_rate_after_bps: number | null;
  target_food_cost_rate_bps: number | null;
  weekly_sales: number | null;
  weekly_impact_micro_yuan: number | null;
  risk_level: RiskLevel;
  ranking_group: RankingGroup | null;
  rank_position: number | null;
  calculation_json: string;
  data_quality_json: string;
};

type TimelineRow = {
  id: number;
  event_type: string;
  actor_type: string;
  actor_label: string | null;
  payload_json: string;
  created_at: string;
};

export type QuoteTimelineEvent = {
  id: number;
  eventType: string;
  actorType: string;
  actorLabel: string | null;
  createdAt: string;
  payload: Record<string, unknown>;
};

export type QuoteReport = {
  quote: {
    id: number;
    supplierName: string;
    quoteDate: string | null;
    status: string;
    sourceType: "text" | "image" | "pdf";
    sourceUrl: string | null;
    appliedAt: string | null;
  };
  analysis: AnalysisRunView | null;
  timeline: QuoteTimelineEvent[];
};

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function getQuoteReport(
  database: DatabaseSync,
  quoteId: number,
): QuoteReport | null {
  const quote = database
    .prepare(
      `
        SELECT
          q.id, s.name AS supplier_name, q.supplier_name_raw,
          q.quote_date, q.status, q.source_type, q.source_file_path,
          q.applied_at
        FROM quotes q
        LEFT JOIN suppliers s ON s.id = q.supplier_id
        WHERE q.id = ?
        LIMIT 1
      `,
    )
    .get(quoteId) as QuoteReportRow | undefined;

  if (!quote) {
    return null;
  }

  const run = database
    .prepare(
      `
        SELECT
          id, quote_id, status, rules_version,
          summary_json, started_at, completed_at
        FROM analysis_runs
        WHERE quote_id = ? AND status = 'completed'
        ORDER BY id DESC
        LIMIT 1
      `,
    )
    .get(quoteId) as AnalysisRunRow | undefined;

  const timelineRows = database
    .prepare(
      `
        SELECT id, event_type, actor_type, actor_label, payload_json, created_at
        FROM audit_events
        WHERE quote_id = ?
        ORDER BY id ASC
      `,
    )
    .all(quoteId) as TimelineRow[];

  let analysis: AnalysisRunView | null = null;

  if (run) {
    const resultRows = database
      .prepare(
        `
          SELECT
            id, dish_id, dish_name_snapshot,
            cost_before_micro_yuan, cost_after_micro_yuan,
            cost_delta_micro_yuan, food_cost_rate_before_bps,
            food_cost_rate_after_bps, target_food_cost_rate_bps,
            weekly_sales, weekly_impact_micro_yuan,
            risk_level, ranking_group, rank_position,
            calculation_json, data_quality_json
          FROM analysis_dish_results
          WHERE analysis_run_id = ?
          ORDER BY rank_position, id
        `,
      )
      .all(run.id) as AnalysisResultRow[];

    const results: AnalysisDishResultView[] = resultRows.map((row) => ({
      id: row.id,
      dishId: row.dish_id,
      dishName: row.dish_name_snapshot,
      costBeforeMicroYuan: row.cost_before_micro_yuan,
      costAfterMicroYuan: row.cost_after_micro_yuan,
      costDeltaMicroYuan: row.cost_delta_micro_yuan,
      foodCostRateBeforeBps: row.food_cost_rate_before_bps,
      foodCostRateAfterBps: row.food_cost_rate_after_bps,
      targetFoodCostRateBps: row.target_food_cost_rate_bps,
      weeklySales: row.weekly_sales,
      weeklyImpactMicroYuan: row.weekly_impact_micro_yuan,
      riskLevel: row.risk_level,
      rankingGroup: row.ranking_group,
      rankPosition: row.rank_position,
      calculation: parseJson<AnalysisCalculation>(
        row.calculation_json,
        {} as AnalysisCalculation,
      ),
      dataQuality: parseJson<string[]>(row.data_quality_json, []),
    }));

    analysis = {
      id: run.id,
      quoteId: run.quote_id,
      status: run.status,
      rulesVersion: run.rules_version,
      summary: parseJson<AnalysisSummary | null>(run.summary_json, null),
      startedAt: run.started_at,
      completedAt: run.completed_at,
      results,
    };
  }

  return {
    quote: {
      id: quote.id,
      supplierName: quote.supplier_name ?? quote.supplier_name_raw ?? "未知供应商",
      quoteDate: quote.quote_date,
      status: quote.status,
      sourceType: quote.source_type,
      sourceUrl:
        quote.source_type === "text" || !quote.source_file_path
          ? null
          : `/api/quotes/${quote.id}/source`,
      appliedAt: quote.applied_at,
    },
    analysis,
    timeline: timelineRows.map((row) => ({
      id: row.id,
      eventType: row.event_type,
      actorType: row.actor_type,
      actorLabel: row.actor_label,
      createdAt: row.created_at,
      payload: parseJson<Record<string, unknown>>(row.payload_json, {}),
    })),
  };
}

export function loadQuoteReport(quoteId: number): QuoteReport | null {
  const database = openDatabase();

  try {
    return getQuoteReport(database, quoteId);
  } finally {
    database.close();
  }
}
