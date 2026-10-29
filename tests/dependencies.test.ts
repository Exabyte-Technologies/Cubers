import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  linkSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
const require = createRequire(import.meta.url),
  routerRequire = createRequire(require.resolve("expo-router/package.json"));
const query = routerRequire("query-string");
test("the SDK router retains its complete CommonJS query API with the official patched decoder", () => {
  const qs = routerRequire.resolve("query-string"),
    decoder = createRequire(qs).resolve("decode-uri-component");
  assert.equal(
    JSON.parse(
      readFileSync(join(resolve(decoder, ".."), "package.json"), "utf8"),
    ).version,
    "0.5.0",
  );
  assert.equal(
    query.stringify(
      { lesson: "你好", tag: ["R U", "F2"], empty: null, skip: undefined },
      { sort: false },
    ),
    "lesson=%E4%BD%A0%E5%A5%BD&tag=R%20U&tag=F2&empty",
  );
  const decoded = query.parse(
    "lesson=%E4%BD%A0%E5%A5%BD&tag=R%20U&tag=F2&bad=%C3%5A%A5&plus=a%2Bb",
  );
  assert.equal(decoded.lesson, "你好");
  assert.deepEqual(decoded.tag, ["R U", "F2"]);
  assert.equal(decoded.bad, "%C3Z%A5");
  assert.equal(decoded.plus, "a+b");
  assert.equal(
    query.parseUrl("https://cubers.invalid/lesson?x=%F0%9F%98%80#part").query.x,
    "😀",
  );
  assert.equal(
    query.stringifyUrl({
      url: "https://cubers.invalid/lesson?x=old",
      query: { x: "new" },
    }),
    "https://cubers.invalid/lesson?x=new",
  );
});
test("malformed percent sequences terminate through the actual router dependency without recursive decoding", () => {
  const script = `const q=require(${JSON.stringify(routerRequire.resolve("query-string"))});for(const input of ['%80'.repeat(20000),'%E0%80'.repeat(20000),'%84%D7%25%88%90'.repeat(2000)]){const v=q.parse('value='+input).value;if(typeof v!=='string'||!v.length)throw Error('Invalid decoder result');}console.log('completed');`;
  const result = execFileSync(process.execPath, ["-e", script], {
    encoding: "utf8",
    timeout: 5000,
    maxBuffer: 1000,
  });
  assert.equal(result.trim(), "completed");
});
test("Xcode keeps its real UUID generator while fixed name-based UUID methods reject short buffers", () => {
  const xcode = require("xcode"),
    scoped = createRequire(require.resolve("xcode")),
    uuid = scoped("uuid");
  assert.equal(scoped("uuid/package.json").version, "11.1.1");
  for (const name of ["v3", "v5"])
    assert.throws(
      () =>
        uuid[name](
          "cubers",
          "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
          new Uint8Array(8),
          4,
        ),
      RangeError,
    );
  assert.throws(() => uuid.v6({}, new Uint8Array(8), 4), RangeError);
  const project = xcode.project("synthetic.pbxproj");
  project.allUuids = () => [];
  const ids = new Set<string>();
  for (let i = 0; i < 100; i++) {
    const id = project.generateUuid();
    assert.match(id, /^[A-F0-9]{24}$/);
    ids.add(id);
  }
  assert.equal(ids.size, 100);
});
test("Swagger uses patched YAML and empty merge sources consume the configured safety budget", () => {
  const scoped = createRequire(require.resolve("@nestjs/swagger/package.json")),
    yaml = scoped("js-yaml");
  assert.equal(scoped("js-yaml/package.json").version, "5.4.1");
  const document = {
    openapi: "3.0.0",
    info: { title: "Cubers", version: "0.1.0" },
    paths: {
      "/v1/health": {
        get: { responses: { 200: { description: "Healthy · 正常" } } },
      },
    },
  };
  assert.deepEqual(yaml.load(yaml.dump(document)), document);
  const repeated =
    "arr: &arr [" +
    Array(40).fill("{}").join(",") +
    "]\ntargets:\n" +
    Array(40).fill("  - <<: *arr\n").join("");
  assert.throws(() =>
    yaml.load(repeated, { schema: yaml.YAML11_SCHEMA, maxTotalMergeKeys: 10 }),
  );
});
test("the deterministic dependency bridge is idempotent and refuses unknown, linked and external source files", () => {
  const realFile = routerRequire.resolve("query-string"),
    before = readFileSync(realFile),
    mtime = statSync(realFile).mtimeMs;
  execFileSync(process.execPath, ["scripts/prepare-dependencies.cjs"], {
    stdio: "pipe",
  });
  assert.deepEqual(readFileSync(realFile), before);
  assert.equal(statSync(realFile).mtimeMs, mtime);
  const root = mkdtempSync(join(tmpdir(), "cubers-dependency-"));
  try {
    for (const dir of [
      "scripts",
      "apps/mobile",
      "node_modules/expo-router",
      "node_modules/query-string",
    ])
      mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(
      join(root, "scripts/prepare-dependencies.cjs"),
      readFileSync("scripts/prepare-dependencies.cjs"),
    );
    writeFileSync(join(root, "apps/mobile/package.json"), "{}");
    writeFileSync(join(root, "node_modules/expo-router/package.json"), "{}");
    writeFileSync(
      join(root, "node_modules/query-string/package.json"),
      JSON.stringify({ version: "7.1.3", main: "index.js" }),
    );
    const file = join(root, "node_modules/query-string/index.js"),
      external = join(root, "external.js"),
      run = () =>
        spawnSync(
          process.execPath,
          [join(root, "scripts/prepare-dependencies.cjs")],
          { encoding: "utf8" },
        );
    writeFileSync(file, "unknown source");
    assert.equal(run().status, 1);
    assert.equal(readFileSync(file, "utf8"), "unknown source");
    rmSync(file);
    writeFileSync(external, "external source");
    symlinkSync(external, file);
    assert.equal(run().status, 1);
    assert.equal(readFileSync(external, "utf8"), "external source");
    rmSync(file);
    linkSync(external, file);
    assert.equal(run().status, 1);
    assert.equal(readFileSync(external, "utf8"), "external source");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the Android camera preparation handles pristine/repeated installs and refuses changed or linked native source", () => {
  const root = mkdtempSync(join(tmpdir(), "cubers-camera-dependency-"));
  const relative =
    "node_modules/react-native-vision-camera/android/src/main/java/com/mrousavy/camera/react/CameraDevicesManager.kt";
  try {
    for (const dir of [
      "scripts",
      "apps/mobile",
      "node_modules/expo-router",
      "node_modules/query-string",
      "node_modules/decode-uri-component",
      relative.slice(0, relative.lastIndexOf("/")),
    ])
      mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(join(root, "apps/mobile/package.json"), "{}");
    writeFileSync(join(root, "node_modules/expo-router/package.json"), "{}");
    for (const name of ["query-string", "decode-uri-component"]) {
      const entry = routerRequire.resolve(name);
      for (const file of ["package.json", "index.js"])
        writeFileSync(
          join(root, "node_modules", name, file),
          readFileSync(join(resolve(entry, ".."), file)),
        );
    }
    writeFileSync(
      join(root, "scripts/prepare-dependencies.cjs"),
      readFileSync("scripts/prepare-dependencies.cjs"),
    );
    const manifest = join(
      root,
      "node_modules/react-native-vision-camera/package.json",
    );
    writeFileSync(manifest, JSON.stringify({ version: "4.7.3" }));
    const target = join(root, relative),
      prepared = readFileSync(relative, "utf8"),
      original = prepared.replace(
        "\n        // Cubers: publish devices discovered after the initial constants/event.\n        if (reactContext.hasActiveReactInstance()) sendAvailableDevicesChangedEvent()",
        "",
      ),
      run = () =>
        spawnSync(process.execPath, ["scripts/prepare-dependencies.cjs"], {
          cwd: root,
          encoding: "utf8",
        });
    assert.notEqual(original, prepared);
    writeFileSync(target, original);
    assert.equal(run().status, 0);
    assert.equal(readFileSync(target, "utf8"), prepared);
    const mtime = statSync(target).mtimeMs;
    assert.equal(run().status, 0);
    assert.equal(statSync(target).mtimeMs, mtime);
    writeFileSync(target, original + "\nunknown change");
    assert.equal(run().status, 1);
    assert.equal(readFileSync(target, "utf8"), original + "\nunknown change");
    const external = join(root, "external.kt");
    writeFileSync(external, original);
    rmSync(target);
    symlinkSync(external, target);
    assert.equal(run().status, 1);
    assert.equal(readFileSync(external, "utf8"), original);
    rmSync(target);
    linkSync(external, target);
    assert.equal(run().status, 1);
    assert.equal(readFileSync(external, "utf8"), original);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
