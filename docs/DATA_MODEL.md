# 菜价雷达 — DATA_MODEL

| 项目 | 内容 |
|---|---|
| 文档版本 | v0.1 |
| 最后更新 | 2026-11-05 |
| 当前阶段 | 第六阶段完成，第七阶段未开始 |
| 数据库 | SQLite，本地文件 `data/app.db` |
| Schema 版本 | `001` |
| 迁移文件 | `src/db/migrations/001_initial.sql` |
| 数据库驱动 | Node 24 内置 `node:sqlite` |
| 表数量 | 15（14 张业务/审计表 + 1 张迁移记录表） |

> 这份文档解释每张表、每个字段和表之间的关系。
> 修改表结构时，必须新增迁移文件并同步本文，不能直接修改已经应用的 `001_initial.sql`。

---

## 1. 设计原则

### 1.1 金额单位

所有金额使用**整数微元**：

```text
1 元 = 1,000,000 微元
```

例子：

```text
22.00 元 = 22,000,000 微元
```

原因：食材单价可能小到 `0.000001 元/g`，用浮点数会产生累计误差。

### 1.2 比率单位

食材成本率、目标成本率使用**整数基点（bps）**：

```text
1% = 100 bps
35% = 3,500 bps
42.31% = 4,231 bps
```

页面展示时再转成百分比。

### 1.3 数量单位

数量使用**整数基础单位**：

- `g`：克；
- `ml`：毫升；
- `个`：计数单位。

每种标准食材在 `ingredients.base_unit` 中固定一个基础单位。菜谱用量也使用该基础单位。

### 1.4 时间

- 时间戳保存为 UTC ISO 字符串，例如 `2026-11-05T05:15:52.808Z`；
- 报价日期、价格生效日期保存为 `YYYY-MM-DD`；
- 页面按 `Asia/Shanghai` 展示。

### 1.5 数据库约束

- 所有业务表使用 SQLite `STRICT` 模式；
- 每个连接都执行 `PRAGMA foreign_keys = ON`；
- 金额、数量、价格有 `CHECK` 约束；
- 枚举字段有 `CHECK` 约束；
- JSON 字段使用 `json_valid` 校验；
- 迁移文件和“记录版本”在同一个事务中提交。

### 1.6 不保存可以推导的数据

- `ingredients` 不保存“当前价格”，当前价格从 `price_history` 取最新记录；
- `dishes` 不保存“当前食材成本”，成本由菜谱用量和价格历史计算；
- 分析结果是例外：为了审计，计算快照会保存当时的输入和输出。

---

## 2. 表关系总览

```text
restaurants
  ├── suppliers
  ├── ingredients
  │     ├── ingredient_aliases ── suppliers
  │     ├── unit_conversions
  │     ├── price_history ── quotes / quote_items / suppliers
  │     └── dish_ingredients
  ├── quotes
  │     ├── quote_items
  │     │     ├── confirmations
  │     │     └── price_history
  │     └── analysis_runs
  │           └── analysis_dish_results ── dishes
  ├── dishes
  │     └── dish_ingredients
  └── audit_events

schema_migrations（迁移记录，独立）
```

一句话理解：

- **餐厅**是数据边界；
- **供应商**提供**报价**；
- **报价**由**报价行**组成；
- **报价行**匹配到**标准食材**，并产生**价格历史**；
- **菜品**通过**菜谱用量**使用标准食材；
- **分析运行**保存一次计算，**分析菜品结果**保存每道菜的快照；
- **确认记录**和**审计事件**保存人、模型和系统的动作。

---

## 3. schema_migrations

迁移记录表，由迁移运行器创建，不属于业务数据。

| 字段 | 类型 | 可空 | 含义 |
|---|---|---|---|
| `version` | TEXT | 否 | 迁移编号，主键，例如 `001` |
| `name` | TEXT | 否 | 迁移文件名，例如 `001_initial.sql` |
| `applied_at` | TEXT | 否 | 应用时间，UTC ISO 字符串 |

规则：

- 一个版本只应用一次；
- 已应用的迁移文件不能修改；
- 新的结构变化使用 `002_...sql`、`003_...sql`。

