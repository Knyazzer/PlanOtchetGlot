-- §9 ECOSYSTEM-AGGREGATION: аддитивные nullable-«розетки» под будущее зеркалирование
-- внешних задач (kanban/support). Пустые сегодня, ничего не ломают; источник правды — продукт.
-- AlterTable
ALTER TABLE "nexus"."tasks" ADD COLUMN "source" TEXT,
ADD COLUMN "external_id" TEXT,
ADD COLUMN "external_url" TEXT;
