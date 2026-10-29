import { CardImage } from "@cubers/core";
export type ExportBinding = {
  cardId: string;
  imageDigest: string;
  preparedAt: number;
};
export const cardSharingError = (code: string, message: string) =>
  Object.assign(new Error(message), { code });
export function assertCardFresh(expected: ExportBinding, now: number) {
  if (
    !Number.isFinite(now) ||
    !Number.isFinite(expected.preparedAt) ||
    expected.preparedAt > now + 5000 ||
    now - expected.preparedAt > 60000
  )
    throw cardSharingError(
      "EXPIRED",
      "Prepare the approved image again before sharing",
    );
}
export function cleanCardBytes(
  value: unknown,
  expected: ExportBinding,
  now = Date.now(),
) {
  const packet = CardImage.parse(value);
  if (
    packet.watermarked ||
    packet.cardId !== expected.cardId ||
    packet.imageDigest !== expected.imageDigest ||
    packet.approvalDigest !== expected.imageDigest
  )
    throw cardSharingError(
      "INVALID",
      "Only the current approved image can be shared",
    );
  assertCardFresh(expected, now);
  const text = packet.base64,
    alphabet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  if (text.length % 4) throw Error("Invalid card encoding");
  const padding = text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0;
  const size = (text.length / 4) * 3 - padding;
  if (size < 45 || size > 500000) throw Error("Invalid card size");
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (let i = 0; i < text.length; i += 4) {
    const a = alphabet.indexOf(text[i]),
      b = alphabet.indexOf(text[i + 1]),
      c = text[i + 2] === "=" ? 0 : alphabet.indexOf(text[i + 2]),
      d = text[i + 3] === "=" ? 0 : alphabet.indexOf(text[i + 3]);
    bytes[offset++] = (a << 2) | (b >> 4);
    if (offset < size) bytes[offset++] = ((b & 15) << 4) | (c >> 2);
    if (offset < size) bytes[offset++] = ((c & 3) << 6) | d;
    if (
      i + 4 === text.length &&
      ((padding === 2 && b & 15) || (padding === 1 && c & 3))
    )
      throw Error("Noncanonical card encoding");
  }
  const data = new DataView(bytes.buffer);
  if (
    [137, 80, 78, 71, 13, 10, 26, 10].some((v, i) => bytes[i] !== v) ||
    data.getUint32(8) !== 13 ||
    data.getUint32(12) !== 0x49484452 ||
    data.getUint32(16) !== 1200 ||
    data.getUint32(20) !== 1500 ||
    data.getUint32(size - 12) !== 0 ||
    data.getUint32(size - 8) !== 0x49454e44
  )
    throw Error("Invalid PNG card");
  return { packet, bytes };
}
