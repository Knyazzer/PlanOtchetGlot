-- Управление паролями: временный пароль (виден админу) + форс-смена при первом входе.
-- Только добавление колонок в nexus.users (накопившийся дрейф по другим таблицам намеренно НЕ трогаем).
ALTER TABLE "nexus"."users"
  ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "temp_password" TEXT;
