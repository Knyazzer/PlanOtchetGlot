-- Add isGroupAdmin flag to chat_members
ALTER TABLE "chat_members" ADD COLUMN "isGroupAdmin" BOOLEAN NOT NULL DEFAULT false;
