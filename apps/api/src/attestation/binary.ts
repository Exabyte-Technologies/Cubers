// Bounded formats used by App Attest, not a general CBOR/ASN.1 implementation.
export class AttestationError extends Error {
  constructor(public readonly code: string) {
    super("App integrity verification failed");
    this.name = "AttestationError";
  }
}
export function requireIntegrity(value: unknown, code: string): asserts value {
  if (!value) throw new AttestationError(code);
}
export function base64(value: unknown, maximum = 32768): Buffer {
  requireIntegrity(
    typeof value === "string" &&
      value.length > 0 &&
      value.length <= Math.ceil(maximum / 3) * 4,
    "encoding",
  );
  requireIntegrity(
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    ),
    "encoding",
  );
  const bytes = Buffer.from(value, "base64");
  requireIntegrity(
    bytes.length <= maximum && bytes.toString("base64") === value,
    "encoding",
  );
  return bytes;
}
export type Cbor =
  number | string | Buffer | Cbor[] | Map<string | number, Cbor>;
export function cborItem(
  input: Buffer,
  start = 0,
): { value: Cbor; end: number } {
  requireIntegrity(
    input.length <= 32768 && start >= 0 && start < input.length,
    "cbor",
  );
  let at = start,
    items = 0;
  const read = (depth: number): Cbor => {
    requireIntegrity(depth <= 8 && ++items <= 256 && at < input.length, "cbor");
    const first = input[at++],
      major = first >> 5,
      additional = first & 31;
    requireIntegrity(major <= 5 && additional <= 26, "cbor");
    let size = additional;
    if (additional >= 24) {
      const width = 1 << (additional - 24);
      requireIntegrity(at + width <= input.length, "cbor");
      size = input.readUIntBE(at, width);
      at += width;
      requireIntegrity(
        size >= (width === 1 ? 24 : width === 2 ? 256 : 65536),
        "cbor",
      );
    }
    if (major <= 1) return major === 0 ? size : -1 - size;
    if (major <= 3) {
      requireIntegrity(size <= 32768 && at + size <= input.length, "cbor");
      const bytes = input.subarray(at, at + size);
      at += size;
      if (major === 2) return bytes;
      const value = bytes.toString("utf8");
      requireIntegrity(Buffer.from(value, "utf8").equals(bytes), "cbor");
      return value;
    }
    requireIntegrity(size <= 128, "cbor");
    if (major === 4) return Array.from({ length: size }, () => read(depth + 1));
    const map = new Map<string | number, Cbor>();
    for (let i = 0; i < size; i++) {
      const key = read(depth + 1);
      requireIntegrity(
        (typeof key === "string" || typeof key === "number") && !map.has(key),
        "cbor",
      );
      map.set(key, read(depth + 1));
    }
    return map;
  };
  const value = read(0);
  return { value, end: at };
}
export function cbor(input: Buffer): Cbor {
  const item = cborItem(input);
  requireIntegrity(item.end === input.length, "cbor");
  return item.value;
}
export function cborMap(value: Cbor): Map<string | number, Cbor> {
  requireIntegrity(value instanceof Map, "cbor");
  return value;
}
export type Der = { tag: number; value: Buffer };
export function derItems(input: Buffer): Der[] {
  requireIntegrity(input.length <= 32768, "der");
  const result: Der[] = [];
  for (let at = 0; at < input.length;) {
    requireIntegrity(result.length < 128 && at + 2 <= input.length, "der");
    const tag = input[at++];
    requireIntegrity((tag & 31) !== 31, "der");
    let size = input[at++];
    if (size & 128) {
      const width = size & 127;
      requireIntegrity(
        width >= 1 &&
          width <= 3 &&
          at + width <= input.length &&
          input[at] !== 0,
        "der",
      );
      size = input.readUIntBE(at, width);
      at += width;
      requireIntegrity(size >= 128, "der");
    }
    requireIntegrity(at + size <= input.length, "der");
    result.push({ tag, value: input.subarray(at, at + size) });
    at += size;
  }
  return result;
}
export function derOnly(input: Buffer, tag: number): Buffer {
  const values = derItems(input);
  requireIntegrity(values.length === 1 && values[0].tag === tag, "der");
  return values[0].value;
}