---

## 4. restaurants（餐厅）

MVP 只有一家餐厅，但保留表结构，避免以后所有数据都假设“只有一家”。

| 字段 | 类型 | 可空 | 含义 |
|---|---|---|---|
| `id` | INTEGER | 否 | 主键，自增 |
| `name` | TEXT | 否 | 餐厅名称，不能为空 |
| `currency` | TEXT | 否 | 币种，默认 `CNY`，必须是 3 位大写字母 |
| `timezone` | TEXT | 否 | 时区，默认 `Asia/Shanghai` |
| `created_at` | TEXT | 否 | 创建时间 |
| `updated_at` | TEXT | 否 | 最后更新时间 |

说明：

- 不建“门店”表；
- 不建“用户”或“角色”表；
- 演示餐厅名称使用虚构数据。

---

## 5. suppliers（供应商）

| 字段 | 类型 | 可空 | 含义 |
|---|---|---|---|
| `id` | INTEGER | 否 | 主键，自增 |
| `restaurant_id` | INTEGER | 否 | 所属餐厅，外键 → `restaurants.id` |
| `name` | TEXT | 否 | 供应商显示名称 |
| `normalized_name` | TEXT | 否 | 标准化名称，用于去重和匹配 |
| `is_active` | INTEGER | 否 | 是否启用，`0` 或 `1` |
| `created_at` | TEXT | 否 | 创建时间 |
| `updated_at` | TEXT | 否 | 最后更新时间 |

约束：

- `(restaurant_id, normalized_name)` 唯一；
- 删除餐厅会级联删除供应商；
- 供应商通常不物理删除，使用 `is_active = 0`。

---

## 6. ingredients（标准食材）

| 字段 | 类型 | 可空 | 含义 |
|---|---|---|---|
| `id` | INTEGER | 否 | 主键，自增 |
| `restaurant_id` | INTEGER | 否 | 所属餐厅，外键 → `restaurants.id` |
| `name` | TEXT | 否 | 标准食材名称，例如“去骨鸡腿” |
| `normalized_name` | TEXT | 否 | 标准化名称，用于去重和匹配 |
| `base_unit` | TEXT | 否 | 基础单位，只允许 `g`、`ml`、`个` |
| `is_active` | INTEGER | 否 | 是否启用，`0` 或 `1` |
| `created_at` | TEXT | 否 | 创建时间 |
| `updated_at` | TEXT | 否 | 最后更新时间 |

约束：

- `(restaurant_id, normalized_name)` 唯一；
- `base_unit` 只能取三个值；
- 删除餐厅会级联删除食材；
- 不使用“当前价格”字段，当前价格从 `price_history` 读取。

---

## 7. ingredient_aliases（食材别名）

供应商可能把“去骨鸡腿”写成“鸡腿”“鸡腿肉”“去骨腿肉”。别名表保存这种映射。

| 字段 | 类型 | 可空 | 含义 |
|---|---|---|---|
| `id` | INTEGER | 否 | 主键，自增 |
| `restaurant_id` | INTEGER | 否 | 所属餐厅，外键 → `restaurants.id` |
| `ingredient_id` | INTEGER | 否 | 映射到的标准食材，外键 → `ingredients.id` |
| `supplier_id` | INTEGER | 是 | 供应商专属别名；为空表示全局别名 |
| `alias` | TEXT | 否 | 原始别名，例如“鸡腿” |
| `normalized_alias` | TEXT | 否 | 标准化别名，用于精确匹配 |
| `source` | TEXT | 否 | 来源：`seed` 或 `user_confirmed` |
| `created_at` | TEXT | 否 | 创建时间 |

唯一性：

- 全局别名：同一餐厅内一个 `normalized_alias` 只能对应一个食材；
- 供应商别名：同一餐厅、同一供应商内一个 `normalized_alias` 只能对应一个食材；
- 使用两个部分唯一索引实现，因为 SQLite 中 `NULL` 不参与普通唯一约束。

设计边界：

- 别名可以记住；
- 记住时必须来自用户确认；
- AI 候选不能直接写入别名表。

