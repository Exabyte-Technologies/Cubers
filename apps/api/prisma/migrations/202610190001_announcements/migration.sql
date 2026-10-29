CREATE TABLE "Announcement" (
  "id" UUID NOT NULL,
  "kind" TEXT NOT NULL,
  "content" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "published" BOOLEAN NOT NULL DEFAULT false,
  "reviewedAt" TIMESTAMP(3),
  "courseId" TEXT,
  "courseVersion" INTEGER,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Announcement_kind_check" CHECK ("kind" IN ('service','learning')),
  CONSTRAINT "Announcement_version_check" CHECK ("version" > 0),
  CONSTRAINT "Announcement_window_check" CHECK ("endsAt" > "startsAt")
);
CREATE TABLE "AnnouncementRevision" (
  "id" UUID NOT NULL,
  "announcementId" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnnouncementRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AnnouncementRevision_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Announcement_published_startsAt_id_idx" ON "Announcement"("published","startsAt","id");
CREATE INDEX "Announcement_endsAt_id_idx" ON "Announcement"("endsAt","id");
CREATE UNIQUE INDEX "AnnouncementRevision_announcementId_version_key" ON "AnnouncementRevision"("announcementId","version");
