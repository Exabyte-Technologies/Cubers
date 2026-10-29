import { PrismaClient, Prisma } from "@prisma/client";
import {
  lessons,
  practiceSetup,
  practiceApply,
  practiceSolved,
} from "@cubers/core";
const db = new PrismaClient();
async function seed() {
  for (const lesson of lessons) {
    if (lesson.kind !== "guided-first-solve") {
      const initial = practiceSetup(lesson.puzzle, lesson.algorithm);
      if (!practiceSolved(practiceApply(initial, lesson.algorithm)))
        throw new Error(`Invalid exercise ${lesson.id}`);
    }
    await db.course.upsert({
      where: { id: lesson.id },
      create: {
        id: lesson.id,
        puzzle: lesson.puzzle,
        level: lesson.level,
        content: lesson as unknown as Prisma.InputJsonValue,
        published: true,
      },
      // Initialization must not overwrite persistent operator edits or silently
      // change the version of a course used by an in-progress lesson session.
      update: {},
    });
  }
  await db.setting.upsert({
    where: { key: "tested-devices" },
    create: { key: "tested-devices", value: [] },
    update: {},
  });
  await db.setting.upsert({
    where: { key: "sponsors-enabled" },
    create: { key: "sponsors-enabled", value: false },
    update: {},
  });
  console.log(
    `Stored ${lessons.length} authored bilingual lessons; no users or engagement were seeded.`,
  );
}
seed().finally(() => db.$disconnect());
