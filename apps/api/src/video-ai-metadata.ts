/** Bounded BMFF metadata reader. Encoded media samples are never searched. */
import {
  AI_METADATA_LIMIT,
  invalidAiMetadata as invalid,
  readAiClaimPacket,
  readAiClaimText,
  uniqueAiClaim,
  type AiSourceClaim,
} from "./media-ai-claims";
type Box = { name: string; at: number; body: number; end: number };
const containers = new Set([
  "moov",
  "trak",
  "mdia",
  "minf",
  "stbl",
  "edts",
  "mvex",
  "moof",
  "traf",
  "mfra",
  "tref",
]);
const C2PA_UUID = Buffer.from("d8fec3d61b0e483c92975828877ec481", "hex");
export function readVideoAiMetadata(bytes: Buffer): AiSourceClaim | null {
  const claims: AiSourceClaim[] = [];
  let count = 0,
    budget = 0;
  const charge = (size: number) => {
    if (size > AI_METADATA_LIMIT || (budget += size) > 128 * 1024) invalid();
  };
  function boxes(at: number, end: number): Box[] {
    const result: Box[] = [];
    while (at < end) {
      if (++count > 8192 || end - at < 8) invalid();
      let size = bytes.readUInt32BE(at),
        header = 8;
      if (size === 1) {
        if (end - at < 16) invalid();
        const big = bytes.readBigUInt64BE(at + 8);
        if (big > BigInt(end - at)) invalid();
        size = Number(big);
        header = 16;
      } else if (size === 0) size = end - at;
      if (size < header || size > end - at) invalid();
      result.push({
        name: bytes.toString("latin1", at + 4, at + 8),
        at,
        body: at + header,
        end: at + size,
      });
      at += size;
    }
    return result;
  }
  function packet(part: Buffer, name = "", encoding = 1) {
    charge(part.length + Buffer.byteLength(name));
    if (/c2pa|jumbf/i.test(name))
      throw Error(
        "Content credentials require a preservation-capable import path",
      );
    const required = /AIGC/i.test(name);
    if (encoding === 2) {
      let text: string;
      try {
        text = new TextDecoder("utf-16be", { fatal: true }).decode(part);
      } catch {
        invalid();
      }
      claims.push(...readAiClaimText(text!, required));
    } else if (encoding === 0 || encoding === 1)
      claims.push(...readAiClaimPacket(part, required));
    else if (required) invalid();
  }
  function keys(box: Box) {
    charge(box.end - box.body);
    if (box.end - box.body < 8 || bytes.readUInt32BE(box.body) !== 0) invalid();
    const n = bytes.readUInt32BE(box.body + 4),
      result: string[] = [];
    if (n > 1024) invalid();
    let at = box.body + 8;
    for (let i = 0; i < n; i++) {
      if (box.end - at < 8) invalid();
      const size = bytes.readUInt32BE(at);
      if (size < 8 || size > box.end - at || size > 264) invalid();
      let key: string;
      try {
        key = new TextDecoder("utf-8", { fatal: true }).decode(
          bytes.subarray(at + 8, at + size),
        );
      } catch {
        invalid();
      }
      if (/c2pa|jumbf/i.test(key!))
        throw Error(
          "Content credentials require a preservation-capable import path",
        );
      result.push(key!);
      at += size;
    }
    if (at !== box.end) invalid();
    return result;
  }
  function itemList(box: Box, names: string[], depth: number) {
    if (depth > 12) invalid();
    const used = new Set<number>();
    for (const item of boxes(box.body, box.end)) {
      const index = bytes.readUInt32BE(item.at + 4);
      if (names.length && (index < 1 || index > names.length)) invalid();
      let name = names[index - 1] ?? item.name;
      const children = boxes(item.body, item.end);
      if (item.name === "----")
        for (const child of children) {
          if (["mean", "name"].includes(child.name)) {
            if (child.end - child.body < 4) invalid();
            const part = bytes.subarray(child.body + 4, child.end);
            charge(part.length);
            try {
              name +=
                " " + new TextDecoder("utf-8", { fatal: true }).decode(part);
            } catch {
              invalid();
            }
          }
        }
      const data = children.filter((child) => child.name === "data");
      if (/AIGC/i.test(name) && !data.length) invalid();
      if (/c2pa|jumbf/i.test(name))
        throw Error(
          "Content credentials require a preservation-capable import path",
        );
      for (const child of data) {
        if (child.end - child.body < 8) invalid();
        packet(
          bytes.subarray(child.body + 8, child.end),
          name,
          bytes.readUInt32BE(child.body) & 0xffffff,
        );
      }
      used.add(index);
    }
    if (names.some((name, i) => /AIGC/i.test(name) && !used.has(i + 1)))
      invalid();
  }
  function meta(box: Box, depth: number) {
    if (box.end - box.body < 4) invalid();
    // ISO FullBox and QuickTime's older non-FullBox meta representation.
    const at = bytes.readUInt32BE(box.body) === 0 ? box.body + 4 : box.body;
    const children = boxes(at, box.end),
      keyTables = children.filter((b) => b.name === "keys");
    if (keyTables.length > 1) invalid();
    const names = keyTables.length ? keys(keyTables[0]) : [];
    const lists = children.filter((b) => b.name === "ilst");
    if (names.some((name) => /AIGC/i.test(name)) && !lists.length) invalid();
    for (const child of children) {
      if (child.name === "ilst") itemList(child, names, depth + 1);
      else if (!["keys", "free", "ctry", "lang", "mhdr"].includes(child.name))
        visit(child, depth + 1, true);
    }
  }
  function visit(box: Box, depth: number, metadata = false) {
    if (depth > 12) invalid();
    if (["cmov", "bxml"].includes(box.name)) invalid();
    if (["c2pa", "jumb", "jumd"].includes(box.name))
      throw Error(
        "Content credentials require a preservation-capable import path",
      );
    if (box.name === "uuid") {
      if (box.end - box.body < 16) invalid();
      if (bytes.subarray(box.body, box.body + 16).equals(C2PA_UUID))
        throw Error(
          "Content credentials require a preservation-capable import path",
        );
      packet(bytes.subarray(box.body + 16, box.end));
    } else if (box.name === "meta") meta(box, depth + 1);
    else if (box.name === "ilst") itemList(box, [], depth + 1);
    else if (box.name === "udta" || containers.has(box.name))
      for (const child of boxes(box.body, box.end))
        visit(child, depth + 1, box.name === "udta");
    else if (metadata || ["AIGC", "XMP_", "hdlr"].includes(box.name))
      packet(bytes.subarray(box.body, box.end), box.name);
  }
  if (bytes.length < 8) invalid();
  for (const box of boxes(0, bytes.length)) visit(box, 0);
  return uniqueAiClaim(claims);
}
