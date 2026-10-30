import type { File } from "expo-file-system";
import {
  createUploadTask,
  FileSystemUploadType,
} from "expo-file-system/legacy";
import { withTimeout } from "./timeout";

/** Upload a selected native file without expo/fetch's Android header-pair bridge. */
export async function uploadNativeBinary(
  url: string,
  file: File,
  contentType: string,
): Promise<number> {
  const task = createUploadTask(url, file.uri, {
    httpMethod: "PUT",
    uploadType: FileSystemUploadType.BINARY_CONTENT,
    headers: { "Content-Type": contentType },
  });
  const result = await withTimeout(async (signal) => {
    let rejectTimeout: (reason: Error) => void = () => {};
    const timeout = new Promise<never>((_, reject) => {
      rejectTimeout = reject;
    });
    const onAbort = () => {
      void task.cancelAsync().catch(() => {});
      rejectTimeout(new Error("Upload timed out · 上传超时"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      return await Promise.race([task.uploadAsync(), timeout]);
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  }, 120000);
  return result?.status ?? 0;
}
