-- Store task title at send-time so the message card survives task deletion
ALTER TABLE "messages" ADD COLUMN tasktitle TEXT;
