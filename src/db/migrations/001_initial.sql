-- 菜价雷达：核心数据模型
-- 迁移文件只追加，不修改已经应用过的版本。
-- 时间统一保存为 UTC ISO 字符串；金额为整数微元；比率为整数基点（1% = 100 bps）。

CREATE TABLE restaurants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  currency TEXT NOT NULL DEFAULT 'CNY'
    CHECK (length(currency) = 3 AND currency = upper(currency)),
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai'
    CHECK (length(trim(timezone)) > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  normalized_name TEXT NOT NULL CHECK (length(trim(normalized_name)) > 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE UNIQUE INDEX ux_suppliers_restaurant_normalized
  ON suppliers (restaurant_id, normalized_name);

CREATE TABLE ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  normalized_name TEXT NOT NULL CHECK (length(trim(normalized_name)) > 0),
  base_unit TEXT NOT NULL CHECK (base_unit IN ('g', 'ml', '个')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE UNIQUE INDEX ux_ingredients_restaurant_normalized
  ON ingredients (restaurant_id, normalized_name);

CREATE TABLE ingredient_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE CASCADE,
  alias TEXT NOT NULL CHECK (length(trim(alias)) > 0),
  normalized_alias TEXT NOT NULL CHECK (length(trim(normalized_alias)) > 0),
  source TEXT NOT NULL CHECK (source IN ('seed', 'user_confirmed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE UNIQUE INDEX ux_aliases_global
  ON ingredient_aliases (restaurant_id, normalized_alias)
  WHERE supplier_id IS NULL;

CREATE UNIQUE INDEX ux_aliases_supplier
  ON ingredient_aliases (restaurant_id, supplier_id, normalized_alias)
  WHERE supplier_id IS NOT NULL;

CREATE INDEX ix_aliases_ingredient
  ON ingredient_aliases (ingredient_id);

CREATE TABLE unit_conversions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  ingredient_id INTEGER REFERENCES ingredients(id) ON DELETE CASCADE,
  from_unit TEXT NOT NULL CHECK (length(trim(from_unit)) > 0),
  to_unit TEXT NOT NULL CHECK (length(trim(to_unit)) > 0),
  factor INTEGER NOT NULL CHECK (factor > 0),
  source TEXT NOT NULL CHECK (source IN ('system', 'user_confirmed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (from_unit <> to_unit)
) STRICT;

-- 全局换算，例如 1 kg = 1000 g；ingredient_id 为空。
CREATE UNIQUE INDEX ux_unit_conversions_global
  ON unit_conversions (restaurant_id, from_unit, to_unit)
  WHERE ingredient_id IS NULL;

-- 食材专属换算，例如 1 箱土豆 = 20000 g；ingredient_id 不为空。
CREATE UNIQUE INDEX ux_unit_conversions_ingredient
  ON unit_conversions (restaurant_id, ingredient_id, from_unit, to_unit)
  WHERE ingredient_id IS NOT NULL;

CREATE INDEX ix_unit_conversions_ingredient
  ON unit_conversions (ingredient_id);

CREATE TABLE quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name_raw TEXT CHECK (
    supplier_name_raw IS NULL OR length(trim(supplier_name_raw)) > 0
  ),
  quote_date TEXT CHECK (
    quote_date IS NULL OR quote_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  currency TEXT NOT NULL DEFAULT 'CNY'
    CHECK (length(currency) = 3 AND currency = upper(currency)),
  source_type TEXT NOT NULL CHECK (source_type IN ('text', 'image', 'pdf')),
  source_file_path TEXT,
  source_text TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'extracting', 'extracted', 'needs_confirmation', 'ready', 'applied', 'failed')
  ),
  notes TEXT,
  applied_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    (source_type = 'text' AND source_text IS NOT NULL)
    OR (source_type IN ('image', 'pdf') AND source_file_path IS NOT NULL)
  )
) STRICT;

CREATE INDEX ix_quotes_restaurant_date
  ON quotes (restaurant_id, quote_date);

CREATE INDEX ix_quotes_supplier
  ON quotes (supplier_id);

CREATE TABLE quote_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL CHECK (line_no > 0),
  item_name_raw TEXT NOT NULL CHECK (length(trim(item_name_raw)) > 0),
  ingredient_id INTEGER REFERENCES ingredients(id) ON DELETE SET NULL,
  quantity_value TEXT,
  quantity_unit TEXT,
  package_spec_raw TEXT,
  package_quantity_value TEXT,
  package_unit TEXT,
  price_type TEXT CHECK (price_type IS NULL OR price_type IN ('total', 'unit')),
  price_value_micro_yuan INTEGER CHECK (
    price_value_micro_yuan IS NULL OR price_value_micro_yuan > 0
  ),
  price_unit TEXT,
  line_total_micro_yuan INTEGER CHECK (
    line_total_micro_yuan IS NULL OR line_total_micro_yuan > 0
  ),
  normalized_quantity_base INTEGER CHECK (
    normalized_quantity_base IS NULL OR normalized_quantity_base > 0
  ),
  base_unit TEXT CHECK (
    base_unit IS NULL OR base_unit IN ('g', 'ml', '个')
  ),
  normalized_unit_price_micro_yuan INTEGER CHECK (
    normalized_unit_price_micro_yuan IS NULL
    OR normalized_unit_price_micro_yuan > 0
  ),
  confidence REAL CHECK (
    confidence IS NULL OR (confidence >= 0 AND confidence <= 1)
  ),
  field_confidence_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(field_confidence_json)),
  evidence_text TEXT,
  evidence_page INTEGER CHECK (evidence_page IS NULL OR evidence_page > 0),
  evidence_bbox_json TEXT CHECK (
    evidence_bbox_json IS NULL OR json_valid(evidence_bbox_json)
  ),
  match_method TEXT CHECK (
    match_method IS NULL
    OR match_method IN (
      'exact_alias', 'exact_name', 'normalized_name', 'confirmed', 'ai_suggested', 'manual'
    )
  ),
  match_confidence REAL CHECK (
    match_confidence IS NULL OR (match_confidence >= 0 AND match_confidence <= 1)
  ),
  match_evidence TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'needs_confirmation', 'ready', 'applied', 'skipped', 'failed')
  ),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE UNIQUE INDEX ux_quote_items_quote_line
  ON quote_items (quote_id, line_no);

