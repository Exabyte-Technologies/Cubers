# Migration and schema consistency

The two recorded foreign-key differences are reconciled in Prisma without changing the installed database or historical migrations.

`CourseRevision.courseId` and `MediaRestoreFile.batchId` now explicitly declare `onUpdate: NoAction`, matching their original PostgreSQL migrations. Both retain `onDelete: Cascade`. Previously, omitting `onUpdate` made Prisma assume cascading parent-key updates, so a database built from all migrations still produced a nonempty schema diff.

Course IDs identify published content, revision history and learning references. Course authoring rejects an edited lesson with a different ID; updates change content, publication and version, while initialization preserves existing courses. Restore batch UUIDs identify the isolated restore journal and custody workflow; resumptions change status under the original identity. Neither workflow supports renaming these parent IDs. Preserving the existing database rule avoids silently adding rename behavior or rewriting historical identity references.

PostgreSQL rejects a parent ID change while these child rows exist. This foreign-key rule alone does not prohibit renaming an unreferenced parent, nor does it provide authorization. Existing API/operator validation remains necessary. Parent deletion still removes its dependent revisions or restore-file records. These database cascades do not themselves erase stored objects or replace the existing retention, custody and erasure workflows.

## Regression coverage

`tests/integration/schema-contract.test.ts` creates a uniquely named disposable database on the fixed local development PostgreSQL server, applies every real migration and runs Prisma's schema diff with `--exit-code`. Any drift fails the test. It also reads both actual PostgreSQL constraints, verifies parent-key updates fail without moving the child records, and verifies deletion cascades for both relationships. The fixture contains only synthetic rows and removes its database in `finally`; it never reads production credentials or preview rows.

Run it against the project's running local development PostgreSQL service:

```sh
TSX_TSCONFIG_PATH=apps/api/tsconfig.json node --import tsx --test tests/integration/schema-contract.test.ts
```

The regional Docker verification also runs the migration image's Prisma CLI against its own installed PostgreSQL database. Its explicit empty-diff check covers the packaged schema in both communities and saves a private regional diff log. It neither starts an additional migration nor changes the tested database.

The pre-fix test failure is retained at `.data/schema-contract/before.log`; it reproduces both proposed cascading-update changes. The post-fix test passes with the original 46 migrations. The complete backend suite passes **308 checks**, workspace types/builds and formatting pass, and Docker **2f4ca49f** passes **60 INTL / 56 CN** groups with empty schema diffs in both communities. Read-only preview queries confirm all 46 installed migration checksums still match their source files, both original constraint actions remain intact, the preview schema diff is empty and all thirteen saved table snapshots are unchanged. Packaged hashes match **51 API / 49 migration-image / 41 recovery files** and **three admin assets**. No new migration, historical SQL edit, native module, dependency change, provider activation or preview restart was performed. Existing source tests and mobile exports were not repeated for this schema-only declaration and integration-test change; the preceding dependency milestone retains their dated evidence. No new restore drill or OS/runtime-base refresh is claimed. Current validation totals and container evidence are recorded in [STATUS.md](STATUS.md) and privately under `.data/schema-contract/`.

Schema equality checks deployed DDL against the model; it does not prove data recovery, production performance, absence of vulnerabilities or operator readiness. Existing native/hardware, live-service, security and regulatory release requirements remain open.
