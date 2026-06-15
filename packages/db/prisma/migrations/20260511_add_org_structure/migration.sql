-- CreateTable departments
CREATE TABLE "departments" (
    "id"         TEXT NOT NULL,
    "name"       TEXT NOT NULL,
    "color"      TEXT NOT NULL DEFAULT '#1e40af',
    "directorId" TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable divisions
CREATE TABLE "divisions" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "deptId"    TEXT NOT NULL,
    "headId"    TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "divisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable user_divisions
CREATE TABLE "user_divisions" (
    "userId"   TEXT NOT NULL,
    "divId"    TEXT NOT NULL,
    "position" TEXT NOT NULL,

    CONSTRAINT "user_divisions_pkey" PRIMARY KEY ("userId","divId")
);

-- AddForeignKey departments.directorId -> users.id
ALTER TABLE "departments" ADD CONSTRAINT "departments_directorId_fkey"
    FOREIGN KEY ("directorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey divisions.deptId -> departments.id
ALTER TABLE "divisions" ADD CONSTRAINT "divisions_deptId_fkey"
    FOREIGN KEY ("deptId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey divisions.headId -> users.id
ALTER TABLE "divisions" ADD CONSTRAINT "divisions_headId_fkey"
    FOREIGN KEY ("headId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey user_divisions.userId -> users.id
ALTER TABLE "user_divisions" ADD CONSTRAINT "user_divisions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey user_divisions.divId -> divisions.id
ALTER TABLE "user_divisions" ADD CONSTRAINT "user_divisions_divId_fkey"
    FOREIGN KEY ("divId") REFERENCES "divisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
