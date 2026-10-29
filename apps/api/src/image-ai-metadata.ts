/** Bounded source-label preservation. Labels are claims, not authenticated origins. */
import { inflateSync } from "node:zlib";
import {
  AI_METADATA_LIMIT as MAX,
  invalidAiMetadata as invalid,
  readAiClaimPacket,
  uniqueAiClaim,
  aiPropagationJson,
  type AiSourceClaim,
} from "./media-ai-claims";
export type ImageAiMetadata = AiSourceClaim;
export function readImageAiMetadata(
  bytes: Buffer,
  type: string,
): ImageAiMetadata | null {
  const found: ImageAiMetadata[] = [];
  let budget = 0;
  const inspect = (part: Buffer) => {
    if ((budget += part.length) > 128 * 1024 || part.length > MAX) invalid();
    found.push(...readAiClaimPacket(part));
  };
  if (type === "image/png") {
    if (
      !bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      invalid();
    let at = 8,
      count = 0;
    while (at + 12 <= bytes.length) {
      if (++count > 4096) invalid();
      const size = bytes.readUInt32BE(at),
        end = at + 12 + size,
        name = bytes.toString("ascii", at + 4, at + 8);
      if (end > bytes.length) invalid();
      const data = bytes.subarray(at + 8, end - 4);
      if (name === "caBX")
        throw Error(
          "Content credentials require a preservation-capable import path",
        );
      if (["tEXt", "iTXt", "zTXt"].includes(name)) {
        const zero = data.indexOf(0);
        if (zero < 1 || zero > 79) invalid();
        const keyword = data.subarray(0, zero).toString("latin1");
        let value: Buffer;
        if (name === "tEXt") value = data.subarray(zero + 1);
        else if (name === "zTXt") {
          if (data[zero + 1] !== 0) invalid();
          value = inflateSync(data.subarray(zero + 2), {
            maxOutputLength: MAX,
          });
        } else {
          const flag = data[zero + 1];
          if (![0, 1].includes(flag) || data[zero + 2] !== 0) invalid();
          const languageEnd = data.indexOf(0, zero + 3),
            translatedEnd =
              languageEnd < 0 ? -1 : data.indexOf(0, languageEnd + 1);
          if (translatedEnd < 0) invalid();
          value = flag
            ? inflateSync(data.subarray(translatedEnd + 1), {
                maxOutputLength: MAX,
              })
            : data.subarray(translatedEnd + 1);
        }
        inspect(Buffer.concat([Buffer.from(keyword + " "), value]));
      } else if (name === "eXIf") inspect(data);
      if (name === "IEND") break;
      at = end;
    }
  } else if (type === "image/jpeg") {
    if (bytes[0] !== 255 || bytes[1] !== 216) invalid();
    let at = 2,
      count = 0;
    while (at < bytes.length) {
      if (++count > 4096 || bytes[at++] !== 255) invalid();
      while (bytes[at] === 255) at++;
      const marker = bytes[at++];
      if (marker === 218 || marker === 217) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (at + 2 > bytes.length) invalid();
      const size = bytes.readUInt16BE(at);
      if (size < 2 || at + size > bytes.length) invalid();
      if ([225, 235, 254].includes(marker))
        inspect(bytes.subarray(at + 2, at + size));
      at += size;
    }
  } else invalid();
  return uniqueAiClaim(found);
}
export function imageAiXmp(source: ImageAiMetadata, mediaId: string) {
  const json = aiPropagationJson(source, mediaId);
  const escaped = json
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
  const xmp = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:cubers="urn:cubers:aigc:1"><cubers:AIGC>${escaped}</cubers:AIGC></rdf:Description></rdf:RDF></x:xmpmeta>`;
  // Leave room for the JPEG XMP header or PNG text keyword on re-import.
  if (Buffer.byteLength(xmp) > MAX - 128) invalid();
  return xmp;
}