---

## 8. unit_conversions（单位换算）

保存全局固定换算和食材专属包装换算。

| 字段 | 类型 | 可空 | 含义 |
|---|---|---|---|
| `id` | INTEGER | 否 | 主键，自增 |
| `restaurant_id` | INTEGER | 否 | 所属餐厅，外键 → `restaurants.id` |
| `ingredient_id` | INTEGER | 是 | 食材专属换算；为空表示全局换算 |
| `from_unit` | TEXT | 否 | 原单位，例如 `kg`、`斤`、`箱` |
| `to_unit` | TEXT | 否 | 目标单位，例如 `g`、`ml` |
| `factor` | INTEGER | 否 | 1 个原单位等于多少个目标单位 |
| `source` | TEXT | 否 | `system` 或 `user_confirmed` |
| `created_at` | TEXT | 否 | 创建时间 |

例子：

| from_unit | to_unit | factor | 含义 |
|---|---|---:|---|
| `kg` | `g` | 1000 | 1 kg = 1000 g |
| `斤` | `g` | 500 | 1 斤 = 500 g |
| `L` | `ml` | 1000 | 1 L = 1000 ml |
| `箱` | `g` | 20000 | 1 箱土豆 = 20000 g（食材专属） |

约束：

- `factor > 0`；
- `from_unit <> to_unit`；
- 全局换算在同一餐厅内唯一；
- 食材专属换算在同一餐厅、食材、单位对内唯一；
- 删除食材会级联删除它的专属换算。

禁止：

- 没有明确换算时，不把 kg 猜成 L；
- 没有明确重量时，不把“1 箱”猜成 10kg；
- 不做隐式密度换算。

---

## 9. quotes（报价）

一次报价处理对应一条主记录。

| 字段 | 类型 | 可空 | 含义 |
|---|---|---|---|
| `id` | INTEGER | 否 | 主键，自增 |
| `restaurant_id` | INTEGER | 否 | 所属餐厅，外键 → `restaurants.id` |
| `supplier_id` | INTEGER | 是 | 匹配到的供应商，外键 → `suppliers.id` |
| `supplier_name_raw` | TEXT | 是 | 报价单上的原始供应商名 |
| `quote_date` | TEXT | 是 | 报价日期，`YYYY-MM-DD` |
| `currency` | TEXT | 否 | 币种，默认 `CNY` |
| `source_type` | TEXT | 否 | 输入类型：`text`、`image`、`pdf` |
| `source_file_path` | TEXT | 是 | 上传原件相对路径 |
| `source_text` | TEXT | 是 | 粘贴或 OCR 得到的原文 |
| `status` | TEXT | 否 | 处理状态 |
| `notes` | TEXT | 是 | 备注 |
| `applied_at` | TEXT | 是 | 价格正式写入的时间 |
| `created_at` | TEXT | 否 | 创建时间 |
| `updated_at` | TEXT | 否 | 最后更新时间 |

状态：

| 值 | 含义 |
|---|---|
| `draft` | 刚创建，尚未提取或提取中 |
| `extracting` | 正在提取 |
| `extracted` | 已提取，尚未完成匹配和确认 |
| `needs_confirmation` | 存在阻塞性待确认项 |
| `ready` | 可以改价和分析 |
| `applied` | 价格已写入 |
| `failed` | 处理失败 |

约束：

- `source_type = text` 时 `source_text` 必须存在；
- `source_type` 为 `image` 或 `pdf` 时 `source_file_path` 必须存在；
- 删除餐厅会级联删除报价；
- 删除供应商会把 `supplier_id` 置空，但保留原始供应商名和报价。

设计说明：

- `supplier_id` 允许为空，因为提取阶段可能还没匹配到供应商；
- `quote_date` 允许为空，但应用层在改价前必须要求确认；
- 不保存“报价总额”，因为它可能由报价行汇总得到，且可能不完整；需要展示时实时汇总。

---

## 10. quote_items（报价行）

一条报价行是一条供应商报价明细。

