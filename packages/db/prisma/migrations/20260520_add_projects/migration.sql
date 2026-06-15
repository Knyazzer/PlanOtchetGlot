-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('draft', 'active', 'done', 'cancelled');

-- CreateEnum
CREATE TYPE "WorkItemStatus" AS ENUM ('request', 'active', 'done', 'rejected', 'cancelled');

-- CreateTable: clients
CREATE TABLE "clients" (
    "id"         TEXT NOT NULL,
    "name"       TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "clients_name_key" ON "clients"("name");

-- CreateTable: projects
CREATE TABLE "projects" (
    "id"          TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "client_id"   TEXT,
    "status"      "ProjectStatus" NOT NULL DEFAULT 'draft',
    "producer_id" TEXT,
    "brief"       TEXT,
    "kp_link"     TEXT,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "projects_client_id_idx"   ON "projects"("client_id");
CREATE INDEX "projects_producer_id_idx" ON "projects"("producer_id");

-- CreateTable: work_items
CREATE TABLE "work_items" (
    "id"                TEXT NOT NULL,
    "project_id"        TEXT NOT NULL,
    "title"             TEXT NOT NULL,
    "description"       TEXT,
    "status"            "WorkItemStatus" NOT NULL DEFAULT 'request',
    "exec_producer_id"  TEXT,
    "line_producer_id"  TEXT,
    "account_manager_id" TEXT,
    "date"              TEXT,
    "format"            TEXT,
    "location"          TEXT,
    "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "work_items_project_id_idx" ON "work_items"("project_id");

-- Add work_item_id to tracks
ALTER TABLE "tracks" ADD COLUMN "work_item_id" TEXT;
CREATE INDEX "tracks_work_item_id_idx" ON "tracks"("work_item_id");

-- AddForeignKey: projects.client_id -> clients.id
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: projects.producer_id -> users.id
ALTER TABLE "projects" ADD CONSTRAINT "projects_producer_id_fkey"
    FOREIGN KEY ("producer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: work_items.project_id -> projects.id
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: work_items.exec_producer_id -> users.id
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_exec_producer_id_fkey"
    FOREIGN KEY ("exec_producer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: work_items.line_producer_id -> users.id
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_line_producer_id_fkey"
    FOREIGN KEY ("line_producer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: work_items.account_manager_id -> users.id
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_account_manager_id_fkey"
    FOREIGN KEY ("account_manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: tracks.work_item_id -> work_items.id
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_work_item_id_fkey"
    FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
