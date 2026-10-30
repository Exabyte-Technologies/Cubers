import { File } from "expo-file-system";
import { uploadNativeBinary } from "./native-binary-upload";
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
  const status = await uploadNativeBinary(upload.uploadUrl, file, "video/mp4");
  if (status < 200 || status >= 300)
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
