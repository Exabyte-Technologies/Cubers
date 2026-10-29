import { Directory, File, Paths } from "expo-file-system";
import { CardFileShares } from "./files";
const root = () => new Directory(Paths.cache, "cubers-card-shares-v1");
export const cardFileShares = new CardFileShares({
  async clear() {
    const directory = root();
    if (directory.exists) directory.delete();
  },
  async write(id, bytes) {
    const directory = new Directory(root(), id);
    directory.create({ intermediates: true, idempotent: true });
    const file = new File(directory, "cubers-milestone.png");
    file.write(bytes);
    return file.uri;
  },
  async remove(id) {
    const directory = new Directory(root(), id);
    if (directory.exists) directory.delete();
  },
  available: async () => {
    try {
      const sharing = await import("expo-sharing");
      return await sharing.isAvailableAsync();
    } catch {
      return false;
    }
  },
  share: async (uri) => {
    const sharing = await import("expo-sharing");
    await sharing.shareAsync(uri, {
      mimeType: "image/png",
      UTI: "public.png",
      dialogTitle: "Cubers",
    });
  },
  now: () => Date.now(),
});
