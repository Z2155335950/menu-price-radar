-- 供应商在报价单中的其他写法，例如“鲜源配送”指向“鲜源蔬菜配送”。
CREATE TABLE supplier_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  alias TEXT NOT NULL CHECK (length(trim(alias)) > 0),
  normalized_alias TEXT NOT NULL CHECK (length(trim(normalized_alias)) > 0),
  source TEXT NOT NULL CHECK (source IN ('user_confirmed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE UNIQUE INDEX ux_supplier_aliases_restaurant_normalized
  ON supplier_aliases (restaurant_id, normalized_alias);

CREATE INDEX ix_supplier_aliases_supplier
  ON supplier_aliases (supplier_id);
