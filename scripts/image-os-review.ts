/** Offline OS advisory comparison. Never uploads an image or its inventory. */
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, stat } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
const execute = promisify(execFile),
  name = /^(?:[a-z0-9]|\.[a-z0-9])[a-z0-9+._-]{0,120}$/,
  version = /^[0-9][A-Za-z0-9.+~:_-]{0,119}$/;
export type InstalledPackage = {
  source: string;
  sourceVersion: string;
  binary: string;
  binaryVersion: string;
};
export type Candidate = {
  source: string;
  installed: string;
  issue: string;
  fixed?: string;
  state: "fixed-version" | "unfixed" | "undetermined";
  urgency: string;
};
function pair(
  source: string,
  sourceVersion: string,
  binary: string,
  binaryVersion: string,
): InstalledPackage {
  if (
    !name.test(source) ||
    !name.test(binary) ||
    !version.test(sourceVersion) ||
    !version.test(binaryVersion)
  )
    throw Error("Unsafe or unsupported package inventory");
  return { source, sourceVersion, binary, binaryVersion };
}
export function debianInventory(text: string) {
  return text
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      const fields = line.split("\t");
      if (fields.length !== 5) throw Error("Malformed Debian inventory");
      if (fields[0] !== "installed") return [];
      return [pair(fields[1], fields[2], fields[3], fields[4])];
    });
}
export function alpineInventory(text: string) {
  return text
    .trim()
    .split(/\n\n+/)
    .filter(Boolean)
    .map((block) => {
      const fields = new Map(
        block
          .split("\n")
          .filter((line) => /^[A-Za-z]:/.test(line))
          .map((line) => [line[0], line.slice(2)]),
      );
      return pair(
        fields.get("o") || fields.get("P") || "",
        fields.get("V") || "",
        fields.get("P") || "",
        fields.get("V") || "",
      );
    });
}
export function osIdentity(text: string) {
  const get = (key: string) =>
    text
      .split("\n")
      .find((line) => line.startsWith(key + "="))
      ?.slice(key.length + 1)
      .replace(/^"(.*)"$/, "$1");
  const id = get("ID"),
    release =
      id === "debian"
        ? get("VERSION_CODENAME")
        : get("VERSION_ID")?.match(/^([0-9]+\.[0-9]+)(?:\.[0-9]+)?$/)?.[1];
  if (
    !["debian", "alpine"].includes(id || "") ||
    !release ||
    !/^[a-z0-9.]+$/.test(release)
  )
    throw Error("Unsupported distribution");
  return { id: id as "debian" | "alpine", release };
}
const issueId = /^(?:CVE-[0-9]{4}-[0-9]{4,}|TEMP-[A-Z0-9-]+)$/;
export function debianCandidates(
  packages: InstalledPackage[],
  data: any,
  release: string,
) {
  const candidates: Candidate[] = [],
    unlisted = new Set<string>();
  let missingRelease = 0;
  for (const item of new Map(
    packages.map((p) => [p.source + "@" + p.sourceVersion, p]),
  ).values()) {
    const advisories = data[item.source];
    if (!advisories) {
      unlisted.add(item.source);
      continue;
    }
    if (typeof advisories !== "object" || Array.isArray(advisories))
      throw Error("Malformed Debian advisory source");
    for (const [issue, raw] of Object.entries(advisories)) {
      if (!issueId.test(issue)) throw Error("Unsupported advisory identifier");
      const row = (raw as any)?.releases?.[release];
      if (!row) {
        missingRelease++;
        continue;
      }
      const urgency =
        typeof row.urgency === "string" ? row.urgency.slice(0, 80) : "unknown";
      if (row.fixed_version !== undefined) {
        if (
          typeof row.fixed_version !== "string" ||
          !version.test(row.fixed_version)
        )
          throw Error("Unsupported fixed version");
        candidates.push({
          source: item.source,
          installed: item.sourceVersion,
          issue,
          fixed: row.fixed_version,
          state: "fixed-version",
          urgency,
        });
      } else if (["open", "undetermined"].includes(row.status))
        candidates.push({
          source: item.source,
          installed: item.sourceVersion,
          issue,
          state: row.status === "open" ? "unfixed" : "undetermined",
          urgency,
        });
      else throw Error("Advisory status lacks an assessable fixed version");
    }
  }
  return { candidates, unlisted: [...unlisted].sort(), missingRelease };
}
export function alpineCandidates(
  packages: InstalledPackage[],
  feeds: any[],
  release: string,
) {
  const candidates: Candidate[] = [],
    sources = new Map<string, any[]>();
  for (const feed of feeds) {
    if (feed.distroversion !== "v" + release || !Array.isArray(feed.packages))
      throw Error("Wrong Alpine advisory release");
    for (const row of feed.packages) {
      const p = row?.pkg;
      if (
        !p ||
        typeof p.name !== "string" ||
        !name.test(p.name) ||
        typeof p.secfixes !== "object" ||
        !p.secfixes
      )
        throw Error("Malformed Alpine advisory");
      sources.set(p.name, [...(sources.get(p.name) || []), p]);
    }
  }
  const unlisted = new Set<string>();
  for (const item of new Map(
    packages.map((p) => [p.source + "@" + p.sourceVersion, p]),
  ).values()) {
    const rows = sources.get(item.source);
    if (!rows) {
      unlisted.add(item.source);
      continue;
    }
    for (const row of rows)
      for (const [fixed, issues] of Object.entries(row.secfixes)) {
        if (
          !version.test(fixed) ||
          !Array.isArray(issues) ||
          issues.some((issue) => typeof issue !== "string")
        )
          throw Error("Malformed Alpine fixes");
        for (const entry of issues as string[]) {
          const ids = entry
            .split(/\s+/)
            .filter((part) => part.startsWith("CVE-"));
          for (const issue of ids) {
            if (!issueId.test(issue)) throw Error("Unsupported Alpine issue");
            candidates.push({
              source: item.source,
              installed: item.sourceVersion,
              issue,
              fixed,
              state: "fixed-version",
              urgency: "not supplied by Alpine secdb",
            });
          }
        }
      }
  }
  return { candidates, unlisted: [...unlisted].sort(), missingRelease: 0 };
}
const container = [
  "run",
  "--rm",
  "--pull=never",
  "--network",
  "none",
  "--read-only",
  "--cap-drop",
  "ALL",
  "--security-opt",
  "no-new-privileges:true",
  "--pids-limit",
  "64",
  "--memory",
  "512m",
  "--cpus",
  "1",
];
async function inside(image: string, entry: string, args: string[]) {
  const owned = "cubers-os-review-" + randomUUID();
  try {
    return await execute(
      "docker",
      [...container, "--name", owned, "--entrypoint", entry, image, ...args],
      { encoding: "utf8", timeout: 60000, maxBuffer: 4 * 1024 * 1024 },
    );
  } finally {
    await execute("docker", ["rm", "-f", "-v", owned], {
      timeout: 10000,
    }).catch(() => {});
  }
}
async function compare(
  image: string,
  id: "debian" | "alpine",
  candidates: Candidate[],
) {
  const rows = candidates
    .map((c, index) => ({ c, index }))
    .filter((row) => row.c.fixed !== undefined);
  if (rows.length > 30000) throw Error("Advisory comparison bound exceeded");
  const command =
    id === "debian"
      ? String.raw`if dpkg --compare-versions "$installed" lt "$fixed"; then printf '%s\n' "$id"; else code=$?; [ "$code" -eq 1 ] || exit 2; fi`
      : String.raw`result=$(apk version --test "$installed" "$fixed") || exit 2; case "$result" in '<') printf '%s\n' "$id";; '='|'>') :;; *) exit 2;; esac`;
  const code = String.raw`set -eu
while IFS="$(printf '\t')" read -r id installed fixed; do
${command}
done`;
  const owned = "cubers-os-review-" + randomUUID();
  const child = spawn(
    "docker",
    [
      ...container,
      "-i",
      "--name",
      owned,
      "--entrypoint",
      "/bin/sh",
      image,
      "-c",
      code,
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  let out = "",
    errors = "";
  const timer = setTimeout(() => child.kill("SIGTERM"), 60000);
  child.stdout.on("data", (b) => {
    out += b;
    if (out.length > 1024 * 1024) child.kill("SIGTERM");
  });
  child.stderr.on("data", (b) => {
    errors += b;
    if (errors.length > 65536) child.kill("SIGTERM");
  });
  const finished = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (status) =>
      status === 0 && !errors
        ? resolve()
        : reject(Error("Native version comparison failed")),
    );
  });
  child.stdin.on("error", () => {});
  child.stdin.end(
    rows
      .map(({ c, index }) => `${index}\t${c.installed}\t${c.fixed}\n`)
      .join(""),
  );
  try {
    await finished;
  } finally {
    clearTimeout(timer);
    await execute("docker", ["rm", "-f", "-v", owned], {
      timeout: 10000,
    }).catch(() => {});
  }
  const ids = out.trim() ? out.trim().split("\n") : [];
  if (
    ids.some(
      (value) => !/^\d+$/.test(value) || !candidates[Number(value)]?.fixed,
    ) ||
    new Set(ids).size !== ids.length
  )
    throw Error("Malformed comparison response");
  const affected = new Set(ids.map(Number));
  return candidates.filter(
    (c, index) => c.state !== "fixed-version" || affected.has(index),
  );
}
export async function reviewImages(
  images: Record<string, string>,
  dataDirectory: string,
) {
  const roles = [
    "api",
    "admin",
    "web",
    "documents",
    "migrations",
    "recovery",
    "proxy",
    "postgres",
    "redis",
  ];
  if (
    !images ||
    Array.isArray(images) ||
    !Object.keys(images).length ||
    Object.keys(images).some((role) => !roles.includes(role)) ||
    Object.values(images).some(
      (image) =>
        typeof image !== "string" ||
        !/^[A-Za-z0-9][A-Za-z0-9._/:@-]{0,250}$/.test(image),
    )
  )
    throw Error("Use explicit local release images");
  const databases = new Map<string, any>(),
    advisories: Record<string, unknown> = {};
  async function data(file: string) {
    if (databases.has(file)) return databases.get(file);
    const path = join(dataDirectory, file);
    if ((await stat(path)).size > 128 * 1024 * 1024)
      throw Error("Advisory data bound exceeded");
    const raw = await readFile(path);
    const parsed = JSON.parse(raw.toString("utf8"));
    databases.set(file, parsed);
    advisories[file] = {
      bytes: raw.length,
      sha256: createHash("sha256").update(raw).digest("hex"),
    };
    return parsed;
  }
  const results: any[] = [];
  for (const [role, image] of Object.entries(images)) {
    const metadata = JSON.parse(
      (
        await execute(
          "docker",
          ["image", "inspect", "--format", "{{json .Id}}", image],
          { encoding: "utf8", timeout: 30000 },
        )
      ).stdout.trim(),
    );
    if (!/^sha256:[a-f0-9]{64}$/.test(metadata))
      throw Error("Invalid image identity");
    const os = osIdentity(
      (await inside(metadata, "/bin/cat", ["/etc/os-release"])).stdout,
    );
    const packages =
      os.id === "debian"
        ? debianInventory(
            (
              await inside(metadata, "dpkg-query", [
                "-W",
                "-f=${db:Status-Status}\t${source:Package}\t${source:Version}\t${Package}\t${Version}\n",
              ])
            ).stdout,
          )
        : alpineInventory(
            (await inside(metadata, "/bin/cat", ["/lib/apk/db/installed"]))
              .stdout,
          );
    if (!packages.length || packages.length > 5000)
      throw Error("Invalid inventory bound");
    const candidates =
      os.id === "debian"
        ? debianCandidates(
            packages,
            await data("debian-security.json"),
            os.release,
          )
        : alpineCandidates(
            packages,
            await Promise.all(
              ["main", "community"].map((repo) =>
                data(`alpine-v${os.release}-${repo}.json`),
              ),
            ),
            os.release,
          );
    const findings = await compare(metadata, os.id, candidates.candidates);
    const runtimeCommands: Record<string, [string, string[]]> = {
      api: ["node", ["--version"]],
      migrations: ["node", ["--version"]],
      recovery: ["node", ["--version"]],
      documents: ["pdftoppm", ["-v"]],
      admin: ["nginx", ["-v"]],
      web: ["nginx", ["-v"]],
      proxy: ["caddy", ["version"]],
      postgres: ["postgres", ["--version"]],
      redis: ["redis-server", ["--version"]],
    };
    // File capabilities (for example Caddy's privileged-port capability) can
    // prevent execution with ALL capabilities dropped. Inventory and native
    // package comparison remain useful; never weaken isolation for this probe.
    let runtimeVersion: string | null = null;
    try {
      const runtime = await inside(metadata, ...runtimeCommands[role]);
      runtimeVersion = (runtime.stdout || runtime.stderr)
        .split("\n")[0]
        .slice(0, 300);
    } catch {
      // Keep exception text out of the report: command diagnostics are not a
      // runtime version and may contain host-specific paths.
    }
    results.push({
      role,
      requestedImage: image,
      imageId: metadata,
      os,
      packages,
      findings,
      comparison: {
        candidatePairs: candidates.candidates.length,
        unlistedSources: candidates.unlisted,
        missingReleaseRecords: candidates.missingRelease,
      },
      runtimeVersion,
      runtimeVersionVerified: runtimeVersion !== null,
    });
  }
  return {
    schema: 1,
    reviewedAt: new Date().toISOString(),
    productionApproved: false,
    networkDuringInventory: "none",
    advisoryData: advisories,
    images: results,
    summary: {
      images: results.length,
      fixable: results.reduce(
        (n, r) => n + r.findings.filter((f: Candidate) => !!f.fixed).length,
        0,
      ),
      unfixed: results.reduce(
        (n, r) =>
          n + r.findings.filter((f: Candidate) => f.state === "unfixed").length,
        0,
      ),
      undetermined: results.reduce(
        (n, r) =>
          n +
          r.findings.filter((f: Candidate) => f.state === "undetermined")
            .length,
        0,
      ),
    },
    limits: [
      "No project/npm inventory upload or npm audit",
      "Distribution advisory comparison only; no proof of exploitability or absence of vulnerabilities",
      "Alpine secdb lists fixes and does not establish the complete set of unfixed issues",
      "Alpine non-CVE advisory identifiers are outside this comparison",
      "Unlisted sources and missing release records are not evidence of safety",
      "Bundled runtimes, statically linked libraries, application dependencies, image signatures and provenance require separate review",
      "Advisory hashes identify the supplied snapshot; no cryptographic publisher signature or freshness guarantee is inferred",
    ],
  };
}
if (require.main === module)
  void (async () => {
    const [imagesFile, dataDirectory, output, ...extra] = process.argv.slice(2);
    if (!imagesFile || !dataDirectory || !output || extra.length)
      throw Error(
        "Use image-os-review.ts IMAGES.json ADVISORY_DIRECTORY OUTPUT.json",
      );
    const result = await reviewImages(
      JSON.parse(await readFile(imagesFile, "utf8")),
      dataDirectory,
    );
    await writeFile(output, JSON.stringify(result, null, 2), {
      mode: 0o600,
      flag: "wx",
    });
    console.log(JSON.stringify(result.summary));
    if (
      result.summary.fixable ||
      result.summary.unfixed ||
      result.summary.undetermined
    )
      process.exitCode = 1;
  })().catch(() => {
    console.error(
      "Local image OS review failed; inspect explicit image selection, advisory data and local Docker access. No private inventory is uploaded.",
    );
    process.exitCode = 2;
  });