| 字段 | 类型 | 可空 | 含义 |
|---|---|---|---|
| `id` | INTEGER | 否 | 主键，自增 |
| `quote_id` | INTEGER | 否 | 所属报价，外键 → `quotes.id` |
| `line_no` | INTEGER | 否 | 行号，从 1 开始 |
| `item_name_raw` | TEXT | 否 | 报价单上的原始食材名 |
| `ingredient_id` | INTEGER | 是 | 匹配到的标准食材，外键 → `ingredients.id` |
| `quantity_value` | TEXT | 是 | 原始报价数量，保留整数或小数字符串 |
| `quantity_unit` | TEXT | 是 | 原始数量单位，例如 `袋`、`kg` |
| `package_spec_raw` | TEXT | 是 | 原始包装描述，例如 `5kg/袋` |
| `package_quantity_value` | TEXT | 是 | 每包装数量，例如 `5` |
| `package_unit` | TEXT | 是 | 每包装单位，例如 `kg` |
| `price_type` | TEXT | 是 | `total`（行总价）或 `unit`（单价） |
| `price_value_micro_yuan` | INTEGER | 是 | 原始报价金额，微元 |
| `price_unit` | TEXT | 是 | 金额对应单位，例如 `元/袋`、`元/kg` |
| `line_total_micro_yuan` | INTEGER | 是 | 行总金额，微元 |
| `normalized_quantity_base` | INTEGER | 是 | 换算后的基础数量 |
| `base_unit` | TEXT | 是 | 基础单位，`g`、`ml`、`个` |
| `normalized_unit_price_micro_yuan` | INTEGER | 是 | 归一化后的每基础单位价格 |
| `confidence` | REAL | 是 | 整行置信度，0 到 1 |
| `field_confidence_json` | TEXT | 否 | 每个字段的置信度 JSON |
| `evidence_text` | TEXT | 是 | 原文证据片段 |
| `evidence_page` | INTEGER | 是 | 图片/PDF 页码 |
| `evidence_bbox_json` | TEXT | 是 | 证据区域坐标 JSON |
| `match_method` | TEXT | 是 | 匹配方式 |
| `match_confidence` | REAL | 是 | 匹配置信度，0 到 1 |
| `match_evidence` | TEXT | 是 | 匹配依据 |
| `status` | TEXT | 否 | 报价行状态 |
| `notes` | TEXT | 是 | 备注 |
| `created_at` | TEXT | 否 | 创建时间 |
| `updated_at` | TEXT | 否 | 最后更新时间 |

匹配方式：

| 值 | 含义 |
|---|---|
| `exact_alias` | 已确认别名精确匹配 |
| `exact_name` | 标准名称精确匹配 |
| `normalized_name` | 标准化名称精确匹配 |
| `confirmed` | 用户在本次确认后采用 |
| `ai_suggested` | AI 候选建议，尚未被规则或用户确认 |
| `manual` | 用户手动选择 |

报价行状态：

| 值 | 含义 |
|---|---|
| `draft` | 草稿 |
| `needs_confirmation` | 有阻塞性待确认项 |
| `ready` | 可以改价 |
| `applied` | 已写入价格历史 |
| `skipped` | 本次跳过 |
| `failed` | 处理失败 |

约束：

- `(quote_id, line_no)` 唯一；
- `price_value_micro_yuan`、`line_total_micro_yuan`、`normalized_quantity_base`、`normalized_unit_price_micro_yuan` 如果存在必须大于 0；
- `confidence`、`match_confidence` 必须在 0 到 1 之间；
- `field_confidence_json` 必须是合法 JSON；
- `JSON` 证据坐标必须是合法 JSON；
- 删除报价会级联删除报价行；
- 删除食材会把 `ingredient_id` 置空，保留原始报价行作为审计记录。

为什么同时保留原始值和归一化值：

- 原始值用于审计和用户核对；
- 归一化值用于确定性计算；
- 两者不能互相替代。

---

## 11. price_history（价格历史）

价格历史是食材价格变化的账本，只追加，不覆盖旧价格。

