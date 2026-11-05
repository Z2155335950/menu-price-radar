export const BASE_UNITS = ["g", "ml", "个"] as const;
export type BaseUnit = (typeof BASE_UNITS)[number];

export const QUOTE_STATUSES = [
  "draft",
  "extracting",
  "extracted",
  "needs_confirmation",
  "ready",
  "applied",
  "failed",
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_ITEM_STATUSES = [
  "draft",
  "needs_confirmation",
  "ready",
  "applied",
  "skipped",
  "failed",
] as const;
export type QuoteItemStatus = (typeof QUOTE_ITEM_STATUSES)[number];

export const MATCH_METHODS = [
  "exact_alias",
  "exact_name",
  "normalized_name",
  "confirmed",
  "ai_suggested",
  "manual",
] as const;
export type MatchMethod = (typeof MATCH_METHODS)[number];

export const CONFIRMATION_TYPES = [
  "low_confidence",
  "mapping_not_found",
  "mapping_ambiguous",
  "unit_unknown",
  "package_unknown",
  "price_basis_ambiguous",
  "abnormal_price",
  "missing_date",
  "missing_supplier",
  "backdated_quote",
  "new_ingredient_without_baseline",
  "manual_edit",
] as const;
export type ConfirmationType = (typeof CONFIRMATION_TYPES)[number];

export const RISK_LEVELS = [
  "critical",
  "warning",
  "watch",
  "normal",
  "insufficient_data",
] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const RANKING_GROUPS = ["weekly", "per_serving"] as const;
export type RankingGroup = (typeof RANKING_GROUPS)[number];

export const ACTOR_TYPES = ["user", "system", "model"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

/** 金额单位：1 元 = 1,000,000 微元。 */
export type MoneyMicroYuan = number;

/** 比率单位：1% = 100 基点（bps），例如 35% = 3500。 */
export type BasisPoints = number;
