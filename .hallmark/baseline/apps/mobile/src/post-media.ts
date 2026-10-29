import * as ImagePicker from "expo-image-picker";
import { File, Paths } from "expo-file-system";
import { fetch as nativeFetch } from "expo/fetch";
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
    allowsEditing: false,
    allowsMultipleSelection: false,
    exif: false,
    base64: false,
    quality: 1,
    videoExportPreset: ImagePicker.VideoExportPreset.Passthrough,
    shouldDownloadFromNetwork: true,
    preferredAssetRepresentationMode:
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
  });
  if (result.canceled) return null;
  const asset = result.assets[0],
    owned: File[] = [];
  let id: string | undefined;
  try {
    // Keep selected media bytes for server-side label-aware processing.
    // OS picker fallback and other formats still require native acceptance.
    const uri = asset.uri,
      type =
        kind === "image"
          ? selectedImageType(asset.mimeType, asset.fileName || asset.uri)
          : selectedVideoType(asset.mimeType, asset.fileName || asset.uri);
    const file = new File(
      Paths.cache,
      `cubers-post-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    new File(uri).copy(file);
    owned.push(file);
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
        nativeFetch(upload.uploadUrl, {
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
    if (asset.uri.startsWith(Paths.cache.uri)) owned.push(new File(asset.uri));
    for (const file of owned) {
      try {
        if (file.exists) file.delete();
      } catch {}
    }
  }
}
