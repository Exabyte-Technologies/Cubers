import { File } from "expo-file-system";
import { fetch as nativeFetch } from "expo/fetch";
import { withTimeout } from "./timeout";
type Api = (path: string, body?: unknown, method?: string) => Promise<any>;
export async function uploadEvidence(
  api: Api,
  path: string,
  attemptId: string,
) {
  const file = new File(path.startsWith("file://") ? path : `file://${path}`);
  if (!file.exists || !file.size)
    throw new Error("Recording is no longer available");
  const upload = await api("media", {
    type: "video/mp4",
    size: file.size,
    purpose: "evidence",
    attemptId,
  });
  const response = await withTimeout(
    (signal) =>
      nativeFetch(upload.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": "video/mp4" },
        signal,
      }),
    120000,
  );
  if (!response.ok)
    throw new Error(
      "Recording upload failed. Keep the app open and try again.",
    );
  await api(`media/${upload.id}/complete`, {});
  return upload.id as string;
}
export function deleteRecording(path: string) {
  const file = new File(path.startsWith("file://") ? path : `file://${path}`);
  if (file.exists) file.delete();
}
