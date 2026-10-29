import type { Readable } from "node:stream";

/** Collect bounded bytes before decoding: network chunks may split UTF-8. */
export async function limitedJsonResponse(
  stream: Readable,
  maxBytes = 1024 * 1024,
) {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > maxBytes) throw new Error("Response exceeded limit");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        Buffer.concat(chunks, bytes),
      ),
    );
  } catch {
    throw new Error("Invalid API response");
  }
}
