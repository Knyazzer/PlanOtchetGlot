-- Флаг системного аккаунта (мастер-админ Nexus, не является сотрудником)
-- Такой аккаунт скрыт из всех списков сотрудников, Свода, Аналитики, оргдерева.
ALTER TABLE nexus.users ADD COLUMN IF NOT EXISTS is_system_account BOOLEAN NOT NULL DEFAULT false;
