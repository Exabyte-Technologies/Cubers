import { constants } from "node:fs";
import { open, realpath, stat, unlink } from "node:fs/promises";
import { dirname, resolve, isAbsolute } from "node:path";
function error() {
  throw Error(
    "Use an absolute regular file owned by this operator, mode 0600, inside a private owned directory; symlinks and hard links are not allowed",
  );
}
async function parent(path: string) {
  if (!isAbsolute(path) || resolve(path) !== path) error();
  const dir = dirname(path),
    info = await stat(dir);
  if (
    (await realpath(dir)) !== dir ||
    !info.isDirectory() ||
    info.uid !== process.getuid?.() ||
    (info.mode & 0o077) !== 0
  )
    error();
}
export async function readStaffFile(path: string) {
  await parent(path);
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    if (
      !info.isFile() ||
      info.nlink !== 1 ||
      info.uid !== process.getuid?.() ||
      (info.mode & 0o777) !== 0o600 ||
      info.size > 16000
    )
      error();
    const bytes = Buffer.alloc(16001);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead > 16000) error();
    return {
      value: JSON.parse(
        bytes.subarray(0, bytesRead).toString("utf8"),
      ) as unknown,
      identity: { dev: info.dev, ino: info.ino },
    };
  } finally {
    await handle.close();
  }
}
export async function writeStaffFile(path: string, value: unknown) {
  await parent(path);
  const bytes = JSON.stringify(value, null, 2) + "\n";
  if (Buffer.byteLength(bytes) > 16000) error();
  const handle = await open(
    path,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}
export async function consumeStaffFile(
  path: string,
  identity: { dev: number; ino: number },
) {
  await parent(path);
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    if (
      info.dev !== identity.dev ||
      info.ino !== identity.ino ||
      info.nlink !== 1
    )
      error();
    await unlink(path);
  } finally {
    await handle.close();
  }
}
