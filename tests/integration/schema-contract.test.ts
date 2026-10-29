import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PrismaClient } from "@prisma/client";

const run = promisify(execFile);
test(
  "all installed migrations match the schema and preserve immutable parent identities with delete cascades",
  { timeout: 180000 },
  async () => {
    // This fixture can address only a unique disposable database on the fixed
    // development server. It never reads deployment credentials or seeded data.
    const name = "cubers_schema_" + randomUUID().replaceAll("-", "");
    assert.match(name, /^cubers_schema_[a-f0-9]{32}$/);
    const base = "postgresql://cubers:cubers_dev_only@127.0.0.1:54329/";
    const master = new PrismaClient({ datasourceUrl: base + "cubers" });
    const db = new PrismaClient({ datasourceUrl: base + name });
    let created = false;
    try {
      await master.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
      created = true;
      const env = {
        ...process.env,
        DATABASE_URL: base + name,
        NPM_CONFIG_AUDIT: "false",
      };
      const cli = "node_modules/prisma/build/index.js";
      await run(
        process.execPath,
        [cli, "migrate", "deploy", "--schema", "apps/api/prisma/schema.prisma"],
        { env, timeout: 90000 },
      );
      const migrations = await db.$queryRaw<
        { unfinished: bigint }[]
      >`SELECT count(*) AS unfinished FROM "_prisma_migrations" WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL`;
      assert.equal(migrations[0].unfinished, 0n);
      try {
        await run(
          process.execPath,
          [
            cli,
            "migrate",
            "diff",
            "--from-url",
            base + name,
            "--to-schema-datamodel",
            "apps/api/prisma/schema.prisma",
            "--script",
            "--exit-code",
          ],
          { env, timeout: 30000 },
        );
      } catch (error) {
        const failure = error as { stdout?: string; code?: number };
        assert.fail(
          `Migrated database differs from Prisma schema (exit ${failure.code}): ${failure.stdout ?? "diff failed"}`,
        );
      }
      const constraints = await db.$queryRaw<
        { conname: string; updates: string; deletes: string }[]
      >`SELECT conname, confupdtype::text AS updates, confdeltype::text AS deletes FROM pg_constraint WHERE conname IN ('CourseRevision_courseId_fkey', 'MediaRestoreFile_batchId_fkey') ORDER BY conname`;
      assert.deepEqual(constraints, [
        { conname: "CourseRevision_courseId_fkey", updates: "a", deletes: "c" },
        {
          conname: "MediaRestoreFile_batchId_fkey",
          updates: "a",
          deletes: "c",
        },
      ]);
      const courseId = "schema-contract-course";
      await db.course.create({
        data: {
          id: courseId,
          puzzle: "3x3",
          level: "beginner",
          content: {},
          revisions: {
            create: {
              version: 1,
              content: {},
              published: false,
              digest: "fixture",
            },
          },
        },
      });
      await assert.rejects(
        db.course.update({
          where: { id: courseId },
          data: { id: "renamed-course" },
        }),
        { code: "P2003" },
      );
      assert.equal(
        (
          await db.courseRevision.findUniqueOrThrow({
            where: { courseId_version: { courseId, version: 1 } },
          })
        ).courseId,
        courseId,
      );
      await db.course.delete({ where: { id: courseId } });
      assert.equal(await db.courseRevision.count(), 0);
      const batchId = randomUUID();
      await db.mediaRestoreBatch.create({
        data: {
          id: batchId,
          bundleId: randomUUID(),
          snapshotId: randomUUID(),
          indexDigest: "fixture",
          bucket: "schema-fixture",
          storage: "fixture",
          expiresAt: new Date(Date.now() + 60000),
          files: {
            create: {
              objectId: randomUUID(),
              mediaId: randomUUID(),
              userId: randomUUID(),
              key: "fixture",
              sha256: "fixture",
              type: "image/png",
              size: 1,
              expiresAt: new Date(Date.now() + 60000),
            },
          },
        },
      });
      await assert.rejects(
        db.mediaRestoreBatch.update({
          where: { id: batchId },
          data: { id: randomUUID() },
        }),
        { code: "P2003" },
      );
      assert.equal(await db.mediaRestoreFile.count({ where: { batchId } }), 1);
      await db.mediaRestoreBatch.delete({ where: { id: batchId } });
      assert.equal(await db.mediaRestoreFile.count(), 0);
    } finally {
      await db.$disconnect();
      try {
        if (created)
          await master.$executeRawUnsafe(
            `DROP DATABASE "${name}" WITH (FORCE)`,
          );
      } finally {
        await master.$disconnect();
      }
    }
  },
);
