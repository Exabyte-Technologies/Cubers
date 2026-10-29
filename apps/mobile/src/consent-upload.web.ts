import * as DocumentPicker from "expo-document-picker";
import { withTimeout } from "./timeout";
type Api = (path: string, body?: unknown) => Promise<any>;
export async function chooseConsent(api: Api): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "application/pdf",
    multiple: false,
    base64: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0],
    file = asset.file;
  try {
    if (!file || !file.size || file.size > 10 * 1024 * 1024)
      throw new Error(
        "Choose a PDF smaller than 10 MB · 请选择小于 10 MB 的 PDF",
      );
    const upload = await api("media", {
      purpose: "consent",
      type: "application/pdf",
      size: file.size,
    });
    const response = await withTimeout(
      (signal) =>
        fetch(upload.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/pdf" },
          body: file,
          signal,
        }),
      120000,
    );
    if (!response.ok) throw new Error("Private upload failed · 私密上传失败");
    await api(`media/${upload.id}/complete`, {});
    return upload.id;
  } finally {
    URL.revokeObjectURL(asset.uri);
  }
}
