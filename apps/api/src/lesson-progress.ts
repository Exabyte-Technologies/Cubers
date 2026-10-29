import type { Prisma } from "@prisma/client";
export async function saveLessonProgress(
  tx: Prisma.TransactionClient,
  userId: string,
  id: string,
  moves: string[],
  courseVersion: number,
) {
  const previous = await tx.progress.findUnique({
    where: { userId_lessonId: { userId, lessonId: id } },
  });
  const repetitions = (previous?.repetitions || 0) + 1;
  return tx.progress.upsert({
    where: { userId_lessonId: { userId, lessonId: id } },
    create: {
      userId,
      lessonId: id,
      moves,
      courseVersion,
      completed: true,
      repetitions,
      reviewAt: new Date(Date.now() + 86400000),
    },
    update: {
      moves,
      courseVersion,
      completed: true,
      repetitions,
      lastPracticedAt: new Date(),
      reviewAt: new Date(
        Date.now() + Math.min(30, 2 ** repetitions) * 86400000,
      ),
    },
  });
}
