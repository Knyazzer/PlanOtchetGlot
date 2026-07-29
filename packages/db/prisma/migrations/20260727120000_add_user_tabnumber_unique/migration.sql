-- Уникальность табельного номера на уровне БД (была только app-level проверка, не атомарная).
-- NULL допускает много значений в unique-индексе → неонборженные без табельного не конфликтуют.
-- CreateIndex
CREATE UNIQUE INDEX "users_tabNumber_key" ON "nexus"."users"("tabNumber");
