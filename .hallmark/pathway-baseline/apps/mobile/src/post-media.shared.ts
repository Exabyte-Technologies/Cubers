export type MediaDraft = { id: string; type: string; aiDeclared?: boolean };
export type MediaApi = (
  path: string,
  body?: unknown,
  method?: string,
) => Promise<any>;
export function selectedImageType(
  mime: string | undefined,
  filename: string | null | undefined,
) {
  if (mime === "image/jpeg" || mime === "image/png") return mime;
  if (!mime || mime === "application/octet-stream") {
    if (/\.jpe?g$/i.test(filename || "")) return "image/jpeg";
    if (/\.png$/i.test(filename || "")) return "image/png";
  }
  throw new Error(
    "Choose an original JPEG or PNG photo so its source labels can be checked · 请选择原始 JPEG 或 PNG 照片，以便检查来源标识",
  );
}
export function parsePostTags(input: string) {
  const tags = [
    ...new Set(
      input
        .split(/[\s,，]+/)
        .map((tag) => tag.replace(/^#/, "").normalize("NFC").toLowerCase())
        .filter(Boolean),
    ),
  ];
  if (
    tags.length > 5 ||
    tags.some((tag) => !/^[\p{L}\p{N}_-]{1,30}$/u.test(tag))
  )
    throw new Error(
      "Use up to five tags, with letters, numbers, _ or - · 最多五个标签，可用中英文字、数字、下划线或短横线",
    );
  return tags;
}
export function selectedVideoType(
  mime: string | undefined,
  filename: string | null | undefined,
) {
  if (mime === "video/mp4" || mime === "video/quicktime") return mime;
  if (!mime || mime === "application/octet-stream") {
    if (filename?.toLowerCase().endsWith(".mp4")) return "video/mp4";
    if (filename?.toLowerCase().endsWith(".mov")) return "video/quicktime";
  }
  throw new Error("Choose an MP4 or MOV video · 请选择 MP4 或 MOV 视频");
}
export function checkPostFile(
  type: string,
  size: number,
  duration?: number | null,
) {
  const video = type.startsWith("video/");
  if (
    !Number.isFinite(size) ||
    size <= 0 ||
    size > (video ? 50 : 10) * 1024 * 1024
  )
    throw new Error(
      video
        ? "Video must be smaller than 50 MB · 视频须小于 50 MB"
        : "Photo must be smaller than 10 MB · 照片须小于 10 MB",
    );
  if (video && duration != null && duration > 90000)
    throw new Error(
      "Choose a video of 90 seconds or less · 请选择不超过 90 秒的视频",
    );
}