| 字段 | 类型 | 可空 | 含义 |
|---|---|---|---|
| `id` | INTEGER | 否 | 主键，自增 |
| `ingredient_id` | INTEGER | 否 | 标准食材，外键 → `ingredients.id` |
| `supplier_id` | INTEGER | 是 | 来源供应商，外键 → `suppliers.id` |
| `quote_id` | INTEGER | 是 | 来源报价，外键 → `quotes.id` |
| `quote_item_id` | INTEGER | 是 | 来源报价行，外键 → `quote_items.id` |
| `price_micro_yuan_per_base_unit` | INTEGER | 否 | 每基础单位价格，微元 |
| `effective_date` | TEXT | 否 | 生效日期，`YYYY-MM-DD` |
| `source` | TEXT | 否 | `quote`（报价写入）或 `manual`（人工录入） |
| `note` | TEXT | 是 | 备注 |
| `recorded_at` | TEXT | 否 | 记录时间 |

约束：

- `price_micro_yuan_per_base_unit > 0`；
- `effective_date` 必须是 `YYYY-MM-DD`；
- 一条报价行最多产生一条价格历史；
- 删除食材会级联删除价格历史；
- 删除报价或报价行会把来源字段置空，但价格历史保留。

当前价格如何得到：

```text
按 effective_date 升序、id 升序排序，取最后一条。
```

为什么不在 `ingredients` 里存当前价格：

- 会与价格历史重复；
- 修改时容易出现两份数据不一致；
- 历史价格必须永远保留。

---

## 12. dishes（菜品）

| 字段 | 类型 | 可空 | 含义 |
|---|---|---|---|
| `id` | INTEGER | 否 | 主键，自增 |
| `restaurant_id` | INTEGER | 否 | 所属餐厅，外键 → `restaurants.id` |
| `name` | TEXT | 否 | 菜品名称，例如“宫保鸡丁” |
| `normalized_name` | TEXT | 否 | 标准化名称，用于去重 |
| `selling_price_micro_yuan` | INTEGER | 是 | 当前售价，微元；缺失表示待补充 |
| `target_food_cost_rate_bps` | INTEGER | 是 | 目标食材成本率，基点；缺失表示未设置 |
| `weekly_sales` | INTEGER | 是 | 周销量；缺失表示未知 |
| `is_active` | INTEGER | 否 | 是否在售，`0` 或 `1` |
| `created_at` | TEXT | 否 | 创建时间 |
| `updated_at` | TEXT | 否 | 最后更新时间 |

约束：

- `(restaurant_id, normalized_name)` 唯一；
- 售价如果存在必须大于 0；
- 目标成本率如果存在必须在 1 到 10000 bps 之间；
- 周销量如果存在必须大于等于 0；
- 删除餐厅会级联删除菜品。

为什么售价和目标成本率允许为空：

- 真实数据可能还没补齐；
- 系统必须能显示“无法计算”，而不是补一个默认值；
- 页面和计算引擎在缺数据时给出明确提示。

---

## 13. dish_ingredients（菜谱用量）

保存每道菜当前使用的标准食材和单份用量。

| 字段 | 类型 | 可空 | 含义 |
|---|---|---|---|
| `id` | INTEGER | 否 | 主键，自增 |
| `dish_id` | INTEGER | 否 | 菜品，外键 → `dishes.id` |
| `ingredient_id` | INTEGER | 否 | 标准食材，外键 → `ingredients.id` |
| `quantity_base` | INTEGER | 否 | 单份用量，基础单位 |
| `sort_order` | INTEGER | 否 | 展示顺序 |
| `note` | TEXT | 是 | 备注 |
| `created_at` | TEXT | 否 | 创建时间 |
| `updated_at` | TEXT | 否 | 最后更新时间 |

约束：

- `(dish_id, ingredient_id)` 唯一；
- `quantity_base > 0`；
- `sort_order >= 0`；
- 删除菜品会级联删除菜谱用量；
- 删除仍被菜谱使用的食材会被拒绝，防止悄悄破坏菜谱。

设计边界：

- 不保存单位字段，单位由 `ingredients.base_unit` 决定；
- 不做净料率、损耗率、出成率；
- 不做菜谱版本树，只有“当前菜谱”；
- 同一道菜同一食材只允许一行，多次使用请合计。

