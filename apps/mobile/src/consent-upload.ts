import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { uploadNativeBinary } from "./native-binary-upload";
type Api = (path: string, body?: unknown) => Promise<any>;
export async function chooseConsent(api: Api): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "application/pdf",
    multiple: false,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const file = new File(result.assets[0].uri);
  try {
    if (!file.size || file.size > 10 * 1024 * 1024)
      throw new Error(
        "Choose a PDF smaller than 10 MB · 请选择小于 10 MB 的 PDF",
      );
    const upload = await api("media", {
      purpose: "consent",
      type: "application/pdf",
      size: file.size,
    });
    const status = await uploadNativeBinary(
      upload.uploadUrl,
      file,
      "application/pdf",
    );
    if (status < 200 || status >= 300)
      throw new Error("Private upload failed · 私密上传失败");
    await api(`media/${upload.id}/complete`, {});
    return upload.id;
  } finally {
    if (file.exists) file.delete();
  }
}
