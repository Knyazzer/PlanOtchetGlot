-- ============================================================
-- SSO + multiSchema migration
--
-- Before: all tables in public schema, User has passwordHash
-- After:  all app tables in nexus schema, User gets authId /
--         canAccessInventory, passwordHash removed,
--         public.users = lean SSO identity table
-- ============================================================

-- 1. Create nexus schema
CREATE SCHEMA IF NOT EXISTS nexus;

-- 2. Move enums to nexus schema
ALTER TYPE public."TaskStatus"      SET SCHEMA nexus;
ALTER TYPE public."TrackType"       SET SCHEMA nexus;
ALTER TYPE public."TrackStatus"     SET SCHEMA nexus;
ALTER TYPE public."ChatType"        SET SCHEMA nexus;
ALTER TYPE public."ProjectStatus"   SET SCHEMA nexus;
ALTER TYPE public."WorkItemStatus"  SET SCHEMA nexus;
ALTER TYPE public."ExpenseCategory" SET SCHEMA nexus;

-- 3. Modify public.users BEFORE moving it to nexus
--    (drop passwordHash, add authId + canAccessInventory, make email nullable)
ALTER TABLE public.users
    DROP COLUMN IF EXISTS "passwordHash",
    ADD COLUMN  IF NOT EXISTS "auth_id"              TEXT UNIQUE,
    ADD COLUMN  IF NOT EXISTS "can_access_inventory" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.users
    ALTER COLUMN email DROP NOT NULL;

-- 4. Move all app tables from public to nexus
ALTER TABLE public.users                SET SCHEMA nexus;
ALTER TABLE public.departments          SET SCHEMA nexus;
ALTER TABLE public.divisions            SET SCHEMA nexus;
ALTER TABLE public.user_divisions       SET SCHEMA nexus;
ALTER TABLE public.sheet_configs        SET SCHEMA nexus;
ALTER TABLE public.tasks                SET SCHEMA nexus;
ALTER TABLE public.task_logs            SET SCHEMA nexus;
ALTER TABLE public.chats                SET SCHEMA nexus;
ALTER TABLE public.chat_members         SET SCHEMA nexus;
ALTER TABLE public.messages             SET SCHEMA nexus;
ALTER TABLE public.message_reactions    SET SCHEMA nexus;
ALTER TABLE public.message_mentions     SET SCHEMA nexus;
ALTER TABLE public.events               SET SCHEMA nexus;
ALTER TABLE public.event_participants   SET SCHEMA nexus;
ALTER TABLE public.calendar_entries     SET SCHEMA nexus;
ALTER TABLE public.tracks               SET SCHEMA nexus;
ALTER TABLE public.track_members        SET SCHEMA nexus;
ALTER TABLE public.stages               SET SCHEMA nexus;
ALTER TABLE public.clients              SET SCHEMA nexus;
ALTER TABLE public.projects             SET SCHEMA nexus;
ALTER TABLE public.work_items           SET SCHEMA nexus;
ALTER TABLE public.work_item_divisions  SET SCHEMA nexus;
ALTER TABLE public.expenses             SET SCHEMA nexus;

-- 5. Create lean SSO identity table in public schema
--    id = Supabase auth.users.id (UUID)
CREATE TABLE IF NOT EXISTS public.users (
    id         UUID        PRIMARY KEY,
    email      TEXT        UNIQUE NOT NULL,
    name       TEXT        NOT NULL,
    position   TEXT,
    department TEXT,
    is_active  BOOLEAN     NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