---

## 14. confirmations（用户确认记录）

保存用户对不确定项的确认，既能阻塞流程，也能作为审计证据。

| 字段 | 类型 | 可空 | 含义 |
|---|---|---|---|
| `id` | INTEGER | 否 | 主键，自增 |
| `quote_id` | INTEGER | 否 | 所属报价，外键 → `quotes.id` |
| `quote_item_id` | INTEGER | 是 | 所属报价行；报价级问题可为空 |
| `type` | TEXT | 否 | 确认类型 |
| `question` | TEXT | 否 | 系统问用户的问题 |
| `options_json` | TEXT | 是 | 提供给用户的选项 JSON |
| `answer_json` | TEXT | 否 | 用户最终选择 JSON |
| `scope` | TEXT | 否 | `this_quote` 或 `remember` |
| `confirmed_by` | TEXT | 否 | 操作员标识，默认“演示操作员” |
| `evidence_text` | TEXT | 是 | 触发确认的证据 |
| `before_json` | TEXT | 是 | 修改前的值 JSON |
| `after_json` | TEXT | 是 | 修改后的值 JSON |
| `created_at` | TEXT | 否 | 确认时间 |

确认类型：

| 值 | 含义 |
|---|---|
| `low_confidence` | 关键字段置信度低 |
| `mapping_not_found` | 没有匹配到标准食材 |
| `mapping_ambiguous` | 匹配到多个标准食材 |
| `unit_unknown` | 单位无法换算 |
| `package_unknown` | 包装规格缺失 |
| `price_basis_ambiguous` | 总价/单价口径不明确 |
| `abnormal_price` | 价格变化异常 |
| `missing_date` | 缺少报价日期 |
| `missing_supplier` | 缺少供应商 |
| `backdated_quote` | 报价早于当前最新价格 |
| `new_ingredient_without_baseline` | 新食材没有历史价格 |
| `manual_edit` | 用户手动修改字段 |

约束：

- `quote_id` 必填；
- `answer_json` 必须是合法 JSON；
- `scope = remember` 只应用于可记住的别名和单位换算；
- 删除报价会级联删除确认记录；
- 删除报价行会级联删除该行关联的确认记录；报价级确认不受影响。

---

## 15. analysis_runs（分析运行）

每次“重新分析”都会产生一条新的运行记录，保留当时的规则版本和阈值。

| 字段 | 类型 | 可空 | 含义 |
|---|---|---|---|
| `id` | INTEGER | 否 | 主键，自增 |
| `restaurant_id` | INTEGER | 否 | 所属餐厅，外键 → `restaurants.id` |
| `quote_id` | INTEGER | 否 | 本次分析关联的报价，外键 → `quotes.id` |
| `status` | TEXT | 否 | `running`、`completed`、`failed` |
| `rules_version` | TEXT | 否 | 计算规则版本，例如 `v0.1` |
| `thresholds_json` | TEXT | 否 | 本次使用的风险阈值 JSON |
| `summary_json` | TEXT | 是 | 汇总信息 JSON |
| `error_message` | TEXT | 是 | 失败原因 |
| `started_at` | TEXT | 否 | 开始时间 |
| `completed_at` | TEXT | 是 | 完成时间 |

约束：

- `rules_version` 不能为空；
- `thresholds_json` 必须是合法 JSON；
- `summary_json` 如果存在必须是合法 JSON；
- 删除报价会级联删除分析运行。

为什么保存阈值：

- 以后调整阈值时，旧分析仍然能解释“当时为什么这样排序”；
- 不能拿新阈值重算旧结果却不留痕迹。

---

## 16. analysis_dish_results（分析菜品结果）

保存一次分析中每道菜的计算快照。

