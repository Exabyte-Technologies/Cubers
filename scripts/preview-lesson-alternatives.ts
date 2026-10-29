// Explicit local-preview content upgrade, never shipped in the API image.
// Production uses the administrator's draft/review/publish workflow instead.
import { PrismaClient, Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { lessons, checkedCourseLesson, CourseLesson } from "@cubers/core";
import { readConfig } from "../apps/api/src/config";
async function main() {
  const config = readConfig(),
    database = new URL(config.DATABASE_URL);
  if (
    config.NODE_ENV !== "development" ||
    config.REGION !== "INTL" ||
    config.AI_MODE !== "mock" ||
    config.PUBLIC_RELEASE_APPROVED === "true" ||
    !["postgresql:", "postgres:"].includes(database.protocol) ||
    database.hostname !== "127.0.0.1" ||
    database.port !== "54329" ||
    database.pathname !== "/cubers" ||
    database.search !== "" ||
    database.hash !== ""
  )
    throw Error(
      "This tool accepts only the fixed international local preview with mock AI and release approval off",
    );
  const db = new PrismaClient({ datasourceUrl: config.DATABASE_URL });
  try {
    const digest = (value: unknown) =>
      createHash("sha256")
        .update(JSON.stringify(CourseLesson.parse(value)))
        .digest("hex");
    const proof = await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET LOCAL lock_timeout='2000ms'`;
        await tx.$executeRaw`SET LOCAL statement_timeout='10000ms'`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(83472107)`;
        const changed: {
          id: string;
          before: number;
          after: number;
          published: boolean;
        }[] = [];
        let unchanged = 0;
        for (const source of lessons
          .filter((row) => row.alternatives?.length)
          .sort((a, b) => a.id.localeCompare(b.id))) {
          await tx.$queryRaw`SELECT id FROM "Course" WHERE id=${source.id} FOR UPDATE`;
          const row = await tx.course.findUnique({ where: { id: source.id } });
          if (!row)
            throw Error(
              "Initialize authored courses before upgrading preview content",
            );
          const old = CourseLesson.parse(row.content);
          if (
            old.algorithm !== source.algorithm ||
            old.puzzle !== source.puzzle ||
            old.caseFamily !== source.caseFamily
          )
            throw Error(
              "Preview course verification fields differ; manual review required",
            );
          if (old.alternatives?.length) {
            if (
              JSON.stringify(old.alternatives) !==
              JSON.stringify(CourseLesson.parse(source).alternatives)
            )
              throw Error(
                "An existing alternative differs; manual review required",
              );
            unchanged++;
            continue;
          }
          const content = checkedCourseLesson({
            ...old,
            alternatives: source.alternatives,
          });
          await tx.courseRevision.upsert({
            where: {
              courseId_version: { courseId: row.id, version: row.version },
            },
            create: {
              courseId: row.id,
              version: row.version,
              content: row.content as Prisma.InputJsonValue,
              published: row.published,
              digest: digest(old),
            },
            update: {},
          });
          const saved = await tx.course.update({
            where: { id: row.id },
            data: {
              version: { increment: 1 },
              content: content as unknown as Prisma.InputJsonValue,
            },
          });
          await tx.courseRevision.create({
            data: {
              courseId: row.id,
              version: saved.version,
              content: saved.content as Prisma.InputJsonValue,
              published: saved.published,
              digest: digest(content),
            },
          });
          const recent = await tx.courseRevision.findMany({
            where: { courseId: row.id },
            orderBy: { version: "desc" },
            take: 50,
            select: { version: true },
          });
          await tx.courseRevision.deleteMany({
            where: {
              courseId: row.id,
              version: { notIn: recent.map((r) => r.version) },
            },
          });
          changed.push({
            id: row.id,
            before: row.version,
            after: saved.version,
            published: saved.published,
          });
        }
        await tx.audit.create({
          data: {
            actorId: "development-local-preview",
            action: "development.lesson-alternatives",
            targetId: "local-preview",
            detail: {
              changed: changed.length,
              unchanged,
              scope:
                "mock-only local preview; not an operator release approval",
            },
          },
        });
        return {
          changed,
          unchanged,
          historicalSessionsRewritten: false,
          progressRewritten: false,
          scope: "local-preview-only",
        };
      },
      { timeout: 30000 },
    );
    await mkdir(".data/algorithm-alternatives", {
      recursive: true,
      mode: 0o700,
    });
    await writeFile(
      ".data/algorithm-alternatives/preview-content-upgrade.json",
      JSON.stringify(proof, null, 2) + "\n",
      { mode: 0o600 },
    );
    console.log(
      JSON.stringify({
        changed: proof.changed.length,
        unchanged: proof.unchanged,
        scope: proof.scope,
      }),
    );
  } finally {
    await db.$disconnect();
  }
}
void main().catch(() => {
  console.error(
    "Preview upgrade failed; no credentials printed. Content changes are atomic.",
  );
  process.exitCode = 1;
});
