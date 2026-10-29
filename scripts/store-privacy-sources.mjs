// Local worksheet references only. Never collect a credential or private file.
export function privacySources(flows) {
  if (!Array.isArray(flows)) throw Error("Privacy flows must be an array");
  const sources = new Set();
  for (const flow of flows) {
    if (!flow || typeof flow !== "object") throw Error("Invalid privacy flow");
    if (
      flow.additionalSources !== undefined &&
      (!Array.isArray(flow.additionalSources) ||
        flow.additionalSources.length > 16)
    )
      throw Error("Invalid additional privacy sources");
    for (const source of [flow.source, ...(flow.additionalSources || [])]) {
      if (
        typeof source !== "string" ||
        !/^(apps|packages|docs|store)\//.test(source) ||
        source
          .split("/")
          .some(
            (part) =>
              !part || part === "." || part === ".." || part.startsWith("."),
          ) ||
        /[\\\x00-\x1f]/.test(source)
      )
        throw Error("Privacy sources must reference a public workspace source");
      sources.add(source);
    }
  }
  return [...sources];
}