| 字段 | 类型 | 可空 | 含义 |
|---|---|---|---|
| `id` | INTEGER | 否 | 主键，自增 |
| `analysis_run_id` | INTEGER | 否 | 所属分析运行，外键 → `analysis_runs.id` |
| `dish_id` | INTEGER | 否 | 菜品，外键 → `dishes.id` |
| `dish_name_snapshot` | TEXT | 否 | 当时的菜名 |
| `cost_before_micro_yuan` | INTEGER | 否 | 涨价前单份食材成本 |
| `cost_after_micro_yuan` | INTEGER | 否 | 涨价后单份食材成本 |
| `cost_delta_micro_yuan` | INTEGER | 否 | 单份成本变化，可为负 |
| `food_cost_rate_before_bps` | INTEGER | 是 | 涨价前食材成本率 |
| `food_cost_rate_after_bps` | INTEGER | 是 | 涨价后食材成本率 |
| `target_food_cost_rate_bps` | INTEGER | 是 | 当时的目标食材成本率 |
| `weekly_sales` | INTEGER | 是 | 当时的周销量 |
| `weekly_impact_micro_yuan` | INTEGER | 是 | 预计周食材毛利影响；缺销量时为空 |
| `risk_level` | TEXT | 否 | 风险等级或数据不足 |
| `ranking_group` | TEXT | 是 | `weekly` 或 `per_serving` |
| `rank_position` | INTEGER | 是 | 本次分析中的排序位置 |
| `calculation_json` | TEXT | 否 | 完整计算输入和输出 JSON |
| `data_quality_json` | TEXT | 否 | 数据质量提示 JSON 数组 |
| `created_at` | TEXT | 否 | 创建时间 |

风险等级：

| 值 | 含义 |
|---|---|
| `critical` | 严重 |
| `warning` | 警告 |
| `watch` | 观察 |
| `normal` | 正常 |
| `insufficient_data` | 数据不足 |

排序分组：

| 值 | 含义 |
|---|---|
| `weekly` | 有周销量，按周食材毛利影响排序 |
| `per_serving` | 缺周销量，按单份成本变化排序 |

约束：

- `(analysis_run_id, dish_id)` 唯一；
- 成本不能为负；
- 成本率如果存在必须大于等于 0；
- 目标成本率如果存在必须在 1 到 10000 bps 之间；
- 周销量如果存在必须大于等于 0；
- `rank_position` 如果存在必须大于 0；
- `calculation_json` 和 `data_quality_json` 必须是合法 JSON；
- 删除分析运行会级联删除结果；
- 删除仍被分析引用的菜品会被拒绝，防止历史结果失去关联。

为什么保存快照：

- 菜品可能改名、改价、改菜谱；
- 旧分析必须能解释当时的计算；
- 这是刻意的冗余，不是重复数据错误。

---

## 17. audit_events（审计事件）

记录系统、用户和模型的关键动作。它不保存模型思维链。

| 字段 | 类型 | 可空 | 含义 |
|---|---|---|---|
| `id` | INTEGER | 否 | 主键，自增 |
| `restaurant_id` | INTEGER | 是 | 所属餐厅，外键 → `restaurants.id` |
| `quote_id` | INTEGER | 是 | 关联报价，外键 → `quotes.id` |
| `analysis_run_id` | INTEGER | 是 | 关联分析运行，外键 → `analysis_runs.id` |
| `entity_type` | TEXT | 否 | 实体类型，例如 `quote`、`price_history` |
| `entity_id` | INTEGER | 是 | 实体 ID |
| `event_type` | TEXT | 否 | 事件类型，例如 `price_applied` |
| `actor_type` | TEXT | 否 | `user`、`system`、`model` |
| `actor_label` | TEXT | 是 | 操作员、模型名或组件名 |
| `payload_json` | TEXT | 否 | 事件详情 JSON |
| `created_at` | TEXT | 否 | 事件时间 |

约束：

- `payload_json` 必须是合法 JSON；
- `actor_type` 只能是三个值；
- 删除报价会把 `quote_id` 置空，但审计事件保留；
- 删除分析运行会把 `analysis_run_id` 置空，但审计事件保留；
- 删除餐厅会级联删除审计事件。

典型事件：

```text
quote_created
extraction_completed
confirmation_recorded
price_applied
analysis_started
analysis_completed
advice_generated
processing_failed
```

---

## 18. 关键约束和索引

### 18.1 唯一性

