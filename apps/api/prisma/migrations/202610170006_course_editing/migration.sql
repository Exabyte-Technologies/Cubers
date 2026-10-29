BEGIN;
ALTER TABLE "Progress" ADD COLUMN "courseVersion" INTEGER;
UPDATE "Progress" p SET "courseVersion" = latest."courseVersion"
FROM (SELECT DISTINCT ON ("userId", "lessonId") "userId", "lessonId", "courseVersion"
      FROM "LessonSession" WHERE status = 'COMPLETED' AND "lessonId" NOT IN ('3-first-solve','2-first-solve','pyra-first-solve','4-first-solve')
      ORDER BY "userId", "lessonId", COALESCE("finishedAt", "createdAt") DESC, id DESC) latest
WHERE p."userId"=latest."userId" AND p."lessonId"=latest."lessonId";
UPDATE "Progress" p SET "courseVersion" = latest."courseVersion"
FROM (SELECT DISTINCT ON ("userId", "courseId") "userId", "courseId", "courseVersion"
      FROM "GuidedSolve" WHERE status = 'COMPLETED'
      ORDER BY "userId", "courseId", "finishedAt" DESC NULLS LAST, id DESC) latest
WHERE p."userId"=latest."userId" AND p."lessonId"=latest."courseId";
CREATE TABLE "CourseRevision" (
 "courseId" TEXT NOT NULL REFERENCES "Course"(id) ON DELETE CASCADE,
 version INTEGER NOT NULL, content JSONB NOT NULL, published BOOLEAN NOT NULL,
 digest TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("courseId", version)
);
COMMIT;
