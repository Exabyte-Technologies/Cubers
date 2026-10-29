import * as ImagePicker from "expo-image-picker";
import { withTimeout } from "./timeout";
import {
  checkPostFile,
  selectedImageType,
  selectedVideoType,
  type MediaApi,
  type MediaDraft,
} from "./post-media.shared";
export async function choosePostMedia(
  api: MediaApi,
  kind: "image" | "video",
  aiDeclared = false,
): Promise<MediaDraft | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: kind === "image" ? ["images"] : ["videos"],
    allowsMultipleSelection: false,
    base64: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0],
    file = asset.file;
  let id: string | undefined;
  try {
    if (!file)
      throw new Error("Could not read the selected file · 无法读取所选文件");
    const type =
      kind === "video"
        ? selectedVideoType(file.type, file.name)
        : selectedImageType(file.type, file.name);
    checkPostFile(type, file.size, asset.duration);
    const upload = await api("media", {
      purpose: "post",
      type,
      size: file.size,
      aiDeclared,
    });
    id = upload.id;
    const response = await withTimeout(
      (signal) =>
        fetch(upload.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": type },
          body: file,
          signal,
        }),
      120000,
    );
    if (!response.ok) throw new Error("Upload failed · 上传失败");
    await api(`media/${id}/complete`, {});
    return { id: id!, type, aiDeclared };
  } catch (error) {
    if (id) await api(`media/${id}`, undefined, "DELETE").catch(() => {});
    throw error;
  } finally {
    if (asset.uri.startsWith("blob:")) URL.revokeObjectURL(asset.uri);
  }
}