| 对象 | 约束 |
|---|---|
| 供应商 | 同一餐厅内标准化名称唯一 |
| 标准食材 | 同一餐厅内标准化名称唯一 |
| 全局别名 | 同一餐厅内别名唯一 |
| 供应商别名 | 同一餐厅、供应商内别名唯一 |
| 全局单位换算 | 同一餐厅、单位对唯一 |
| 食材单位换算 | 同一餐厅、食材、单位对唯一 |
| 报价行 | 同一报价内行号唯一 |
| 价格历史 | 一条报价行最多一条 |
| 菜品 | 同一餐厅内标准化名称唯一 |
| 菜谱用量 | 同一菜品、食材唯一 |
| 分析结果 | 同一分析运行、菜品唯一 |

### 18.2 级联行为

| 删除对象 | 结果 |
|---|---|
| 删除餐厅 | 级联删除供应商、食材、报价、菜品、分析运行、审计事件 |
| 删除报价 | 级联删除报价行、确认记录、分析运行；价格历史来源置空 |
| 删除报价行 | 级联删除该行确认记录；价格历史来源置空 |
| 删除食材 | 级联删除别名、单位换算、价格历史；被菜谱使用时拒绝删除 |
| 删除菜品 | 级联删除菜谱用量；被分析结果引用时拒绝删除 |
| 删除分析运行 | 级联删除分析菜品结果；审计事件关联置空 |

### 18.3 为什么不全部用级联删除

- 价格历史是账本，不能因为报价被删就消失；
- 审计事件是证据，不能因为业务对象被删就消失；
- 被菜谱或分析引用的食材/菜品应通过 `is_active` 停用，而不是物理删除。

---

## 19. 状态和枚举汇总

| 枚举 | 可选值 |
|---|---|
| `ingredients.base_unit` | `g`、`ml`、`个` |
| `quotes.source_type` | `text`、`image`、`pdf` |
| `quotes.status` | `draft`、`extracting`、`extracted`、`needs_confirmation`、`ready`、`applied`、`failed` |
| `quote_items.status` | `draft`、`needs_confirmation`、`ready`、`applied`、`skipped`、`failed` |
| `quote_items.price_type` | `total`、`unit` |
| `quote_items.match_method` | `exact_alias`、`exact_name`、`normalized_name`、`confirmed`、`ai_suggested`、`manual` |
| `confirmations.type` | 12 种，见第 14 节 |
| `confirmations.scope` | `this_quote`、`remember` |
| `price_history.source` | `quote`、`manual` |
| `analysis_runs.status` | `running`、`completed`、`failed` |
| `analysis_dish_results.risk_level` | `critical`、`warning`、`watch`、`normal`、`insufficient_data` |
| `analysis_dish_results.ranking_group` | `weekly`、`per_serving` |
| `audit_events.actor_type` | `user`、`system`、`model` |

---

## 20. 迁移和检查命令

### 20.1 创建或升级数据库

```powershell
npm run db:migrate
```

预期输出类似：

```text
Database: D:\hack\deepseek\data\app.db
Applied: 001_initial.sql
Current schema: 001
```

### 20.2 查看表

```powershell
npm run db:tables
```

预期输出 15 张表。

### 20.3 运行数据模型测试

```powershell
npm test
```

第三阶段新增的测试覆盖：

- 从空数据库迁移出全部表；
- 迁移幂等；
- 外键约束；
- 唯一约束；
- 一条报价行最多一条价格历史；
- 删除报价级联删除报价行；
- 事务失败全部回滚。

### 20.4 数据库文件

- 路径：`data/app.db`
- 默认被 `.gitignore` 忽略；
- `data/app.db-wal`、`data/app.db-shm` 也被忽略；
- 数据库文件不是源代码，不能提交真实数据。

---

## 21. 本阶段明确不做

- 不做菜谱版本树；
- 不做多门店；
- 不做用户、角色、权限表；
- 不做库存、采购单、入库单；
- 不做 POS 订单；
- 不做税费、运费、折扣分摊；
- 不做净料率、损耗率、出成率；
- 不做供应商聊天记录；
- 不做模型思维链存储。

这些表或字段如果以后要加，必须新增迁移文件并更新本文。