CREATE INDEX ix_quote_items_ingredient
  ON quote_items (ingredient_id);

CREATE INDEX ix_quote_items_status
  ON quote_items (status);

CREATE TABLE price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  quote_id INTEGER REFERENCES quotes(id) ON DELETE SET NULL,
  quote_item_id INTEGER REFERENCES quote_items(id) ON DELETE SET NULL,
  price_micro_yuan_per_base_unit INTEGER NOT NULL CHECK (
    price_micro_yuan_per_base_unit > 0
  ),
  effective_date TEXT NOT NULL CHECK (
    effective_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  source TEXT NOT NULL CHECK (source IN ('quote', 'manual')),
  note TEXT,
  recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

-- 一条报价行最多写入一条价格历史，防止重复改价。
CREATE UNIQUE INDEX ux_price_history_quote_item
  ON price_history (quote_item_id)
  WHERE quote_item_id IS NOT NULL;

CREATE INDEX ix_price_history_ingredient_effective
  ON price_history (ingredient_id, effective_date, id);

CREATE TABLE dishes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  normalized_name TEXT NOT NULL CHECK (length(trim(normalized_name)) > 0),
  selling_price_micro_yuan INTEGER CHECK (
    selling_price_micro_yuan IS NULL OR selling_price_micro_yuan > 0
  ),
  target_food_cost_rate_bps INTEGER CHECK (
    target_food_cost_rate_bps IS NULL
    OR (target_food_cost_rate_bps >= 1 AND target_food_cost_rate_bps <= 10000)
  ),
  weekly_sales INTEGER CHECK (weekly_sales IS NULL OR weekly_sales >= 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE UNIQUE INDEX ux_dishes_restaurant_normalized
  ON dishes (restaurant_id, normalized_name);

CREATE TABLE dish_ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dish_id INTEGER NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
  quantity_base INTEGER NOT NULL CHECK (quantity_base > 0),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE UNIQUE INDEX ux_dish_ingredients_dish_ingredient
  ON dish_ingredients (dish_id, ingredient_id);

CREATE INDEX ix_dish_ingredients_ingredient
  ON dish_ingredients (ingredient_id);

CREATE TABLE confirmations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  quote_item_id INTEGER REFERENCES quote_items(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (
    type IN (
      'low_confidence',
      'mapping_not_found',
      'mapping_ambiguous',
      'unit_unknown',
      'package_unknown',
      'price_basis_ambiguous',
      'abnormal_price',
      'missing_date',
      'missing_supplier',
      'backdated_quote',
      'new_ingredient_without_baseline',
      'manual_edit'
    )
  ),
  question TEXT NOT NULL CHECK (length(trim(question)) > 0),
  options_json TEXT CHECK (options_json IS NULL OR json_valid(options_json)),
  answer_json TEXT NOT NULL CHECK (json_valid(answer_json)),
  scope TEXT NOT NULL DEFAULT 'this_quote'
    CHECK (scope IN ('this_quote', 'remember')),
  confirmed_by TEXT NOT NULL DEFAULT '演示操作员'
    CHECK (length(trim(confirmed_by)) > 0),
  evidence_text TEXT,
  before_json TEXT CHECK (before_json IS NULL OR json_valid(before_json)),
  after_json TEXT CHECK (after_json IS NULL OR json_valid(after_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX ix_confirmations_quote
  ON confirmations (quote_id);

CREATE INDEX ix_confirmations_item
  ON confirmations (quote_item_id);

CREATE INDEX ix_confirmations_type
  ON confirmations (type);

CREATE TABLE analysis_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  rules_version TEXT NOT NULL CHECK (length(trim(rules_version)) > 0),
  thresholds_json TEXT NOT NULL CHECK (json_valid(thresholds_json)),
  summary_json TEXT CHECK (summary_json IS NULL OR json_valid(summary_json)),
  error_message TEXT,
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  completed_at TEXT
) STRICT;

CREATE INDEX ix_analysis_runs_quote
  ON analysis_runs (quote_id);

CREATE INDEX ix_analysis_runs_status
  ON analysis_runs (status);

CREATE TABLE analysis_dish_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  analysis_run_id INTEGER NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
  dish_id INTEGER NOT NULL REFERENCES dishes(id) ON DELETE RESTRICT,
  dish_name_snapshot TEXT NOT NULL CHECK (length(trim(dish_name_snapshot)) > 0),
  cost_before_micro_yuan INTEGER NOT NULL CHECK (cost_before_micro_yuan >= 0),
  cost_after_micro_yuan INTEGER NOT NULL CHECK (cost_after_micro_yuan >= 0),
  cost_delta_micro_yuan INTEGER NOT NULL,
  food_cost_rate_before_bps INTEGER CHECK (
    food_cost_rate_before_bps IS NULL OR food_cost_rate_before_bps >= 0
  ),
  food_cost_rate_after_bps INTEGER CHECK (
    food_cost_rate_after_bps IS NULL OR food_cost_rate_after_bps >= 0
  ),
  target_food_cost_rate_bps INTEGER CHECK (
    target_food_cost_rate_bps IS NULL
    OR (target_food_cost_rate_bps >= 1 AND target_food_cost_rate_bps <= 10000)
  ),
  weekly_sales INTEGER CHECK (weekly_sales IS NULL OR weekly_sales >= 0),
  weekly_impact_micro_yuan INTEGER,
  risk_level TEXT NOT NULL CHECK (
    risk_level IN ('critical', 'warning', 'watch', 'normal', 'insufficient_data')
  ),
  ranking_group TEXT CHECK (
    ranking_group IS NULL OR ranking_group IN ('weekly', 'per_serving')
  ),
  rank_position INTEGER CHECK (rank_position IS NULL OR rank_position > 0),
  calculation_json TEXT NOT NULL CHECK (json_valid(calculation_json)),
  data_quality_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(data_quality_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE UNIQUE INDEX ux_analysis_results_run_dish
  ON analysis_dish_results (analysis_run_id, dish_id);

CREATE INDEX ix_analysis_results_run_rank
  ON analysis_dish_results (analysis_run_id, rank_position);

CREATE INDEX ix_analysis_results_risk
  ON analysis_dish_results (risk_level);

CREATE TABLE audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE CASCADE,
  quote_id INTEGER REFERENCES quotes(id) ON DELETE SET NULL,
  analysis_run_id INTEGER REFERENCES analysis_runs(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL CHECK (length(trim(entity_type)) > 0),
  entity_id INTEGER,
  event_type TEXT NOT NULL CHECK (length(trim(event_type)) > 0),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'system', 'model')),
  actor_label TEXT,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX ix_audit_events_quote_time
  ON audit_events (quote_id, created_at);

CREATE INDEX ix_audit_events_entity
  ON audit_events (entity_type, entity_id);

CREATE INDEX ix_audit_events_analysis_run
  ON audit_events (analysis_run_id);
