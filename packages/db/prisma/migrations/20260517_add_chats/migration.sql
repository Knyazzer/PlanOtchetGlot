-- Enum типов чата
CREATE TYPE "ChatType" AS ENUM ('direct', 'self', 'support', 'project');

-- Таблица чатов
CREATE TABLE "chats" (
    "id"        TEXT NOT NULL,
    "type"      "ChatType" NOT NULL DEFAULT 'direct',
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chats_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "chats_type_idx"      ON "chats"("type");
CREATE INDEX "chats_updatedAt_idx" ON "chats"("updatedAt");

-- Участники чата
CREATE TABLE "chat_members" (
    "chatId"     TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3),
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "isPinned"   BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt"     TIMESTAMP(3),

    CONSTRAINT "chat_members_pkey" PRIMARY KEY ("chatId", "userId")
);

CREATE INDEX "chat_members_userId_isFavorite_idx" ON "chat_members"("userId", "isFavorite");
CREATE INDEX "chat_members_userId_isPinned_idx"   ON "chat_members"("userId", "isPinned");
CREATE INDEX "chat_members_chatId_idx"             ON "chat_members"("chatId");

ALTER TABLE "chat_members"
    ADD CONSTRAINT "chat_members_chatId_fkey"
    FOREIGN KEY ("chatId") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "chat_members"
    ADD CONSTRAINT "chat_members_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Сообщения
CREATE TABLE "messages" (
    "id"        TEXT NOT NULL,
    "chatId"    TEXT NOT NULL,
    "senderId"  TEXT NOT NULL,
    "text"      TEXT NOT NULL,
    "editedAt"  TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "replyToId" TEXT,
    "isPinned"  BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- Главный индекс: история чата по времени
CREATE INDEX "messages_chatId_createdAt_idx"            ON "messages"("chatId", "createdAt");
-- Фильтр удалённых при загрузке истории
CREATE INDEX "messages_chatId_deletedAt_createdAt_idx"  ON "messages"("chatId", "deletedAt", "createdAt");
-- Аналитика: сообщения конкретного пользователя
CREATE INDEX "messages_senderId_createdAt_idx"          ON "messages"("senderId", "createdAt");
-- Закреплённые сообщения в чате
CREATE INDEX "messages_chatId_isPinned_idx"             ON "messages"("chatId", "isPinned");

ALTER TABLE "messages"
    ADD CONSTRAINT "messages_chatId_fkey"
    FOREIGN KEY ("chatId") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "messages"
    ADD CONSTRAINT "messages_senderId_fkey"
    FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "messages"
    ADD CONSTRAINT "messages_replyToId_fkey"
    FOREIGN KEY ("replyToId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
