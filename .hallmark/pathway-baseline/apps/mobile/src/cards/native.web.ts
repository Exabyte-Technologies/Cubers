import { cleanCardBytes, cardSharingError, type ExportBinding } from "./bytes";
let context: string | null = null;
const urls = new Map<string, ReturnType<typeof setTimeout>>();
function clear() {
  for (const [url, timer] of urls) {
    URL.revokeObjectURL(url);
    clearTimeout(timer);
  }
  urls.clear();
}
function file(value: unknown, expected: ExportBinding) {
  if (!context) throw Error("Sign in again before sharing");
  const { bytes, packet } = cleanCardBytes(value, expected);
  return new globalThis.File([bytes.buffer as ArrayBuffer], packet.filename, {
    type: packet.mime,
  });
}
export const cardFileShares = {
  setContext(key: string | null) {
    if (key !== context) {
      context = key;
      clear();
    }
  },
  async reset() {
    context = null;
    clear();
  },
  async prune() {
    clear();
  },
  share(value: unknown, expected: ExportBinding): Promise<void> {
    const image = file(value, expected);
    // This call stays in the final click's activation; no fetch/await precedes it.
    if (!navigator.share || !navigator.canShare?.({ files: [image] }))
      return Promise.reject(
        cardSharingError(
          "UNAVAILABLE",
          "File sharing is unavailable in this browser. Use Download PNG.",
        ),
      );
    return navigator
      .share({ files: [image], title: "Cubers" })
      .catch((error) => {
        if (error?.name !== "AbortError") throw error;
      });
  },
  async download(value: unknown, expected: ExportBinding) {
    const image = file(value, expected);
    while (urls.size >= 4) {
      const [old, timer] = urls.entries().next().value!;
      URL.revokeObjectURL(old);
      clearTimeout(timer);
      urls.delete(old);
    }
    const url = URL.createObjectURL(image);
    const link = document.createElement("a");
    link.href = url;
    link.download = image.name;
    link.rel = "noopener";
    urls.set(
      url,
      setTimeout(() => {
        URL.revokeObjectURL(url);
        urls.delete(url);
      }, 60000),
    );
    try {
      link.click();
    } catch (error) {
      clearTimeout(urls.get(url));
      URL.revokeObjectURL(url);
      urls.delete(url);
      throw error;
    }
  },
};
