import { ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import type { Db, Infrastructure } from "./services";
/** Drain the first remaining page; deleting objects invalidates list positions.
 * One bounded batch per account/run, repeated after exhaustion to
 * catch signed uploads finishing after database/media records were removed. */
export async function eraseAccountPrefixes(db: Db, infra: Infrastructure) {
  const jobs = await db.accountRemoval.findMany({
    where: { retryAt: { lte: new Date() } },
    orderBy: [{ retryAt: "asc" }, { id: "asc" }],
    take: 10,
  });
  for (const job of jobs) {
    const prefix = `${infra.config.REGION}/${job.id}/`;
    const page = await infra.storage.send(
      new ListObjectsV2Command({
        Bucket: infra.config.S3_BUCKET,
        Prefix: prefix,
        MaxKeys: 200,
      }),
    );
    const keys = (page.Contents || []).map((object) => {
      if (!object.Key || !object.Key.startsWith(prefix))
        throw Error("Storage deletion response crossed an account boundary");
      return object.Key;
    });
    if (keys.length) {
      const result = await infra.storage.send(
        new DeleteObjectsCommand({
          Bucket: infra.config.S3_BUCKET,
          Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
        }),
      );
      if (result.Errors?.length)
        throw Error("Account storage erasure is incomplete; retry required");
    }
    if (page.IsTruncated && !keys.length)
      throw Error("Storage deletion listing cannot make progress");
    if (!page.IsTruncated && !keys.length && job.expiresAt <= new Date())
      await db.accountRemoval.deleteMany({
        where: { id: job.id, expiresAt: { lte: new Date() } },
      });
    else
      await db.accountRemoval.updateMany({
        where: { id: job.id },
        data: {
          retryAt: new Date(Date.now() + 60000),
        },
      });
  }
}
