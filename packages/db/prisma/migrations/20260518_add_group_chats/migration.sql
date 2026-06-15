-- Add 'group' value to ChatType enum
ALTER TYPE "ChatType" ADD VALUE 'group';

-- Add name and color columns to chats
ALTER TABLE "chats" ADD COLUMN "name"  TEXT;
ALTER TABLE "chats" ADD COLUMN "color" TEXT;
