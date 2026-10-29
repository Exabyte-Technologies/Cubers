// Local development only. Production entry points never import this launcher.
import { parseEnv } from "node:util";
import { networkInterfaces } from "node:os";
import { isIPv4, createConnection } from "node:net";
import { spawn } from "node:child_process";
import { readFile, mkdir, open } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const interfaces = networkInterfaces();
const address =
  process.env.CUBERS_LAN_ADDRESS ||
  [...(interfaces.en0 || []), ...Object.values(interfaces).flat()].find(
    (row) =>
      row &&
      row.family === "IPv4" &&
      !row.internal &&
      !row.address.startsWith("169.254."),
  )?.address;
if (!address || !isIPv4(address))
  throw Error(
    "Set CUBERS_LAN_ADDRESS to this computer's private LAN IPv4 address.",
  );
let local;
try {
  local = parseEnv(await readFile(".env.local", "utf8"));
} catch {
  throw Error(
    "Create the private .env.local using docs/STARTUP-GUIDE.md first.",
  );
}
if (
  local.NODE_ENV !== "development" ||
  (local.REGION && local.REGION !== "INTL")
)
  throw Error(
    "This launcher requires the existing INTL development .env.local; it never starts production.",
  );
for (const key of ["DATABASE_URL", "REDIS_URL"]) {
  const url = new URL(local[key]);
  if (!["127.0.0.1", "localhost"].includes(url.hostname))
    throw Error(
      "This machine's development database and Redis must remain on loopback.",
    );
}
const webOrigin = `http://${address}:8081`,
  adminOrigin = `http://${address}:4173`,
  apiOrigin = `http://${address}:3000`;
const env = {
  ...process.env,
  ...local,
  NODE_ENV: "development",
  REGION: "INTL",
  HOST: "0.0.0.0",
  PORT: "3000",
  APP_ORIGIN: webOrigin,
  ADMIN_ORIGIN: adminOrigin,
  S3_ENDPOINT: `http://${address}:9009`,
  S3_ACCESS_KEY: "S3RVER",
  S3_SECRET_KEY: "S3RVER",
  AI_MODE: "mock",
  AI_BASE_URL: "http://127.0.0.1:4010/v1",
  AI_MODEL: "cubers-simulator",
  AI_API_KEY: "",
  OPENAI_API_KEY: "",
  QWEN_API_KEY: "",
  PUBLIC_RELEASE_APPROVED: "false",
  CN_SOCIAL_APPROVED: "false",
  CN_GAMES_APPROVED: "false",
  CN_AI_APPROVED: "false",
  SPONSORS_APPROVED: "false",
  NPM_CONFIG_AUDIT: "false",
};
// Keep provider/configuration secrets out of the Metro/admin child environments.
const publicEnv = {
  ...process.env,
  EXPO_NO_DOTENV: "1",
  EXPO_NO_TELEMETRY: "1",
  EXPO_PUBLIC_DEV_TOOLS: "true",
  EXPO_PUBLIC_API_URL_INTL: apiOrigin,
  EXPO_PUBLIC_API_URL_CN: apiOrigin,
  EXPO_PUBLIC_COMMUNITY_DISCOVERY_URL: apiOrigin,
  NPM_CONFIG_AUDIT: "false",
};
const logRoot = resolve(".data/dev-lan");
await mkdir(logRoot, { recursive: true, mode: 0o700 });
const children = new Set();
let stopping = false;
async function launch(name, command, args, childEnv = process.env, cwd = root) {
  const log = await open(resolve(logRoot, name + ".log"), "a", 0o600);
  const child = spawn(command, args, {
    cwd,
    env: childEnv,
    detached: true,
    stdio: ["ignore", log.fd, log.fd],
  });
  await log.close();
  children.add(child);
  child.on("error", () => {
    console.error(`${name} could not start; see .data/dev-lan/${name}.log`);
    void stop(1);
  });
  child.on("exit", (code) => {
    children.delete(child);
    if (!stopping) {
      console.error(`${name} stopped (${code}); see .data/dev-lan/${name}.log`);
      void stop(1);
    }
  });
  return child;
}
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  const running = [...children];
  for (const child of running) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
  }
  await Promise.all(
    running.map(
      (child) =>
        new Promise((resolve) => {
          if (child.exitCode !== null || child.signalCode !== null)
            return resolve();
          const timer = setTimeout(() => {
            try {
              process.kill(-child.pid, "SIGKILL");
            } catch {}
            resolve();
          }, 8000);
          child.once("exit", () => {
            clearTimeout(timer);
            resolve();
          });
        }),
    ),
  );
  console.log("Cubers LAN processes stopped; saved data retained.");
  process.exit(code);
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
async function portOpen(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.setTimeout(300, () => {
      socket.destroy();
      resolve(false);
    });
  });
}
for (const port of [3000, 4173, 8081, 54329, 6389, 9009, 10259, 4010])
  if (await portOpen(port))
    throw Error(
      `Port ${port} is occupied. Stop the existing Cubers development processes or dev Compose stack first; this launcher never kills unknown processes.`,
    );
async function waitFor(check, name) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (stopping) throw Error("Stopped");
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw Error(`${name} did not become ready; inspect .data/dev-lan/ logs.`);
}
try {
  await launch("database", process.execPath, ["scripts/local-services.mjs"]);
  await waitFor(
    async () => (await portOpen(54329)) && (await portOpen(6389)),
    "PostgreSQL/Redis",
  );
  await launch(
    "gateways",
    process.execPath,
    ["--openssl-legacy-provider", "scripts/local-gateways.mjs"],
    {
      ...process.env,
      CUBERS_DEV_LAN: "true",
      CUBERS_DEV_WEB_ORIGINS: [webOrigin, adminOrigin].join(","),
    },
  );
  await waitFor(() => portOpen(9009), "Development storage");
  const socket = resolve(".data/local-documents.sock");
  await launch(
    "api",
    process.execPath,
    ["dist/main.js"],
    { ...env, CONSENT_REVIEW_SOCKET: socket },
    resolve("apps/api"),
  );
  await waitFor(async () => {
    try {
      return (
        await fetch("http://127.0.0.1:3000/v1/health", {
          signal: AbortSignal.timeout(2000),
        })
      ).ok;
    } catch {
      return false;
    }
  }, "API");
  await launch(
    "admin",
    process.execPath,
    [
      resolve("node_modules/vite/bin/vite.js"),
      "--host",
      "0.0.0.0",
      "--port",
      "4173",
      "--strictPort",
    ],
    publicEnv,
    resolve("apps/admin"),
  );
  await launch(
    "mobile",
    process.execPath,
    [
      resolve("node_modules/expo/bin/cli"),
      "start",
      "--web",
      "--lan",
      "--port",
      "8081",
    ],
    publicEnv,
    resolve("apps/mobile"),
  );
  await waitFor(
    async () => (await portOpen(4173)) && (await portOpen(8081)),
    "Web hosts",
  );
  console.log(
    `Cubers development is ready on this LAN.\nApp / Metro: ${webOrigin}\nAdmin: ${adminOrigin}\nInternational API + discovery: ${apiOrigin}\nAll three development origin fields: ${apiOrigin}\nNo separate mainland backend is running. SQL, Redis, SMTP and mock AI remain on loopback.\nUse the LAN app URL even on this computer: allowed browser origins match the LAN hosts.\nLogs: .data/dev-lan/\nKeep this terminal running. Ctrl-C stops only these child processes.`,
  );
} catch (error) {
  console.error(error.message);
  await stop(1);
}
