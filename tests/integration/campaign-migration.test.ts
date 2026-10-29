import { test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { mkdtemp, cp, readdir, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { execFile as callback } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(callback);
test(
  "the real campaign migration archives legacy publication before disabling it and preserves exact version history",
  { timeout: 60000 },
  async () => {
    const name = "campaign_migration_" + randomUUID().replaceAll("-", "");
    const master = new PrismaClient({
      datasourceUrl:
        "postgresql://cubers:cubers_dev_only@127.0.0.1:54329/cubers",
    });
    const url = `postgresql://cubers:cubers_dev_only@127.0.0.1:54329/${name}`;
    const target = new PrismaClient({ datasourceUrl: url });
    const root = await mkdtemp(join(tmpdir(), "cubers-campaign-migration-")),
      migrations = resolve("apps/api/prisma/migrations"),
      next = "202610180004_sponsor_campaigns";
    try {
      await master.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
      await cp("apps/api/prisma/schema.prisma", join(root, "schema.prisma"));
      await mkdir(join(root, "migrations"));
      for (const entry of await readdir(migrations)) {
        if (entry === "migration_lock.toml" || entry < next)
          await cp(join(migrations, entry), join(root, "migrations", entry), {
            recursive: true,
          });
      }
      const deploy = () =>
        exec(
          process.execPath,
          [
            "node_modules/prisma/build/index.js",
            "migrate",
            "deploy",
            "--schema",
            join(root, "schema.prisma"),
          ],
          {
            env: { ...process.env, DATABASE_URL: url },
            timeout: 30000,
            maxBuffer: 1024 * 1024,
          },
        );
      await deploy();
      const id = randomUUID(),
        now = new Date(),
        end = new Date(now.getTime() + 86400000);
      await target.$executeRaw`INSERT INTO "Campaign"("id","title","destination","enabled","reviewed","startsAt","endsAt") VALUES(${id}::uuid,'Legacy sponsor','https://example.org/legacy',true,true,${now},${end})`;
      await target.$executeRaw`INSERT INTO "Setting"("key","value") VALUES('sponsors-enabled','true'::jsonb) ON CONFLICT("key") DO UPDATE SET "value"='true'::jsonb`;
      await cp(join(migrations, next), join(root, "migrations", next), {
        recursive: true,
      });
      await deploy();
      const row = await target.campaign.findUniqueOrThrow({ where: { id } }),
        history = await target.campaignRevision.findMany({
          where: { campaignId: id },
          orderBy: { version: "asc" },
        });
      assert.equal(row.version, 2);
      assert.equal(row.enabled, false);
      assert.equal(row.reviewed, false);
      assert.equal(row.content, null);
      assert.equal(row.archiveReference, null);
      assert.equal(history.length, 2);
      assert.equal((history[0].snapshot as any).enabled, true);
      assert.equal((history[0].snapshot as any).legacyRegionalSetting, true);
      assert.equal((history[1].snapshot as any).enabled, false);
      const earliest = new Date(end);
      earliest.setUTCFullYear(earliest.getUTCFullYear() + 3);
      assert.ok(history.every((h) => h.retainUntil >= earliest));
      assert.deepEqual(
        (
          await target.setting.findUniqueOrThrow({
            where: { key: "sponsors-enabled" },
          })
        ).value,
        { enabled: false, version: 1 },
      );
      assert.equal(
        (
          await target.$queryRaw<
            { n: number }[]
          >`SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`
        )[0].n,
        30,
      );
    } finally {
      await target.$disconnect();
      await master.$executeRawUnsafe(
        `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`,
      );
      await master.$disconnect();
      await rm(root, { recursive: true, force: true });
    }
  },
);
