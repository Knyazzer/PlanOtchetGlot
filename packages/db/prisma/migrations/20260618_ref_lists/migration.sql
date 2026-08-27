-- Общие справочники («Списки»): RefList (категория) + RefItem (значение).
-- Единые для всех; админ редактирует значения, формы сотрудников читают.
CREATE TABLE IF NOT EXISTS "nexus"."ref_lists" (
  "id"        TEXT NOT NULL,
  "key"       TEXT NOT NULL,
  "label"     TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ref_lists_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ref_lists_key_key" ON "nexus"."ref_lists"("key");

CREATE TABLE IF NOT EXISTS "nexus"."ref_items" (
  "id"         TEXT NOT NULL,
  "list_id"    TEXT NOT NULL,
  "value"      TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ref_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ref_items_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "nexus"."ref_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ref_items_list_id_value_key" ON "nexus"."ref_items"("list_id","value");
CREATE INDEX IF NOT EXISTS "ref_items_list_id_idx" ON "nexus"."ref_items"("list_id");

-- Фиксированный набор списков (значения наполняются вручную, не из хаотичной КФПД).
INSERT INTO "nexus"."ref_lists" ("id","key","label","sort_order") VALUES
  (gen_random_uuid()::text, 'content_formats', 'Форматы',              1),
  (gen_random_uuid()::text, 'producers',       'Продюсеры/Менеджеры',  2),
  (gen_random_uuid()::text, 'positions',       'Должности',            3),
  (gen_random_uuid()::text, 'legal_entities',  'Юридические лица',     4),
  (gen_random_uuid()::text, 'business_units',  'Бизнес-юниты',         5),
  (gen_random_uuid()::text, 'corp_cards',      'Корп. карты',          6),
  (gen_random_uuid()::text, 'statuses',        'Статусы',              7)
ON CONFLICT ("key") DO NOTHING;
