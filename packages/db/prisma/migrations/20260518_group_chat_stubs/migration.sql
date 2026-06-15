-- Chat: description and invite token
ALTER TABLE "chats" ADD COLUMN "description" TEXT;
ALTER TABLE "chats" ADD COLUMN "inviteToken" TEXT;
CREATE UNIQUE INDEX "chats_inviteToken_key" ON "chats"("inviteToken");

-- Message: forward and scheduled stubs
ALTER TABLE "messages" ADD COLUMN "scheduledAt"   TIMESTAMP(3);
ALTER TABLE "messages" ADD COLUMN "forwardFromId" TEXT;

ALTER TABLE "messages" ADD CONSTRAINT "messages_forwardFromId_fkey"
  FOREIGN KEY ("forwardFromId") REFERENCES "messages"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "messages_chatId_scheduledAt_idx" ON "messages"("chatId", "scheduledAt");

-- MessageReaction
CREATE TABLE "message_reactions" (
  "id"        TEXT         NOT NULL,
  "messageId" TEXT         NOT NULL,
  "userId"    TEXT         NOT NULL,
  "emoji"     TEXT         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "message_reactions_messageId_userId_emoji_key"
  ON "message_reactions"("messageId", "userId", "emoji");
CREATE INDEX "message_reactions_messageId_idx" ON "message_reactions"("messageId");

ALTER TABLE "message_reactions"
  ADD CONSTRAINT "message_reactions_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "message_reactions"
  ADD CONSTRAINT "message_reactions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- MessageMention
CREATE TABLE "message_mentions" (
  "messageId" TEXT NOT NULL,
  "userId"    TEXT NOT NULL,

  CONSTRAINT "message_mentions_pkey" PRIMARY KEY ("messageId", "userId")
);

CREATE INDEX "message_mentions_userId_idx" ON "message_mentions"("userId");

ALTER TABLE "message_mentions"
  ADD CONSTRAINT "message_mentions_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "message_mentions"
  ADD CONSTRAINT "message_mentions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
