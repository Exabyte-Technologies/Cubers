/** Claims only: this module does not authenticate producer identities/signatures. */
import { z } from "zod";
export const AI_METADATA_LIMIT = 32768;
const field = z
  .string()
  .max(4096)
  .refine((s) => !/[\u0000-\u001f\u007f-\u009f]/.test(s));
const Fields = z.object({
  Label: z.enum(["1", "2", "3"]),
  ContentProducer: field,
  ProduceID: field,
  ReservedCode1: field.default(""),
  ContentPropagator: field.default(""),
  PropagateID: field.default(""),
  ReservedCode2: field.default(""),
});
export type AiSourceClaim = z.infer<typeof Fields>;
export function invalidAiMetadata(): never {
  throw Error(
    "AI metadata is malformed, ambiguous or exceeds supported bounds",
  );
}
export function readAiClaimText(
  text: string,
  required = false,
): AiSourceClaim[] {
  if (Buffer.byteLength(text) > AI_METADATA_LIMIT) invalidAiMetadata();
  if (/c2pa|jumbf/i.test(text))
    throw Error(
      "Content credentials require a preservation-capable import path",
    );
  const xmlAt = text.search(/<[A-Za-z_][\w:.-]*(?:\s|>)/),
    jsonAt = text.indexOf("{");
  // Decode an XML envelope once. Literal entity text inside plain JSON is data.
  if (xmlAt >= 0 && (jsonAt < 0 || xmlAt < jsonAt))
    text = text.replace(/&([^;\s<&]+);/g, (_, entity: string) => {
      const predefined: Record<string, string> = {
        quot: '"',
        apos: "'",
        lt: "<",
        gt: ">",
        amp: "&",
      };
      if (Object.hasOwn(predefined, entity)) return predefined[entity];
      const point = /^#x[0-9a-f]+$/i.test(entity)
        ? parseInt(entity.slice(2), 16)
        : /^#[0-9]+$/.test(entity)
          ? Number(entity.slice(1))
          : NaN;
      if (
        !Number.isInteger(point) ||
        point > 0x10ffff ||
        (point >= 0xd800 && point <= 0xdfff) ||
        (point & 0xffff) >= 0xfffe ||
        (point < 32 && ![9, 10, 13].includes(point))
      )
        invalidAiMetadata();
      return String.fromCodePoint(point);
    });
  const result: AiSourceClaim[] = [],
    start = /\{\s*("(?:[^"\\]|\\.)*")\s*:/g;
  for (let match; (match = start.exec(text));) {
    let firstKey: string;
    try {
      firstKey = JSON.parse(match[1]);
    } catch {
      continue;
    }
    if (firstKey !== "AIGC") continue;
    let depth = 0,
      quoted = false,
      escaped = false,
      stringAt = -1,
      end = -1;
    const names: Set<string>[] = [];
    for (
      let p = match.index;
      p < text.length && p - match.index <= AI_METADATA_LIMIT;
      p++
    ) {
      const c = text[p];
      if (quoted) {
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === '"') {
          quoted = false;
          let next = p + 1;
          while (/\s/.test(text[next] ?? "") && next < text.length) next++;
          if (text[next] === ":") {
            let key: string;
            try {
              key = JSON.parse(text.slice(stringAt, p + 1));
            } catch {
              invalidAiMetadata();
            }
            if (!names[depth] || names[depth].has(key!)) invalidAiMetadata();
            names[depth].add(key!);
          }
        }
      } else if (c === '"') {
        quoted = true;
        stringAt = p;
      } else if (c === "{") {
        if (++depth > 4) invalidAiMetadata();
        names[depth] = new Set();
      } else if (c === "}" && --depth === 0) {
        end = p + 1;
        break;
      }
    }
    if (end < 0) invalidAiMetadata();
    try {
      result.push(Fields.parse(JSON.parse(text.slice(match.index, end)).AIGC));
    } catch {
      invalidAiMetadata();
    }
    start.lastIndex = end;
  }
  if (!result.length && (required || /AIGC/i.test(text))) invalidAiMetadata();
  return result;
}
export function readAiClaimPacket(
  bytes: Buffer,
  required = false,
): AiSourceClaim[] {
  if (bytes.length > AI_METADATA_LIMIT) invalidAiMetadata();
  // Reject recognizable wide-encoded claims rather than dropping them. Known
  // typed UTF-16 video metadata is decoded separately before readAiClaimText.
  for (let offset = 0; offset < 2; offset++) {
    const wide = bytes.subarray(
      offset,
      bytes.length - ((bytes.length - offset) % 2),
    );
    if (
      /AIGC|c2pa|jumbf/i.test(wide.toString("utf16le")) ||
      /AIGC|c2pa|jumbf/i.test(Buffer.from(wide).swap16().toString("utf16le"))
    )
      invalidAiMetadata();
  }
  const claims = readAiClaimText(bytes.toString("utf8"), required);
  // Buffer's permissive UTF-8 decoding must never silently alter retained IDs.
  // Binary EXIF headers outside otherwise intact JSON need not be UTF-8.
  if (claims.some((c) => Object.values(c).some((v) => v.includes("\ufffd")))) {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      invalidAiMetadata();
    }
  }
  return claims;
}
export function uniqueAiClaim(claims: AiSourceClaim[]): AiSourceClaim | null {
  if (claims.some((c) => JSON.stringify(c) !== JSON.stringify(claims[0])))
    invalidAiMetadata();
  return claims[0] ?? null;
}
export function aiPropagationJson(source: AiSourceClaim, mediaId: string) {
  const json = JSON.stringify({
    AIGC: {
      ...Fields.parse(source),
      ContentPropagator: "Cubers",
      PropagateID: mediaId,
      ReservedCode2: "",
    },
  }).replace(
    /[\u007f-\uffff]/g,
    (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
  );
  if (Buffer.byteLength(json) > AI_METADATA_LIMIT - 512) invalidAiMetadata();
  return json;
}
