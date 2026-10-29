import { checkStageLessons } from "./docker-stage-checks";
// Disposable Docker verification. Never targets .env.production or a live DB.
import assert from "node:assert/strict";
import { declaredPassingDeviceTest } from "../tests/helpers/device-test-fixture";
import { limitedJsonResponse } from "./limited-json-response";
import { receiptFixture } from "../tests/helpers/apple-receipt-fixture";
import { ocspFixture } from "../tests/helpers/ocsp-fixture";
import { consentPdfFixture } from "../tests/helpers/consent-pdf";
import { simulatedModeration } from "./mock-ai-protocol.mjs";
import { encodeCbor } from "../tests/helpers/app-attest-fixture";
import { spawn, execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile, rm, readdir, readFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { resolve, join } from "node:path";
import { createServer } from "node:net";
import { request } from "node:https";
import { connect as connectHttp2 } from "node:http2";
import { once } from "node:events";
import sharp from "sharp";
import { imageAiXmp } from "../apps/api/src/image-ai-metadata";
import { io } from "socket.io-client";
import {
  PublicLegalDocument,
  inverse,
  lessons,
  DiscoveryResponse,
  algorithmCases,
  practiceSetup,
  practiceApply,
  isPyraminx,
  facelets,
  observeLastLayer,
  DownloadedLesson,
  OperationalSnapshot,
  openOfflineGuidance,
  practiceSolved,
} from "@cubers/core";
const execFile = promisify(execFileCb),
  runId = randomUUID().slice(0, 8);
const root = resolve(".data/docker-smoke", runId),
  report: any = {
    runId,
    startedAt: new Date().toISOString(),
    regions: [],
    caveats: [
      "Local Linux containers on Docker Desktop; not a public deployment or capacity certification",
      "Synthetic accounts/eligibility/operator confirmations; no real identity review, guardian, device attestation or AI provider",
      "Production release, mainland social/game/AI approval flags remain false",
      "S3rver test emulator with unsigned-access wrapper; it does not validate SigV4 cryptography, production S3 IAM or durability",
    ],
  };
// Keep registry refresh as the default. An explicit offline run still rebuilds
// application sources and records its cached-base limitation in the report.
const pullBaseImages = process.env.CUBERS_DOCKER_PULL !== "false";
report.baseImageRefresh = pullBaseImages ? "registry" : "cached-local-bases";
async function buildOfflineImages(file: string) {
  const bases = JSON.parse(await readFile(file, "utf8"));
  const names = ["build", "api", "admin", "recovery"] as const;
  for (const key of names)
    assert.match(
      bases[key],
      /^sha256:[a-f0-9]{64}$/,
      "Use exact existing image IDs",
    );
  const files = [
    "package.json",
    "package-lock.json",
    "tsconfig.base.json",
    "apps/api/package.json",
    "apps/admin/package.json",
    "apps/mobile/package.json",
    "packages/core/package.json",
    "scripts/prepare-dependencies.cjs",
  ];
  const hashes = Object.fromEntries(
    await Promise.all(
      files.map(async (p) => [
        p,
        createHash("sha256")
          .update(await readFile(p))
          .digest("hex"),
      ]),
    ),
  );
  const check = await command([
    "run",
    "--rm",
    "--network",
    "none",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    "--user",
    "node",
    "--entrypoint",
    "node",
    bases.build,
    "-e",
    `const fs=require('node:fs'),{createHash}=require('node:crypto');console.log(JSON.stringify(Object.fromEntries(${JSON.stringify(files)}.map(p=>[p,createHash('sha256').update(fs.readFileSync('/app/'+p)).digest('hex')]))));`,
  ]);
  assert.deepEqual(
    JSON.parse(check.stdout),
    hashes,
    "Offline build dependencies must exactly match current manifests",
  );
  report.baseImageRefresh = "explicit-offline-image-bases";
  report.offlineBases = bases;
  report.offlineManifestHashes = hashes;
  report.caveats.push(
    "Current API/core sources recompiled using Linux dependencies matching the exact current manifests; production dependencies are pruned and copied into cached runtimes, and admin assets rebuilt. No OS/runtime refresh or public release verification.",
  );
  const adminBuild = await execFile(
    "npm",
    ["run", "build", "-w", "@cubers/admin"],
    { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
  );
  await writeFile(
    join(root, "offline-admin-build.log"),
    adminBuild.stdout + adminBuild.stderr,
    { mode: 0o600 },
  );
  const aliases = names.map((key) => `cubers-validation-base:${runId}-${key}`);
  for (const [index, key] of names.entries())
    await command(["tag", bases[key], aliases[index]]);
  const args = names.flatMap((key, index) => [
    "--build-arg",
    `CACHED_${key.toUpperCase()}=${aliases[index]}`,
  ]);
  try {
    for (const [target, tag] of [
      ["runtime", images.api],
      ["migrations", images.migrations],
      ["admin", images.admin],
      ["development-storage", images.developmentStorage],
      ["recovery-tools", `cubers-recovery:authority-${runId}`],
    ])
      await streamed(
        [
          "build",
          "-f",
          "infra/Dockerfile.validation-offline",
          ...args,
          "--target",
          target,
          "-t",
          tag,
          ".",
        ],
        `Offline ${target} image build`,
      );
  } finally {
    for (const alias of aliases) await command(["image", "rm", alias]);
  }
  report.recoveryImage = `cubers-recovery:authority-${runId}`;
}
const stacks: Stack[] = [];
const images = {
  api: `cubers-api:smoke-${runId}`,
  admin: `cubers-admin:smoke-${runId}`,
  migrations: `cubers-migrations:smoke-${runId}`,
  developmentStorage: `cubers-dev-storage:smoke-${runId}`,
  documents: `cubers-documents:smoke-${runId}`,
  proxy: `cubers-proxy:smoke-${runId}`,
  web: `cubers-web:smoke-${runId}`,
};
type Stack = {
  region: "CN" | "INTL";
  project: string;
  file: string;
  port: number;
  ca?: string;
  token?: string;
  email: string;
  password: string;
  compose: string[];
  checks: string[];
};
async function command(args: string[]) {
  return execFile("docker", args, {
    encoding: "utf8",
    timeout: 600000,
    maxBuffer: 8 * 1024 * 1024,
  });
}
async function streamed(args: string[], label: string) {
  console.log(label);
  const log = createWriteStream(
    join(root, label.replace(/[^a-z0-9]+/gi, "-") + ".log"),
    { mode: 0o600 },
  );
  const child = spawn("docker", args, {
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 600000,
  });
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (chunk) => {
      log.write(chunk);
    });
  const [code] = await once(child, "exit");
  await new Promise<void>((resolve, reject) => {
    log.once("error", reject);
    log.end(resolve);
  });
  if (code !== 0)
    throw new Error(`${label} failed. Inspect the private Docker test log.`);
}
async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as any).port;
  await new Promise<void>((r) => server.close(() => r()));
  return port;
}
async function setup(region: "CN" | "INTL", index: number): Promise<Stack> {
  const project = `cubers-smoke-${region.toLowerCase()}-${runId}`,
    file = join(root, `${region}.env`),
    port = await freePort(),
    password = randomBytes(24).toString("hex");
  const entries = {
    REGION: region,
    NODE_ENV: "test",
    HOST: "0.0.0.0",
    PORT: "3000",
    POSTGRES_PASSWORD: password,
    DATABASE_URL: `postgresql://cubers:${password}@postgres:5432/cubers`,
    REDIS_URL: "redis://redis:6379",
    APP_ORIGIN: `https://app.localhost:${port}`,
    ADMIN_ORIGIN: `https://localhost:${port}`,
    SMTP_URL: "smtp://mail:1025",
    MAIL_FROM: "Cubers <smoke@cubers.invalid>",
    S3_ENDPOINT: "http://storage:9000",
    S3_REGION: "us-east-1",
    S3_BUCKET: `cubers-${region.toLowerCase()}`,
    S3_ACCESS_KEY: `smoke${randomBytes(6).toString("hex")}`,
    S3_SECRET_KEY: randomBytes(24).toString("hex"),
    AI_MODE: "disabled",
    AI_API_KEY: "",
    OPENAI_API_KEY: "",
    QWEN_API_KEY: "",
    PUBLIC_RELEASE_APPROVED: "false",
    CN_SOCIAL_APPROVED: "false",
    CN_GAMES_APPROVED: "false",
    CN_AI_APPROVED: "false",
    WORKER_ENABLED: "true",
    API_DOMAIN: "api.cubers.invalid",
    ADMIN_DOMAIN: "admin.cubers.invalid",
    TLS_EMAIL: "smoke@cubers.invalid",
    CUBERS_ENV_FILE: file,
    SMOKE_PORT: String(port),
    SMOKE_SUBNET: `172.29.${180 + index}.0/24`,
    SMOKE_POOL: `172.29.${180 + index}.128/25`,
    SMOKE_PROXY_IP: `172.29.${180 + index}.2`,
    CUBERS_API_IMAGE: images.api,
    CUBERS_ADMIN_IMAGE: images.admin,
    CUBERS_MIGRATIONS_IMAGE: images.migrations,
    CUBERS_DOCUMENTS_IMAGE: images.documents,
    CUBERS_PROXY_IMAGE: images.proxy,
    CUBERS_WEB_IMAGE: images.web,
    EXPO_PUBLIC_API_URL_INTL: "https://api-intl.example.invalid",
    EXPO_PUBLIC_API_URL_CN: "https://api-cn.example.invalid",
    EXPO_PUBLIC_COMMUNITY_DISCOVERY_URL: "https://community.example.invalid",
  };
  await writeFile(
    file,
    Object.entries(entries)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") + "\n",
    { mode: 0o600 },
  );
  return {
    region,
    project,
    file,
    port,
    email: `docker-${runId}@cubers.invalid`,
    password,
    checks: [],
    compose: [
      "compose",
      "--project-name",
      project,
      "--env-file",
      file,
      "-f",
      "infra/compose.production.yml",
      "-f",
      "infra/compose.smoke.yml",
    ],
  };
}
const compose = (s: Stack, args: string[]) => command([...s.compose, ...args]);
async function inside(s: Stack, code: string) {
  // Code is passed as an argv value, never interpreted by a shell. It handles
  // only this runner's synthetic data in its unique ephemeral Compose project.
  const result = await compose(s, [
    "exec",
    "-T",
    "api",
    "node",
    "-e",
    `(async()=>{${code}})().catch(()=>{console.error('Container assertion failed');process.exitCode=1})`,
  ]);
  return result.stdout.trim();
}
async function api(
  s: Stack,
  path: string,
  body?: unknown,
  token?: string,
  method?: string,
  origin?: string,
  extraHeaders?: Record<string, string>,
) {
  const data = body === undefined ? undefined : JSON.stringify(body);
  return new Promise<{ status: number; body: any; headers: any }>(
    (resolve, reject) => {
      const req = request(
        `https://localhost:${s.port}/v1/${path}`,
        {
          ca: s.ca,
          rejectUnauthorized: true,
          method: method || (body === undefined ? "GET" : "POST"),
          headers: {
            "Content-Type": "application/json",
            ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(origin ? { Origin: origin } : {}),
            ...extraHeaders,
          },
        },
        (res) => {
          void limitedJsonResponse(res).then((body) => {
            resolve({
              status: res.statusCode!,
              body,
              headers: res.headers,
            });
          }, reject);
        },
      );
      req.setTimeout(15000, () => req.destroy(new Error("API timeout")));
      req.on("error", reject);
      req.end(data);
    },
  );
}
async function waitFor(work: () => Promise<boolean>, maximum = 60000) {
  const end = Date.now() + maximum;
  while (Date.now() < end) {
    if (await work()) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Timed out waiting for container processing");
}
async function checkPlayIntegrity(s: Stack) {
  const code = `require('reflect-metadata');const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{PrismaClient}=require('@prisma/client'),{Infrastructure}=require('./apps/api/dist/services'),{readConfig}=require('./apps/api/dist/config'),{PlayIntegrityProvider}=require('./apps/api/dist/attestation/google-provider'),{PlayIntegrityCrypto}=require('./apps/api/dist/attestation/google'),{AppAttestationCrypto}=require('./apps/api/dist/attestation/provider'),{AppAttestations}=require('./apps/api/dist/app-attestation'),{PlayController}=require('./apps/api/dist/play.controller'),{Competitions}=require('./apps/api/dist/competitions'),{SmartPlayAccess}=require('./apps/api/dist/smart-play-access'),{accountPolicy}=require('./apps/api/dist/security'),{hash}=require('./apps/api/dist/crypto');
  const db=new PrismaClient(),config={...readConfig(),APP_ATTESTATION_GOOGLE_ENABLED:'true',APP_ATTESTATION_GOOGLE_PROJECT_NUMBER:'123456789012',APP_ATTESTATION_GOOGLE_PACKAGE:'app.cubers.mobile',APP_ATTESTATION_GOOGLE_SIGNERS:Buffer.alloc(32,7).toString('base64url'),APP_ATTESTATION_GOOGLE_BUILDS:'42'},infra=new Infrastructure(config);let userId,roomId;
  (async()=>{try{
   if(config.REGION==='CN'){const provider=new PlayIntegrityProvider(infra);await assert.rejects(provider.onModuleInit(),/not commissioned/);assert.equal(provider.available(),false);console.log(JSON.stringify({mainlandUnavailable:true}));return;}
   class Synthetic extends PlayIntegrityProvider{async onModuleInit(){}available(){return true;}verify(token,context){return new PlayIntegrityCrypto({packageName:config.APP_ATTESTATION_GOOGLE_PACKAGE,certificateDigests:[config.APP_ATTESTATION_GOOGLE_SIGNERS],versionCodes:['42']},async()=>'synthetic-bearer-only',async(url,init)=>{assert.equal(url,'https://playintegrity.googleapis.com/v1/app.cubers.mobile:decodeIntegrityToken');assert.equal(JSON.parse(init.body).integrity_token,'synthetic-compiled-token');return new Response(JSON.stringify({tokenPayloadExternal:{requestDetails:{requestPackageName:config.APP_ATTESTATION_GOOGLE_PACKAGE,requestHash:context.requestHash,timestampMillis:String(Date.now())},accountDetails:{appLicensingVerdict:'LICENSED'},appIntegrity:{appRecognitionVerdict:'PLAY_RECOGNIZED',packageName:config.APP_ATTESTATION_GOOGLE_PACKAGE,certificateSha256Digest:[config.APP_ATTESTATION_GOOGLE_SIGNERS],versionCode:'42'},deviceIntegrity:{deviceRecognitionVerdict:['MEETS_DEVICE_INTEGRITY']}}}),{headers:{'Content-Type':'application/json'}});}).verifyToken(token,context);}}
   const provider=new Synthetic(infra),competitions=new Competitions(db,infra),service=new AppAttestations(db,infra,new AppAttestationCrypto(infra),competitions,provider),play=new PlayController(db,infra,competitions,new SmartPlayAccess(),service);
   const user=await db.user.create({data:{email:'play-'+randomUUID()+'@synthetic.invalid',displayName:'Synthetic verification',birthDate:'1990-01-01',passwordHash:'unusable-synthetic-account',emailVerified:true,adultVerified:true,identityVerified:true,region:config.REGION}});userId=user.id;
   const session=await db.session.create({data:{userId:user.id,tokenHash:hash(randomUUID()),expiresAt:new Date(Date.now()+60000)}}),actor={user,sessionId:session.id,policy:await accountPolicy(db,user)};
   const room=await db.room.create({data:{code:randomUUID(),ownerId:user.id,puzzle:'3x3',input:'virtual',mode:'race',ranked:false,private:true,status:'ACTIVE'}});roomId=room.id;
   await db.roomMember.create({data:{roomId:room.id,userId:user.id}});const a=await db.attempt.create({data:{roomId:room.id,userId:user.id,nonce:randomUUID(),scramble:['R']}});
   const c=await service.challenge(actor,{kind:'play-action',provider:'google-play',attemptId:a.id,operation:'inspect',body:{nonce:a.nonce}}),proof={kind:'play-action',challengeId:c.id,clientData:c.clientData,integrityToken:'synthetic-compiled-token'},verified=await service.verify(actor,proof);
   assert.equal(verified.rankingEligible,false);const g=await db.appAttestationGrant.findUniqueOrThrow({where:{id:verified.grantId}});assert.equal(g.provider,'google-play');assert.equal(g.keyId,null);assert.equal(g.keyVersion,null);
   await assert.rejects(service.verify(actor,proof));await play.inspect(actor,a.id,{nonce:a.nonce,appProofId:g.id});assert.equal((await db.attempt.findUniqueOrThrow({where:{id:a.id}})).status,'INSPECTION');assert.ok((await db.appAttestationGrant.findUniqueOrThrow({where:{id:g.id}})).consumedAt);
   await service.revokePlay(actor);assert.equal(await db.appAttestationGrant.count({where:{userId:user.id}}),0);assert.equal(await db.appAttestationKey.count({where:{userId:user.id}}),0);console.log(JSON.stringify({keylessActionConsumed:true,cancellation:true,realProvider:false}));
  }finally{if(roomId){await db.roomMember.deleteMany({where:{roomId}});await db.room.deleteMany({where:{id:roomId}});}if(userId)await db.user.deleteMany({where:{id:userId}});await infra.close();await db.$disconnect();}})().catch(()=>{console.error('Compiled Play verification probe failed');process.exitCode=1;});`;
  const result = JSON.parse(await inside(s, code));
  assert.equal(
    s.region === "CN"
      ? result.mainlandUnavailable
      : result.keylessActionConsumed,
    true,
  );
  s.checks.push(
    s.region === "CN"
      ? "Compiled Google Play provider refuses mainland commissioning without credentials or provider traffic"
      : "Compiled Google Standard request binding, keyless grant, actual game-handler consumption, replay refusal and cancellation under a test-only decoder; no real provider",
  );
}
async function checkAppAttestation(s: Stack) {
  const catalogue = await api(s, "me/app-attestation", undefined, s.token);
  assert.equal(catalogue.status, 200);
  assert.equal(catalogue.body.rankingEnabled, false);
  assert.equal(
    catalogue.body.providers.every((p: any) => !p.available),
    true,
  );
  assert.match(catalogue.headers["cache-control"], /no-store/);
  for (const provider of ["apple-app-attest", "google-play"])
    assert.equal(
      (
        await api(
          s,
          "me/app-attestation/challenges",
          {
            kind: "enroll",
            provider,
            keyId: Buffer.alloc(32).toString("base64"),
          },
          s.token,
        )
      ).status,
      403,
    );
  const f = receiptFixture(),
    directory = `/tmp/app-attest-${runId}`;
  const email = `app-attest-${runId}@synthetic.invalid`,
    token = randomBytes(32).toString("base64url");
  const bootstrap = `const assert=require('node:assert/strict'),fs=require('node:fs/promises'),cryptoModule=require('node:crypto'),{PrismaClient}=require('@prisma/client'),{Db,Infrastructure}=require('./apps/api/dist/services'),{readConfig}=require('./apps/api/dist/config'),{hash}=require('./apps/api/dist/crypto'),{accountPolicy}=require('./apps/api/dist/security'),{learningWrite}=require('./apps/api/dist/learning-authority'),{AppAttestations}=require('./apps/api/dist/app-attestation'),{AppAttestationCrypto}=require('./apps/api/dist/attestation/provider'),{AppleAppAttestCrypto}=require('./apps/api/dist/attestation/apple'),{AppleEnrollmentVerifier,AppleReceiptVerifier}=require('./apps/api/dist/attestation/apple-receipt');
    const db=new PrismaClient(),config={...readConfig(),APP_ATTESTATION_APPLE_ENABLED:'true',APP_ATTESTATION_APPLE_APP_ID:${JSON.stringify(f.appId)},APP_ATTESTATION_APPLE_BUILDS:'1',APP_ATTESTATION_APPLE_DISTRIBUTION:'app-store',APP_ATTESTATION_RECEIPT_KEY_FILE:${JSON.stringify(directory + "/key.json")},APP_ATTESTATION_CN_APPROVED:'true',CN_GAMES_APPROVED:'true'},infra=new Infrastructure(config),root=new cryptoModule.X509Certificate(${JSON.stringify(f.root.toString())});
    class Synthetic extends AppAttestationCrypto{async ensureReceiptCertificateStatus(value){return value.receipt.expiresAt;}receiptCertificateStatusUntil(value){return value.receipt.expiresAt;}enroll(proof,keyId,clientData){return new AppleEnrollmentVerifier(new AppleAppAttestCrypto(this.policy(),root),new AppleReceiptVerifier({appId:config.APP_ATTESTATION_APPLE_APP_ID,environment:'production'},root)).verify(proof,keyId,Buffer.from(clientData,'utf8'));}assertion(pem,proof,clientData,counter){return new AppleAppAttestCrypto(this.policy(),root).verifyAssertion(proof,cryptoModule.createPublicKey(pem),Buffer.from(clientData,'utf8'),Number(counter));}}
    const crypto=new Synthetic(infra),service=new AppAttestations(db,infra,crypto);`;
  const current = `await crypto.onModuleInit();const user=await db.user.findUniqueOrThrow({where:{email:${JSON.stringify(email)}}}),session=await db.session.findUniqueOrThrow({where:{tokenHash:hash(${JSON.stringify(token)})}}),actor={user,policy:await accountPolicy(db,user),sessionId:session.id};`;
  const finish = `}finally{await crypto.onApplicationShutdown();await infra.close();await db.$disconnect();}`;
  try {
    const challenge = JSON.parse(
      await inside(
        s,
        `${bootstrap}try{await fs.mkdir(${JSON.stringify(directory)},{mode:0o700});await fs.writeFile(config.APP_ATTESTATION_RECEIPT_KEY_FILE,JSON.stringify({version:1,id:cryptoModule.randomUUID(),key:cryptoModule.randomBytes(32).toString('base64')}),{mode:0o600});const createdUser=await db.user.create({data:{email:${JSON.stringify(email)},displayName:'Synthetic compiled app verification',birthDate:'1990-01-01',region:config.REGION,passwordHash:'!synthetic-no-login',emailVerified:true,adultVerified:true,identityVerified:true}});await db.session.create({data:{userId:createdUser.id,tokenHash:hash(${JSON.stringify(token)}),expiresAt:new Date(Date.now()+3600000)}});${current}console.log(JSON.stringify(await service.challenge(actor,{kind:'enroll',provider:'apple-app-attest',keyId:${JSON.stringify(f.keyId)}})));${finish}`,
      ),
    );
    const object = f.object({
        signingChallenge: Buffer.from(challenge.clientData, "utf8"),
      }),
      now = Date.now();
    const fields = f
      .fields()
      .map(
        ([id, value]) =>
          [
            id,
            id === 12
              ? Buffer.from(new Date(now).toISOString())
              : id === 21
                ? Buffer.from(new Date(now + 90 * 86400000).toISOString())
                : value,
          ] as [number, Buffer],
      );
    object.get("attStmt").set("receipt", Buffer.from(f.sign(fields), "base64"));
    const proof = {
      kind: "enroll",
      challengeId: challenge.id,
      clientData: challenge.clientData,
      keyId: f.keyId,
      attestation: encodeCbor(object).toString("base64"),
    };
    const action = JSON.parse(
      await inside(
        s,
        `${bootstrap}try{${current}const enrolled=await service.verify(actor,${JSON.stringify(proof)}),key=await db.appAttestationKey.findUniqueOrThrow({where:{id:enrolled.key.id}});assert.equal(key.counter,0n);assert.equal(key.receiptCiphertext.includes('synthetic-receipt-token'),false);await assert.rejects(service.verify(actor,${JSON.stringify(proof)}),e=>e.getStatus()===409);const room=await db.room.create({data:{code:cryptoModule.randomUUID(),ownerId:user.id,puzzle:'3x3',input:'virtual',mode:'race',ranked:false,private:true,status:'ACTIVE'}});await db.roomMember.create({data:{roomId:room.id,userId:user.id}});const attempt=await db.attempt.create({data:{roomId:room.id,userId:user.id,nonce:cryptoModule.randomUUID(),scramble:['R','U']}}),c=await service.challenge(actor,{kind:'action',provider:'apple-app-attest',keyId:key.id,attemptId:attempt.id,operation:'inspect',body:{nonce:attempt.nonce}});console.log(JSON.stringify({keyId:key.id,attemptId:attempt.id,nonce:attempt.nonce,challenge:c}));${finish}`,
      ),
    );
    const assertion = {
      kind: "action",
      challengeId: action.challenge.id,
      clientData: action.challenge.clientData,
      assertion: f.assertion(1, {
        signingChallenge: Buffer.from(action.challenge.clientData, "utf8"),
      }),
    };
    const nextReceipt = f.sign(
      f
        .fields("RECEIPT")
        .map(
          ([id, value]) =>
            [
              id,
              id === 12
                ? Buffer.from(new Date(Date.now()).toISOString())
                : id === 19
                  ? Buffer.from(new Date(Date.now() + 3600000).toISOString())
                  : id === 21
                    ? Buffer.from(
                        new Date(Date.now() + 90 * 86400000).toISOString(),
                      )
                    : value,
            ] as [number, Buffer],
        ),
    );
    const periodic = `config.APP_ATTESTATION_APPLE_AUTO_REFRESH='true';crypto.receiptRefreshAvailable=()=>crypto.available('apple-app-attest');let refreshCalls=0;crypto.refreshReceipt=async stored=>{refreshCalls++;await db.user.update({where:{id:user.id},data:{displayName:'Synthetic unlocked account update'}});const receiptBase64=${JSON.stringify(nextReceipt)},receipt=await new AppleReceiptVerifier({appId:config.APP_ATTESTATION_APPLE_APP_ID,environment:'production'},root).verify(receiptBase64,cryptoModule.createPublicKey(stored.publicKeyPem),'RECEIPT');return {kind:'refreshed',receiptBase64,receipt};};const enabled=await service.receiptSchedule(actor,key.id,{expectedVersion:key.version,enabled:true});assert.equal(enabled.receiptAutoRefresh,true);await db.appAttestationKey.update({where:{id:key.id},data:{receiptRefreshAt:new Date(Date.now()-1),version:{increment:1}}});const {AppleReceiptMaintenance}=require('./apps/api/dist/attestation/receipt-maintenance'),maintenance=new AppleReceiptMaintenance(db,infra,crypto);try{await maintenance.run();const changed=await db.appAttestationKey.findUniqueOrThrow({where:{id:key.id}});assert.notEqual(changed.receiptCiphertext,key.receiptCiphertext);assert.equal(changed.counter,1n);assert.equal(changed.receiptRefreshLease,null);assert.ok(changed.receiptRefreshAt.getTime()>Date.now()+3500000);await maintenance.run();assert.equal(refreshCalls,1);const off=await service.receiptSchedule(actor,key.id,{expectedVersion:0,enabled:false});assert.equal(off.receiptAutoRefresh,false);assert.equal(off.receiptRefreshAt,null);}finally{await maintenance.onModuleDestroy();}`;
    const result = JSON.parse(
      await inside(
        s,
        `${bootstrap}try{${current}const verified=await service.verify(actor,${JSON.stringify(assertion)});assert.equal(verified.rankingEligible,false);const key=await db.appAttestationKey.findUniqueOrThrow({where:{id:${JSON.stringify(action.keyId)}}});assert.equal(key.counter,1n);const {PlayController}=require('./apps/api/dist/play.controller'),{Competitions}=require('./apps/api/dist/competitions'),{SmartPlayAccess}=require('./apps/api/dist/smart-play-access'),competition=new Competitions(db,infra),play=new PlayController(db,infra,competition,new SmartPlayAccess(),service),id=${JSON.stringify(action.attemptId)},body={nonce:${JSON.stringify(action.nonce)},appProofId:verified.grantId};const failing=new Proxy(db,{get(target,p){if(p==='$transaction')return(work,options)=>db.$transaction(tx=>work(new Proxy(tx,{get(inner,property){if(property==='attempt')return new Proxy(inner.attempt,{get(delegate,method){if(method==='updateMany')return async args=>{if(args.where.id===id&&args.data.status==='INSPECTION')throw Error('synthetic-action-failure');return delegate.updateMany(args);};return Reflect.get(delegate,method);}});return Reflect.get(inner,property);}})),options);return Reflect.get(target,p);}});await assert.rejects(play.inspect(actor,id,{...body,nonce:'wrong'}),e=>e.getStatus()===403);await assert.rejects(new PlayController(failing,infra,competition,new SmartPlayAccess(),service).inspect(actor,id,body),/synthetic-action-failure/);assert.equal((await db.appAttestationGrant.findUniqueOrThrow({where:{id:verified.grantId}})).consumedAt,null);assert.equal((await db.attempt.findUniqueOrThrow({where:{id}})).status,'CREATED');await play.inspect(actor,id,body);assert.ok((await db.appAttestationGrant.findUniqueOrThrow({where:{id:verified.grantId}})).consumedAt);assert.equal((await db.attempt.findUniqueOrThrow({where:{id}})).status,'INSPECTION');await assert.rejects(play.start(actor,id,body),e=>e.getStatus()===403);${periodic}await service.revoke(actor,key.id,{expectedVersion:(await db.appAttestationKey.findUniqueOrThrow({where:{id:key.id}})).version});const revoked=await db.appAttestationKey.findUniqueOrThrow({where:{id:key.id}});assert.equal(revoked.status,'REVOKED');assert.equal(revoked.publicKeyPem,null);assert.equal(revoked.receiptCiphertext,null);assert.equal(await db.appAttestationGrant.count({where:{keyId:key.id}}),0);await fs.rm(${JSON.stringify(directory)},{recursive:true,force:true});console.log(JSON.stringify({enrolled:true,realSyntheticSignatures:true,counter:1,singleUse:true,rollback:true,revoked:true,rankingEnabled:false}));${finish}`,
      ),
    );
    assert.equal(result.revoked, true);
    s.checks.push(
      "Compiled periodic receipt updates require per-key opt-in, preserve assertion counters, replace encrypted signed receipts, respect the next update and allow stale-version opt-out; real PostgreSQL with a synthetic provider only",
    );
    s.checks.push(
      "Compiled Apple enrollment and action signatures under a test-only CA persist encrypted receipts and counters, consume exact proofs inside real attempt transitions, roll back failed mutations and erase revoked keys; both public providers and rankings remain off",
    );
  } finally {
    f.close();
  }
}
async function checkAiModeration(s: Stack) {
  const code = [
    "const assert=require('node:assert/strict'),{AiTutor}=require('./apps/api/dist/ai'),{readConfig}=require('./apps/api/dist/config'),{lessons}=require('@cubers/core');",
    "const region=" +
      JSON.stringify(s.region) +
      ",safe=" +
      JSON.stringify(simulatedModeration()) +
      ",text='Observe the pieces and compare their positions after each turn.',calls=[];let blocked=false;",
    "const config=readConfig({...process.env,NODE_ENV:'test',REGION:region,AI_MODE:'mock',AI_BASE_URL:'http://127.0.0.1:4010/v1',AI_MODEL:'synthetic',AI_API_KEY:'',OPENAI_API_KEY:'',QWEN_API_KEY:''});",
    "const tutor=new AiTutor(config,async(url,options)=>{assert.equal(options.headers?.Authorization,undefined);assert.equal(options.redirect,'error');const body=options.body?JSON.parse(options.body):null;calls.push({url,body,headers:options.headers});if(url.endsWith('/models'))return new Response(JSON.stringify({data:[{id:'synthetic'}]}));if(url.endsWith('/moderations')){assert.equal(region,'INTL');const result=JSON.parse(JSON.stringify(safe));if(blocked&&body.input===text){result.results[0].flagged=true;result.results[0].categories.violence=true;}return new Response(JSON.stringify(result));}assert.ok(url.endsWith('/chat/completions'));if(region==='CN')assert.equal(options.headers['X-DashScope-DataInspection'],'{\"input\":\"cip\",\"output\":\"cip\"}');return new Response(JSON.stringify({choices:[{finish_reason:blocked&&region==='CN'?'content_filter':'stop',message:{role:'assistant',content:text}}]}));});",
    "assert.equal((await tutor.explain(lessons[0],'en',true,'PRIVATE_QUESTION why')).source,'simulated');blocked=true;assert.equal((await tutor.explain(lessons[0],'en',true,'PRIVATE_QUESTION why')).source,'authored');assert.ok(!JSON.stringify(calls).includes('PRIVATE_QUESTION'));assert.equal(calls.some(c=>c.url.endsWith('/moderations')),region==='INTL');console.log(JSON.stringify({simulated:true,moderationConnected:true,blockedOutputAuthored:true,minimized:true}));",
  ].join("\n");
  const result = JSON.parse(await inside(s, code));
  assert.equal(result.blockedOutputAuthored, true);
  s.checks.push(
    "Compiled tutor screens minimized international context/output or requests mainland inline guardrails, rejects blocked replies and keeps simulation credentials/raw questions private; synthetic transport only",
  );
}
async function checkMediaLabels(s: Stack) {
  const code = [
    "const assert=require('node:assert/strict'),fs=require('node:fs/promises'),cp=require('node:child_process'),sharp=require('sharp'),{randomUUID}=require('node:crypto'),{Background}=require('./apps/api/dist/worker'),{GetObjectCommand}=require('@aws-sdk/client-s3'),{readImageAiMetadata}=require('./apps/api/dist/image-ai-metadata'),{readVideoAiMetadata}=require('./apps/api/dist/video-ai-metadata');",
    "const temp=await fs.mkdtemp('/tmp/media-label-');try{",
    "cp.execFileSync('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','color=c=blue:s=80x60:r=5','-t','0.5','-c:v','libx264',temp+'/source.mp4'],{timeout:20000});",
    "for(const type of ['image/png','video/mp4']){const id=randomUUID(),key='INTL/synthetic/'+id+'/upload',bytes=type.startsWith('image')?await sharp({create:{width:100,height:80,channels:3,background:'#164fa0'}}).png().toBuffer():await fs.readFile(temp+'/source.mp4'),row={id,key,type,size:bytes.length,purpose:'post',status:'PROCESSING',aiDeclared:true},objects=new Map([[key,bytes]]);",
    "const db={media:{findMany:async()=>[row],updateMany:async({where,data})=>{if(row.status!==where.status)return {count:0};Object.assign(row,data);return {count:1};}}},infra={config:{S3_BUCKET:'synthetic-only'},storage:{send:async command=>{assert.equal(command.input.Bucket,'synthetic-only');if(command instanceof GetObjectCommand)return {ContentLength:bytes.length,Body:{transformToByteArray:async()=>bytes}};objects.set(command.input.Key,Buffer.from(command.input.Body));return {};}},delete:async key=>{objects.delete(key);}};",
    "await new Background(db,infra).processMedia();assert.equal(row.status,'READY');assert.equal(row.aiLabel,null);assert.equal(row.aiDeclared,true);assert.equal(objects.has(key),false);const output=objects.get(row.key),claim=type.startsWith('image')?readImageAiMetadata(output,type):readVideoAiMetadata(output);assert.equal(claim.Label,'2');assert.equal(claim.ContentProducer,'');assert.equal(claim.PropagateID,id);",
    "if(type.startsWith('image')){const shape=await sharp(output).metadata();assert.equal(shape.width,320);assert.ok(shape.height>80);}else{await fs.writeFile(temp+'/output.mp4',output);const info=JSON.parse(cp.execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',temp+'/output.mp4'],{encoding:'utf8'}));assert.equal(info.streams.length,1);assert.equal(info.streams[0].codec_name,'h264');assert.ok(Number(info.format.duration)>=2);assert.equal(info.streams[0].width,320);}}console.log(JSON.stringify({declaredImages:true,declaredVideos:true,embeddedLabels:true,syntheticPersistence:true}));}finally{await fs.rm(temp,{recursive:true,force:true});}",
  ].join("\n");
  const proof = JSON.parse(await inside(s, code));
  assert.equal(proof.declaredImages, true);
  assert.equal(proof.declaredVideos, true);
  s.checks.push(
    "Compiled Linux Sharp/FFmpeg processor adds visible bilingual footers and embedded declaration labels to synthetic photos/videos; short clips keep two-second labels without fabricating source identities",
  );
}
async function checkAppleCertificateStatus(s: Stack) {
  const f = ocspFixture(true);
  try {
    const fixture = {
      now: f.now,
      root: f.root.toString(),
      chain: f.encoded,
      good: f.response().toString("base64"),
      issuer: f.response({ issuerStatus: true }).toString("base64"),
      revoked: f.response({ status: "revoked" }).toString("base64"),
      unknown: f.response({ status: "unknown" }).toString("base64"),
      delegated: f.response({ delegated: "nocheck" }).toString("base64"),
      unreviewed: f.response({ delegated: "unreviewed" }).toString("base64"),
    };
    // Delegated responder certificates are created lazily above. Evaluate only
    // after they exist, rather than at the earlier fixture-construction clock.
    fixture.now = Date.now();
    const result = JSON.parse(
      await inside(
        s,
        [
          "const assert=require('node:assert/strict'),{X509Certificate}=require('node:crypto'),{AppleCertificateStatus}=require('./apps/api/dist/attestation/apple-certificate-status');",
          "const f=" +
            JSON.stringify(fixture) +
            ";let now=f.now,calls=0;const root=new X509Certificate(f.root);",
          "const status=new AppleCertificateStatus(root,'/usr/bin/openssl',async(url,request)=>{calls++;assert.equal(url.hostname,'ocsp.apple.com');assert.ok(request.length>0);return Buffer.from(url.pathname.includes('aaica5')?f.good:f.issuer,'base64');},()=>now);",
          "try{const until=await status.ensure(f.chain);assert.equal(calls,2);assert.ok(until>now);assert.equal(status.until(f.chain),until);await status.ensure(f.chain);assert.equal(calls,2);now=until;assert.throws(()=>status.until(f.chain));}finally{status.stop();}",
          "for(const state of ['revoked','unknown']){const denied=new AppleCertificateStatus(root,'/usr/bin/openssl',async(url)=>Buffer.from(url.pathname.includes('aaica5')?f[state]:f.issuer,'base64'),()=>f.now);try{await assert.rejects(denied.ensure(f.chain),e=>e.code==='certificate-status-untrusted');assert.throws(()=>denied.until(f.chain));}finally{denied.stop();}}",
          "for(const state of ['delegated','unreviewed']){const delegated=new AppleCertificateStatus(root,'/usr/bin/openssl',async(url)=>Buffer.from(url.pathname.includes('aaica5')?f[state]:f.issuer,'base64'),()=>f.now);try{if(state==='delegated')assert.ok(await delegated.ensure(f.chain));else await assert.rejects(delegated.ensure(f.chain),e=>e.code==='certificate-status-responder-policy');}finally{delegated.stop();}}",
          "console.log(JSON.stringify({signedChain:true,cacheBounded:true,revokedDenied:true,unknownDenied:true}));",
        ].join("\n"),
      ),
    );
    assert.deepEqual(result, {
      signedChain: true,
      cacheBounded: true,
      revokedDenied: true,
      unknownDenied: true,
    });
    s.checks.push(
      "Compiled Apple receipt certificate status verifies both synthetic OCSP signatures with isolated Linux OpenSSL, bounds cached trust, checks delegated responder policy and rejects signed revoked/unknown results; no external provider request",
    );
  } finally {
    f.close();
  }
}
async function checkAppleReceiptExchange(s: Stack) {
  const f = receiptFixture();
  try {
    const fixture = {
      now: f.now,
      appId: f.appId,
      root: f.root.toString(),
      pem: f.leaf.publicKey.export({ type: "spki", format: "pem" }).toString(),
      previous: f.sign(
        f
          .fields()
          .map(([id, value]) => [
            id,
            id === 12
              ? Buffer.from(new Date(f.now - 1000).toISOString())
              : value,
          ]),
      ),
      updated: f.sign(f.fields("RECEIPT")),
    };
    const code = [
      "const assert=require('node:assert/strict'),fs=require('node:fs/promises'),crypto=require('node:crypto');",
      "const {loadAppleReceiptCredential}=require('./apps/api/dist/attestation/apple-credentials'),{AppleReceiptExchange}=require('./apps/api/dist/attestation/apple-exchange'),{AppleReceiptVerifier}=require('./apps/api/dist/attestation/apple-receipt');",
      "const f=" + JSON.stringify(fixture) + ";",
      "const directory=await fs.mkdtemp('/tmp/apple-receipt-'),file=directory+'/credential.json',policy={appId:f.appId,environment:'production'},pair=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'});let credential,client;",
      "try{await fs.writeFile(file,JSON.stringify({version:1,teamId:f.appId.split('.')[0],keyId:'ABCDEFGHIJ',privateKey:pair.privateKey.export({type:'pkcs8',format:'pem'}).toString()}),{mode:0o600});credential=await loadAppleReceiptCredential(file,f.appId.split('.')[0]);",
      "const key=crypto.createPublicKey(f.pem),verifier=new AppleReceiptVerifier(policy,new crypto.X509Certificate(f.root),'/usr/bin/openssl',()=>f.now);let calls=0;",
      "client=new AppleReceiptExchange(policy,credential,verifier,async(url,options)=>{calls++;assert.equal(url,'https://data.appattest.apple.com/v1/attestationData');assert.equal(options.body,f.previous);assert.equal(options.redirect,'error');const jwt=options.headers.Authorization.split('.');assert.equal(jwt.length,3);assert.ok(crypto.verify('sha256',Buffer.from(jwt[0]+'.'+jwt[1]),{key:pair.publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(jwt[2],'base64url')));return new Response(f.updated,{status:200});},()=>f.now);",
      "const stored={receiptBase64:f.previous,receipt:await verifier.verify(f.previous,key,'ATTEST'),publicKeyPem:f.pem},result=await client.refresh(stored);assert.equal(result.kind,'refreshed');assert.equal(result.receipt.type,'RECEIPT');assert.equal(result.receipt.riskMetric,3);assert.equal(calls,1);const deferred=await client.refresh({...stored,receiptBase64:result.receiptBase64,receipt:result.receipt});assert.equal(deferred.kind,'deferred');assert.equal(calls,1);",
      "const pidFile='/tmp/cubers-receipt-probe.pid',script='/opt/cubers-stalled-verifier',slow=new AppleReceiptVerifier(policy,new crypto.X509Certificate(f.root),script,()=>f.now),abort=new AbortController(),refused=assert.rejects(slow.verify(f.previous,key,'ATTEST',abort.signal),e=>e.code==='receipt-cancelled');void refused.catch(()=>{});try{let pid;for(let i=0;i<100&&!pid;i++){pid=await fs.readFile(pidFile,'utf8').catch(()=>null);if(!pid)await new Promise(r=>setTimeout(r,10));}assert.ok(pid);abort.abort();await refused;assert.throws(()=>process.kill(Number(pid),0),e=>e.code==='ESRCH');}finally{abort.abort();await refused.catch(()=>{});await fs.rm(pidFile,{force:true});}console.log(JSON.stringify({refreshed:true,deferredWithoutNetwork:true,receiptChildClosed:true}));",
      "}finally{client?.stop();credential?.destroy();await fs.rm(directory,{recursive:true,force:true});}",
    ].join("\n");
    const result = JSON.parse(await inside(s, code));
    assert.equal(result.refreshed, true);
    assert.equal(result.deferredWithoutNetwork, true);
    assert.equal(result.receiptChildClosed, true);
    s.checks.push(
      "Compiled Apple receipt client loads private synthetic ES256 credentials, verifies signed CMS refresh and defers early updates without network; no real Apple request or provider activation",
    );
  } finally {
    f.close();
  }
}
async function bootstrapStaffCli(s: Stack) {
  return JSON.parse(
    await inside(
      s,
      `const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');const {PrismaClient}=require('@prisma/client');const {passwordHash}=require('./apps/api/dist/crypto');const {authenticator}=require('otplib');const db=new PrismaClient();const dir='/tmp/staff-operator-${runId}';fs.mkdirSync(dir,{mode:0o700});try{const user=await db.user.create({data:{email:'staff-cli-${runId}@cubers.invalid',displayName:'Synthetic operator',birthDate:'1990-01-01',region:process.env.REGION,emailVerified:true,passwordHash:await passwordHash(${JSON.stringify(s.password)})}});const req=dir+'/request.json',planPath=dir+'/enrollment.json',conf=dir+'/confirmation.json';fs.writeFileSync(req,JSON.stringify({action:'bootstrap',region:process.env.REGION,userId:user.id,role:'ADMIN',caseReference:'synthetic-container-${runId}',operatorReviewConfirmed:true}),{mode:0o600});const cli='/app/apps/api/dist/staff-cli.js';const planned=JSON.parse(cp.execFileSync(process.execPath,[cli,'plan',req,planPath],{encoding:'utf8'}));const plan=JSON.parse(fs.readFileSync(planPath,'utf8'));assert.equal(fs.statSync(planPath).mode&511,384);while(Date.now()%30000>25000)await new Promise(r=>setTimeout(r,100));fs.writeFileSync(conf,JSON.stringify({planDigest:planned.planDigest,targetPassword:${JSON.stringify(s.password)},newOtp:authenticator.generate(plan.secret),recoverySaved:true}),{mode:0o600});const result=JSON.parse(cp.execFileSync(process.execPath,[cli,'apply',planPath,conf],{encoding:'utf8'}));assert.equal(result.status,'applied');assert.equal(fs.existsSync(planPath),false);assert.equal(fs.existsSync(conf),false);const current=await db.user.findUniqueOrThrow({where:{id:user.id}});assert.equal(current.role,'ADMIN');assert.equal(current.adultVerified,false);assert.equal(current.identityVerified,false);assert.equal(current.mfaGeneration,1);const repeat=cp.spawnSync(process.execPath,[cli,'plan',req,planPath],{encoding:'utf8'});assert.equal(repeat.status,1);assert.equal(repeat.stdout.includes(plan.secret),false);assert.equal(repeat.stderr.includes(plan.secret),false);console.log(JSON.stringify({id:user.id,email:user.email}));}finally{fs.rmSync(dir,{recursive:true,force:true});await db.$disconnect();}`,
    ),
  );
}

async function checkDevelopmentStorage() {
  const name = `cubers-smoke-storage-${runId}`,
    volume = `${name}-data`;
  const credentials = [
    "-e",
    `S3_ACCESS_KEY=${randomBytes(12).toString("hex")}`,
    "-e",
    `S3_SECRET_KEY=${randomBytes(24).toString("hex")}`,
  ];
  const start = () =>
    command([
      "run",
      "--detach",
      "--name",
      name,
      "--network",
      "none",
      "--read-only",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges:true",
      "--tmpfs",
      "/tmp:size=67108864,mode=1777",
      "--mount",
      `type=volume,src=${volume},dst=/data`,
      ...credentials,
      "-e",
      "S3_BUCKETS=cubers-intl,cubers-cn",
      "-e",
      "STORAGE_CORS_ORIGINS=http://localhost:8081",
      images.developmentStorage,
    ]);
  const execute = (code: string) =>
    command([
      "exec",
      name,
      "node",
      "-e",
      `(async()=>{${code}})().catch(()=>process.exitCode=1)`,
    ]);
  const ready = () =>
    waitFor(async () => {
      try {
        return (
          (
            await execute(
              "const r=await fetch('http://127.0.0.1:9000');if(r.status!==403)throw new Error();console.log('ready')",
            )
          ).stdout.trim() === "ready"
        );
      } catch {
        return false;
      }
    });
  const client =
    "const {S3Client,PutObjectCommand,GetObjectCommand,ListObjectsV2Command,DeleteObjectCommand}=require('@aws-sdk/client-s3');const client=new S3Client({endpoint:'http://127.0.0.1:9000',region:'us-east-1',forcePathStyle:true,credentials:{accessKeyId:process.env.S3_ACCESS_KEY,secretAccessKey:process.env.S3_SECRET_KEY}});";
  await command(["volume", "create", volume]);
  try {
    await start();
    await ready();
    await execute(
      `${client}for(const Bucket of ['cubers-intl','cubers-cn'])await client.send(new PutObjectCommand({Bucket,Key:'synthetic',Body:Bucket}));client.destroy();const r=await fetch('http://127.0.0.1:9000/cubers-intl/synthetic',{method:'OPTIONS',headers:{Origin:'http://localhost:8081','Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'content-type'}});if(!r.ok||!['*','http://localhost:8081'].includes(r.headers.get('access-control-allow-origin')))throw new Error();const denied=await fetch('http://127.0.0.1:9000/cubers-intl/synthetic',{method:'OPTIONS',headers:{Origin:'https://attacker.invalid','Access-Control-Request-Method':'PUT'}});if(denied.status!==403||process.getuid()===0)throw new Error()`,
    );
    await execute(
      `${client}await client.send(new PutObjectCommand({Bucket:"cubers-intl",Key:"synthetic-second",Body:"pagination"}));const first=await client.send(new ListObjectsV2Command({Bucket:"cubers-intl",MaxKeys:1}));if(!first.IsTruncated||!first.NextContinuationToken)throw new Error();await client.send(new DeleteObjectCommand({Bucket:"cubers-intl",Key:first.Contents[0].Key}));const second=await client.send(new ListObjectsV2Command({Bucket:"cubers-intl",MaxKeys:1}));if(second.Contents?.length!==1||second.Contents[0].Key===first.Contents[0].Key)throw new Error();client.destroy();`,
    );
    await command(["stop", name]);
    assert.equal(
      (
        await command(["inspect", name, "--format", "{{.State.ExitCode}}"])
      ).stdout.trim(),
      "0",
    );
    await command(["rm", name]);
    await start();
    await ready();
    await execute(
      `${client}for(const Bucket of ['cubers-intl','cubers-cn']){const r=await client.send(new GetObjectCommand({Bucket,Key:'synthetic'}));if(await r.Body.transformToString()!==Bucket)throw new Error()}client.destroy()`,
    );
    report.developmentStorage =
      "Non-root, read-only image, two development buckets, bounded V2 list/delete draining, browser CORS, clean shutdown and persistent named-volume objects after recreation";
  } finally {
    try {
      await command(["rm", "--force", name]);
      await command(["volume", "rm", volume]);
    } catch {
      report.cleanupIncomplete = true;
      report.remainingDevelopmentStorage = { name, volume };
    }
  }
}
async function checkCommunityAuthority(s: Stack) {
  const proof = JSON.parse(
    await inside(
      s,
      `
    require('reflect-metadata');
    const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
    const {PrismaClient}=require('@prisma/client'),{Infrastructure}=require('./apps/api/dist/services');
    const {readConfig}=require('./apps/api/dist/config'),{accountPolicy}=require('./apps/api/dist/security');
    const {CommunityController}=require('./apps/api/dist/community.controller'),{AdminController}=require('./apps/api/dist/admin.controller');
    const {Competitions}=require('./apps/api/dist/competitions'),{Campaigns}=require('./apps/api/dist/campaigns');
    const db=new PrismaClient(),infra=new Infrastructure(readConfig());
    async function person(name,role='USER',birthDate='1985-01-01'){
      const user=await db.user.create({data:{email:name+'-${runId}@cubers.invalid',displayName:'Synthetic authority check',passwordHash:'unused',birthDate,region:process.env.REGION,emailVerified:true,adultVerified:true,identityVerified:true,role,mfaSecret:role==='ADMIN'?'SYNTHETICONLY':null}});
      const session=await db.session.create({data:{userId:user.id,tokenHash:randomUUID(),mfaVerified:role==='ADMIN',expiresAt:new Date(Date.now()+60000)}});
      return {user,sessionId:session.id,policy:await accountPolicy(db,user)};
    }
    async function denied(action){await assert.rejects(action(),e=>e.getStatus?.()===403);}
    try{
      const community=new CommunityController(db,infra),admin=new AdminController(db,infra,new Competitions(db,infra),new Campaigns(db,infra));
      const actor=await person('community-wait'),parent=await person('community-parent','ADMIN'),reviewer=await person('community-reviewer','ADMIN'),child=await person('community-child','USER','2018-01-01');
      let release,acquired;const gate=new Promise(r=>release=r),locked=new Promise(r=>acquired=r);
      const blocker=db.$transaction(async tx=>{await tx.$queryRawUnsafe('SELECT id FROM "User" WHERE id=$1::uuid FOR UPDATE',actor.user.id);acquired();await gate;await tx.session.delete({where:{id:actor.sessionId}});},{timeout:10000});
      await locked;
      const pending=community.report(actor,{targetId:randomUUID(),reason:'Synthetic captured-session report'}).then(()=>({status:201}),e=>({status:e.getStatus?.()}));
      try{let waited=false;for(let i=0;i<100;i++){const rows=await db.$queryRawUnsafe(\`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%SELECT id FROM "User"%') AS waiting\`);if(rows[0].waiting){waited=true;break;}await new Promise(r=>setTimeout(r,10));}assert.equal(waited,true);}finally{release();await blocker;}
      assert.equal((await pending).status,403);assert.equal(await db.report.count({where:{reporterId:actor.user.id}}),0);
      const pdf=Buffer.from('${consentPdfFixture().toString("base64")}','base64'),{createHash}=require('node:crypto'),{PutObjectCommand,GetObjectCommand}=require('@aws-sdk/client-s3');
      const document=await db.media.create({data:{userId:parent.user.id,key:process.env.REGION+'/'+parent.user.id+'/'+randomUUID()+'/clean',size:pdf.length,sha256:createHash('sha256').update(pdf).digest('hex'),status:'READY',type:'application/pdf',purpose:'consent'}});
      await infra.storage.send(new PutObjectCommand({Bucket:infra.config.S3_BUCKET,Key:document.key,Body:pdf,ContentType:'application/pdf'}));
      const consent=await db.consent.create({data:{childId:child.user.id,guardianId:parent.user.id,documentId:document.id,status:'PENDING',publicPosting:true}});
      const review={approve:true,reason:'Synthetic independent document review',signedDocumentChecked:true,guardianIdentityChecked:true,relationshipChecked:true};
      await denied(()=>admin.consent(parent,consent.id,review));
      await assert.rejects(admin.consent(reviewer,consent.id,review),e=>e.getStatus?.()===400);
      const {consentDocumentPreview}=require('./apps/api/dist/consent-document');
      const {renderConsentPages}=require('./apps/api/dist/consent-document');
      await assert.rejects(renderConsentPages(infra.config.CONSENT_REVIEW_SOCKET,Buffer.from('not a PDF')));
      await assert.rejects(renderConsentPages(infra.config.CONSENT_REVIEW_SOCKET,Buffer.from('${consentPdfFixture(9).toString("base64")}','base64')));
      const preview=await consentDocumentPreview(db,infra,reviewer,document.id);
      assert.equal(preview.pages.length,1);assert.ok(preview.pages[0].startsWith('data:image/jpeg;base64,'));assert.equal(preview.signatureValidated,false);
      const restored=await infra.storage.send(new GetObjectCommand({Bucket:infra.config.S3_BUCKET,Key:document.key}));assert.deepEqual(Buffer.from(await restored.Body.transformToByteArray()),pdf);
      await admin.consent(reviewer,consent.id,{...review,documentReviewId:preview.reviewId});
      const post=await db.post.create({data:{authorId:child.user.id,body:'Synthetic independent child publication'}});
      await community.guardianApprove(parent,post.id,{revision:1});
      const postReview={approve:true,revision:1,reason:'Synthetic independent content review'};
      await denied(()=>admin.post(parent,post.id,postReview));
      await admin.post(reviewer,post.id,postReview);
      assert.equal((await db.post.findUniqueOrThrow({where:{id:post.id}})).status,'PUBLISHED');
      const report=await db.report.create({data:{reporterId:child.user.id,targetId:post.id,reason:'Synthetic pending report'}});
      await db.user.update({where:{id:reviewer.user.id},data:{role:'USER'}});
      await denied(()=>admin.review(reviewer,'report',report.id,{approve:true,reason:'Stale role cannot review'}));
      await denied(()=>admin.ai(reviewer,{baseUrl:'http://127.0.0.1:4010/v1',model:'cubers-simulator',enabled:true}));
      assert.equal((await db.report.findUniqueOrThrow({where:{id:report.id}})).status,'OPEN');
      assert.equal(await db.audit.count({where:{actorId:reviewer.user.id,action:{in:['report.review','settings.ai']}}}),0);
      console.log(JSON.stringify({waitedRevocation:true,independentConsent:true,independentPost:true,currentStaff:true,approvalFlagsUnchanged:process.env.CN_SOCIAL_APPROVED==='false'}));
    }finally{await db.$disconnect();await infra.close();}
  `,
    ),
  );
  assert.deepEqual(proof, {
    waitedRevocation: true,
    independentConsent: true,
    independentPost: true,
    currentStaff: true,
    approvalFlagsUnchanged: true,
  });
  s.checks.push(
    "Compiled community writes reject actual lock-wait revocation and stale staff authority; independent child consent/post reviews, regional approval flags remain off",
  );
  s.checks.push(
    "Isolated no-network PDF rendering, unchanged original, fresh staff receipt and approval without raw-document delivery",
  );
  const documentContainer = (
    await compose(s, ["ps", "-q", "documents"])
  ).stdout.trim();
  const isolated = JSON.parse(
    (await command(["inspect", documentContainer, "--format", "{{json .}}"]))
      .stdout,
  );
  assert.equal(isolated.HostConfig.NetworkMode, "none");
  assert.equal(isolated.HostConfig.ReadonlyRootfs, true);
  assert.equal(isolated.Config.User, "1000:1000");
  assert.ok(
    isolated.HostConfig.Memory > 0 && isolated.HostConfig.PidsLimit > 0,
  );
  assert.ok(isolated.HostConfig.CapDrop.includes("ALL"));
  assert.ok(isolated.HostConfig.SecurityOpt.includes("no-new-privileges:true"));
  assert.ok(
    !isolated.Config.Env.some((entry: string) =>
      /^(DATABASE_URL|REDIS_URL|S3_|AI_|OPENAI_|QWEN_)/.test(entry),
    ),
  );
}
async function checkOperationalDelivery(s: Stack) {
  const result = JSON.parse(
    await inside(
      s,
      `
    const assert=require('node:assert/strict'),fs=require('node:fs/promises'),https=require('node:https'),{join}=require('node:path'),{tmpdir}=require('node:os'),{randomBytes,createHmac}=require('node:crypto'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
    const {OperationalOutbox}=require('./apps/api/dist/operational-outbox'),{OperationalDelivery}=require('./apps/api/dist/operational-delivery'),{loadOperationalWebhook,sendOperationalWebhook,resolveOperationalWebhook}=require('./apps/api/dist/operational-webhook');
    const root=await fs.mkdtemp(join(tmpdir(),'cubers-alerts-')),directory=join(root,'queue'),secret=randomBytes(32),file=join(root,'webhook.json');await fs.mkdir(directory,{mode:0o700});
    await fs.writeFile(file,JSON.stringify({version:1,region:process.env.REGION,endpoint:'https://collector.cubers.invalid/alerts',keyId:'synthetic',key:secret.toString('base64')}),{mode:0o600});
    let queue,credential,server,delivery;
    try{
      credential=await loadOperationalWebhook(file,process.env.REGION,'collector.cubers.invalid');
      await assert.rejects(loadOperationalWebhook(file,process.env.REGION==='INTL'?'CN':'INTL','collector.cubers.invalid'));
      await assert.rejects(resolveOperationalWebhook(credential.endpoint,AbortSignal.timeout(1000),async()=>[{address:'127.0.0.1',family:4}]));
      const snapshot=state=>({region:process.env.REGION,sampledAt:new Date(Date.now()).toISOString(),state,checks:[{signal:'database',state,count:null,oldestAt:null,thresholdSeconds:null}],queue:null});
      queue=await OperationalOutbox.open(directory,credential);assert.equal(queue.observe(snapshot('critical')).length,1);queue.close();queue=undefined;
      queue=await OperationalOutbox.open(directory,credential);assert.equal(queue.observe(snapshot('ok'))[0].event,'cubers.operational.recovery');
      await promisify(execFile)('/usr/bin/openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=collector.cubers.invalid','-addext','subjectAltName=DNS:collector.cubers.invalid','-keyout',join(root,'tls.key'),'-out',join(root,'tls.pem')],{timeout:10000});
      const ca=await fs.readFile(join(root,'tls.pem'),'utf8'),received=[];
      server=https.createServer({key:await fs.readFile(join(root,'tls.key')),cert:ca},async(req,res)=>{try{const parts=[];for await(const b of req)parts.push(b);const body=Buffer.concat(parts).toString(),event=JSON.parse(body);const signed='CubersOperationalAlerts1\\nsynthetic\\n'+req.headers['x-cubers-sent-at']+'\\n'+body;assert.equal(req.headers['x-cubers-signature'],'sha256='+createHmac('sha256',secret).update(signed).digest('hex'));assert.equal(req.socket.servername,'collector.cubers.invalid');assert.equal(event.alert.region,process.env.REGION);assert.equal(Object.hasOwn(event.alert,'userId'),false);received.push(event.alert.event);res.writeHead(204).end();}catch{res.writeHead(400).end();}});
      await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const target=new URL(credential.endpoint);target.port=String(server.address().port);
      delivery=new OperationalDelivery(queue,credential,(body,signal)=>sendOperationalWebhook(target,{address:'127.0.0.1',family:4},credential.headers(body),body,signal,ca));
      const sent=await delivery.run();assert.equal(sent.delivered,2);assert.equal(sent.pending,0);assert.deepEqual(received,['cubers.operational.alert','cubers.operational.recovery']);
      await delivery.close();delivery=undefined;queue=undefined;credential=undefined;
      console.log(JSON.stringify({durableRestart:true,orderedRecovery:true,localTls:2,signature:true,privateDnsDenied:true,noRemoteRecipient:true}));
    }finally{if(delivery){await delivery.close();queue=undefined;credential=undefined;}if(queue)queue.close();if(credential)credential.destroy();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}secret.fill(0);await fs.rm(root,{recursive:true,force:true});}
  `,
    ),
  );
  assert.deepEqual(result, {
    durableRestart: true,
    orderedRecovery: true,
    localTls: 2,
    signature: true,
    privateDnsDenied: true,
    noRemoteRecipient: true,
  });
  s.checks.push(
    "Compiled independent operational outbox, restart recovery and ordered signed delivery to a local TLS fixture; real destinations remain unconfigured",
  );
}
async function checkSnapshotExpiry(s: Stack) {
  const result = JSON.parse(
    await inside(
      s,
      `
    const assert=require('node:assert/strict'),fs=require('node:fs/promises'),{join}=require('node:path'),{tmpdir}=require('node:os'),{Readable}=require('node:stream'),{promisify}=require('node:util'),{execFile}=require('node:child_process');
    const {FileDeletionJournal}=require('./apps/api/dist/deletion-journal'),snapshot=require('./apps/api/dist/database-snapshot');
    const root=await fs.mkdtemp(join(tmpdir(),'cubers-snapshot-expiry-')),directory=join(root,'archives'),keys=join(root,'keys'),history=join(root,'journal');
    try {
      for(const path of [directory,keys,history])await fs.mkdir(path,{mode:0o700});
      const keyFile=join(keys,'snapshot.json'),journalFile=join(keys,'journal.json'),journal=await FileDeletionJournal.initialize(history,journalFile,process.env.REGION);await journal.bindSource(snapshot.databaseFingerprint(process.env.DATABASE_URL));await snapshot.initializeSnapshotKey(keyFile,journal);
      const capture=age=>snapshot.captureSnapshot(Readable.from(['PGDMP synthetic expiry fixture']),directory,keyFile,journal,process.env.DATABASE_URL,new Date(Date.now()-age*86400000).toISOString());
      const old=await capture(31),partial=await capture(31),live=await capture(0);await fs.unlink(join(directory,partial.id,'database.enc'));const keyBefore=await fs.readFile(keyFile);
      const url=new URL(process.env.DATABASE_URL),request=join(root,'request.json'),body={region:process.env.REGION,databaseHost:url.hostname,databaseName:decodeURIComponent(url.pathname.slice(1)),directory,keyFile,intervalSeconds:30,confirmation:'RUN REGIONAL SNAPSHOT EXPIRY'};await fs.writeFile(request,JSON.stringify(body),{mode:0o600});
      const env={...process.env,DELETION_JOURNAL_MODE:'file',DELETION_JOURNAL_DIRECTORY:history,DELETION_JOURNAL_KEY_FILE:journalFile};
      const command=['apps/api/dist/snapshot-expiry-cli.js','once',request];const first=JSON.parse((await promisify(execFile)(process.execPath,command,{env,timeout:15000})).stdout);assert.deepEqual(first,{failures:0,bundles:3,targets:0,purged:2});assert.deepEqual(await fs.readdir(directory),[live.id]);assert.deepEqual(await fs.readFile(keyFile),keyBefore);
      await fs.writeFile(request,JSON.stringify({...body,now:Date.now()+40*86400000}),{mode:0o600});await assert.rejects(promisify(execFile)(process.execPath,command,{env,timeout:15000}));assert.deepEqual(await fs.readdir(directory),[live.id]);
      const verified=await snapshot.verifySnapshot(join(directory,live.id),keyFile,journal);verified.key.fill(0);
      console.log(JSON.stringify({compiledCli:true,expiredRemoved:2,liveUnchanged:true,keyUnchanged:true,clockOverrideDenied:true}));
    }finally{await fs.rm(root,{recursive:true,force:true});}
  `,
    ),
  );
  assert.deepEqual(result, {
    compiledCli: true,
    expiredRemoved: 2,
    liveUnchanged: true,
    keyUnchanged: true,
    clockOverrideDenied: true,
  });
  s.checks.push(
    "Compiled protected standalone snapshot expiry removes only authenticated expired archives, resumes partial deletion and preserves live backups and shared keys; request clock overrides refused",
  );
}
async function checkSmartLearning(s: Stack) {
  const proof = JSON.parse(
    await inside(
      s,
      `
    require('reflect-metadata');const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{PrismaClient}=require('@prisma/client');
    const core=require('@cubers/core'),{Infrastructure}=require('./apps/api/dist/services'),{readConfig}=require('./apps/api/dist/config'),{accountPolicy}=require('./apps/api/dist/security'),{SmartLearningController,SmartLessonAccess}=require('./apps/api/dist/smart-learning.controller');
    const db=new PrismaClient(),infra=new Infrastructure(readConfig());
    class SyntheticAcceptance extends SmartLessonAccess{require(){}}
    async function person(){const user=await db.user.create({data:{email:randomUUID()+'@cubers.invalid',displayName:'Synthetic smart learning',passwordHash:'unused',birthDate:'1990-01-01',region:process.env.REGION,emailVerified:true,adultVerified:true}}),session=await db.session.create({data:{userId:user.id,tokenHash:randomUUID(),expiresAt:new Date(Date.now()+60000)}});return {user,sessionId:session.id,policy:await accountPolicy(db,user)};}
    try {
      const lesson=core.lessons.find(l=>l.puzzle==='3x3'&&l.alternatives?.length),course=await db.course.findUniqueOrThrow({where:{id:lesson.id}}),service=new SmartLearningController(db,infra,new SyntheticAcceptance()),disabled=new SmartLessonAccess();
      for(const model of ['gan-356-i3','gocube-edge','giiker-i3s']) {
        assert.throws(()=>disabled.require(model,'ios'),e=>e.getStatus?.()===403);
        const actor=await person(),option=course.content.alternatives[0];
        let row=await service.create(actor,course.id,{model,platform:'ios',courseVersion:course.version,alternativeId:option.id}),counter=model==='gan-356-i3'?250:null;
        const frame=new core.SmartCubeFrame(row.smart.reference),hardware=frame.toHardwareState(core.practiceSetup('3x3',row.algorithm)),moves=option.algorithm.split(' ');
        row=await service.action(actor,row.id,{action:'confirm',version:row.version,epoch:row.smart.epoch,faces:core.facelets(hardware),counter});
        const turns=moves.map((move,i)=>({sequence:i,move:frame.toHardwareMove(move),receivedAt:100+i,counter:counter===null?null:(counter+i+1)&255,recovered:false})),final=core.applyMoves(hardware,turns.map(t=>t.move)),end=counter===null?null:(counter+moves.length)&255;
        row=await service.action(actor,row.id,{action:'turns',version:row.version,epoch:row.smart.epoch,turns,faces:core.facelets(final),counter:end,independentState:true});
        row=await service.action(actor,row.id,{action:'finish',version:row.version,epoch:row.smart.epoch,faces:core.facelets(final),counter:end});
        assert.equal(row.status,'COMPLETED');assert.deepEqual(row.moves,moves);assert.equal(row.guideId,option.id);
        const saved=await db.lessonSession.findUniqueOrThrow({where:{id:row.id}}),progress=await db.progress.findUniqueOrThrow({where:{userId_lessonId:{userId:actor.user.id,lessonId:lesson.id}}});
        assert.equal(saved.input,'smart');assert.equal(saved.smart.continuity,counter===null?'net-state':'counter');assert.equal(progress.repetitions,1);
        await assert.rejects(service.action(actor,row.id,{action:'finish',version:row.version,epoch:row.smart.epoch,faces:core.facelets(final),counter:end}),e=>e.getStatus?.()===409);
      }
      assert.equal(core.smartDeviceCatalogue().every(r=>!r.enabled&&!r.physicallyTested&&!r.learningEnabled&&!r.learningPlatforms.length),true);
      console.log(JSON.stringify({models:3,privateProgress:true,replayDenied:true,productionGatesOff:true,syntheticOnly:true}));
    }finally{await db.$disconnect();await infra.close();}
  `,
    ),
  );
  assert.deepEqual(proof, {
    models: 3,
    privateProgress: true,
    replayDenied: true,
    productionGatesOff: true,
    syntheticOnly: true,
  });
  s.checks.push(
    "Compiled private smart learning validates three synthetic model streams, frame/counter/version/guide persistence and single progress; all physical activation gates remain off",
  );
}
async function checkSmartFirstSolves(s: Stack) {
  const proof = JSON.parse(
    await inside(
      s,
      `
    require('reflect-metadata');const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{PrismaClient}=require('@prisma/client');
    const core=require('@cubers/core'),{Infrastructure}=require('./apps/api/dist/services'),{readConfig}=require('./apps/api/dist/config'),{accountPolicy}=require('./apps/api/dist/security'),{SmartLessonAccess}=require('./apps/api/dist/smart-learning.controller'),{SmartFirstSolveController}=require('./apps/api/dist/smart-first-solve.controller'),{FirstSolveSolver}=require('./apps/api/dist/first-solve-solver');
    const db=new PrismaClient(),infra=new Infrastructure(readConfig()),solver=new FirstSolveSolver();
    class SyntheticAcceptance extends SmartLessonAccess{require(){}}
    try {
      const course=await db.course.findUniqueOrThrow({where:{id:'3-first-solve'}}),service=new SmartFirstSolveController(db,infra,new SyntheticAcceptance(),solver),disabled=new SmartLessonAccess();
      for(const model of ['gan-356-i3','gocube-edge','giiker-i3s']) {
        for(const platform of ['ios','android'])assert.throws(()=>disabled.require(model,platform),e=>e.getStatus?.()===403);
        const user=await db.user.create({data:{email:randomUUID()+'@cubers.invalid',displayName:'Synthetic smart first solve',passwordHash:'unused',birthDate:'1990-01-01',region:process.env.REGION,emailVerified:true,adultVerified:true}}),session=await db.session.create({data:{userId:user.id,tokenHash:randomUUID(),expiresAt:new Date(Date.now()+60000)}}),actor={user,sessionId:session.id,policy:await accountPolicy(db,user)};
        let hardware=core.applyMoves(core.solvedCube(),'R U F2'),row=await service.create(actor,{model,platform:'ios',courseVersion:course.version,faces:core.facelets(hardware),counter:model==='gan-356-i3'?250:null});
        const frame=new core.SmartCubeFrame(row.smart.reference),epoch=row.smart.epoch,received=[];let sequence=0;
        while(row.status==='PRACTICING') {
          assert.ok(row.guidance.stage<13);const turns=[];
          for(const move of row.guidance.step.moves){const raw=frame.toHardwareMove(move),packets=model!=='giiker-i3s'&&raw.endsWith('2')?[raw[0],raw[0]]:[raw];for(const packet of packets){hardware=core.applyMoves(hardware,[packet]);const n=sequence++;received.push(frame.toTeachingMove(packet));turns.push({sequence:n,move:packet,receivedAt:100+n,counter:model==='gan-356-i3'?(251+n)&255:null,recovered:false});}}
          while(turns.length){const batch=turns.splice(0,50),final=batch.at(-1),prior=core.fromFacelets(3,row.guidance.currentFaces),projected=core.practiceApply(prior,batch.map(t=>frame.toTeachingMove(t.move))),raw=frame.toHardwareState(projected);row=await service.action(actor,row.id,{action:'turns',version:row.version,epoch,turns:batch,faces:core.facelets(raw),counter:final.counter,independentState:!turns.length});}
          row=await service.action(actor,row.id,{action:'checkpoint',version:row.version,epoch,faces:core.facelets(hardware),counter:model==='gan-356-i3'?(250+sequence)&255:null});
          assert.equal(row.smart.epoch,epoch);assert.equal(row.smart.nextSequence,sequence);
        }
        const saved=await db.guidedSolve.findUniqueOrThrow({where:{id:row.id}}),progress=await db.progress.findUniqueOrThrow({where:{userId_lessonId:{userId:user.id,lessonId:course.id}}});
        assert.equal(row.status,'COMPLETED');assert.equal(row.guidance.stage,13);assert.equal(core.practiceSolved(hardware),true);assert.deepEqual(saved.moves,received);assert.equal(saved.checkpoints.length,13);assert.equal(saved.scrambleSource,null);assert.equal(progress.repetitions,1);
        await assert.rejects(service.action(actor,row.id,{action:'checkpoint',version:row.version,epoch,faces:core.facelets(hardware),counter:row.smart.counter}),e=>e.getStatus?.()===409);
      }
      assert.equal(core.smartDeviceCatalogue().every(r=>!r.enabled&&!r.physicallyTested&&!r.learningEnabled&&!r.learningPlatforms.length),true);
      console.log(JSON.stringify({models:3,stages:13,privateProgress:true,productionGatesOff:true,syntheticOnly:true}));
    }finally{await solver.onModuleDestroy();await db.$disconnect();await infra.close();}
  `,
    ),
  );
  assert.deepEqual(proof, {
    models: 3,
    stages: 13,
    privateProgress: true,
    productionGatesOff: true,
    syntheticOnly: true,
  });
  s.checks.push(
    "Compiled smart first-solve guidance verifies all 13 stages for three synthetic device streams, preserves actual turns and epoch, rejects completion replay and keeps hardware gates off",
  );
}
async function checkSmartPlay(s: Stack) {
  const proof = JSON.parse(
    await inside(
      s,
      `
  require('reflect-metadata');const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{PrismaClient}=require('@prisma/client'),core=require('@cubers/core'),{readConfig}=require('./apps/api/dist/config'),{Infrastructure}=require('./apps/api/dist/services'),{accountPolicy}=require('./apps/api/dist/security'),{PlayController}=require('./apps/api/dist/play.controller'),{Competitions}=require('./apps/api/dist/competitions'),{SmartPlayAccess}=require('./apps/api/dist/smart-play-access'),{SmartAttemptController}=require('./apps/api/dist/smart-attempt.controller');
  const db=new PrismaClient(),infra=new Infrastructure({...readConfig(),NODE_ENV:'test',CN_GAMES_APPROVED:'true'});
  class SyntheticAcceptance extends SmartPlayAccess{room(){}require(){}}
  try{
   const access=new SyntheticAcceptance(),play=new PlayController(db,infra,new Competitions(db,infra),access),smart=new SmartAttemptController(db,infra,play,access),disabled=new SmartPlayAccess();
   for(const model of ['gan-356-i3','gocube-edge','giiker-i3s']){
    assert.throws(()=>disabled.room('3x3'),e=>e.getStatus?.()===400);assert.throws(()=>disabled.require(model,'ios'),e=>e.getStatus?.()===403);
    const user=await db.user.create({data:{email:randomUUID()+'@cubers.invalid',displayName:'Synthetic smart game',passwordHash:'unused',birthDate:'1990-01-01',region:process.env.REGION,emailVerified:true,adultVerified:true}}),session=await db.session.create({data:{userId:user.id,tokenHash:randomUUID(),expiresAt:new Date(Date.now()+60000)}}),actor={user,sessionId:session.id,policy:await accountPolicy(db,user)},room=await play.create(actor,{puzzle:'3x3',input:'smart',mode:'sprint',ranked:false,private:true});
    await play.startRoom(actor,room.id);const created=await play.attempt(actor,room.id);let row=await smart.bind(actor,created.id,{nonce:created.nonce,version:created.version,model,platform:'ios',faces:core.facelets(core.solvedCube()),counter:model==='gan-356-i3'?254:null});
    const epoch=row.smart.epoch;await play.inspect(actor,row.id,{nonce:row.nonce});await play.start(actor,row.id,{nonce:row.nonce});await new Promise(resolve=>setTimeout(resolve,350));row=await smart.get(actor,row.id);
    await assert.rejects(play.moves(actor,row.id,{nonce:row.nonce,events:[{sequence:0,move:'R',elapsedMs:1}]}),e=>e.getStatus?.()===400);
    const turns=room.target.map((move,i)=>({sequence:i,move,receivedAt:100+i,counter:model==='gan-356-i3'?(255+i)&255:null,recovered:false})),final=core.applyMoves(core.solvedCube(),room.target);
    row=await smart.turns(actor,row.id,{action:'turns',nonce:row.nonce,version:row.version,epoch,turns,faces:core.facelets(final),counter:model==='gan-356-i3'?2:null,independentState:true});
    const result=await play.finish(actor,row.id,{nonce:row.nonce});assert.equal(result.status,'APPROVED');const saved=await db.attempt.findUniqueOrThrow({where:{id:row.id}});assert.equal(saved.smart.epoch,epoch);assert.equal(saved.smart.nextSequence,4);assert.deepEqual(saved.moves.map(e=>e.move),room.target);assert.equal(saved.evidenceId,null);
    await assert.rejects(play.finish(actor,row.id,{nonce:row.nonce}),e=>e.getStatus?.()===403);
   }
   assert.equal(core.smartDeviceCatalogue().every(row=>!row.playEnabled&&!row.playPlatforms.length&&!row.enabled&&!row.physicallyTested),true);
   console.log(JSON.stringify({models:3,virtualBypassDenied:true,epochAndCounterPreserved:true,syntheticOnly:true,productionGatesOff:true}));
  }finally{await db.$disconnect();await infra.close();}
 `,
    ),
  );
  assert.deepEqual(proof, {
    models: 3,
    virtualBypassDenied: true,
    epochAndCounterPreserved: true,
    syntheticOnly: true,
    productionGatesOff: true,
  });
  s.checks.push(
    "Compiled smart game controllers verify three synthetic model streams, bounded counters and epochs, independent states and virtual-bypass refusal; physical and production ranking gates stay off",
  );
}
async function checkMixedRooms(s: Stack) {
  const proof = JSON.parse(
    await inside(
      s,
      `
require('reflect-metadata');const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{PrismaClient}=require('@prisma/client'),core=require('@cubers/core'),{readConfig}=require('./apps/api/dist/config'),{Infrastructure}=require('./apps/api/dist/services'),{accountPolicy}=require('./apps/api/dist/security'),{PlayController}=require('./apps/api/dist/play.controller'),{Competitions}=require('./apps/api/dist/competitions'),{SmartPlayAccess}=require('./apps/api/dist/smart-play-access'),{SmartAttemptController}=require('./apps/api/dist/smart-attempt.controller'),{ProfileController}=require('./apps/api/dist/profile.controller'),{Replays}=require('./apps/api/dist/replays');
const db=new PrismaClient(),infra=new Infrastructure({...readConfig(),NODE_ENV:'test',CN_GAMES_APPROVED:'true'}),replays=new Replays();
class SyntheticAcceptance extends SmartPlayAccess{room(puzzle){assert.equal(puzzle,'3x3');}require(){}}
async function person(){const user=await db.user.create({data:{email:randomUUID()+'@cubers.invalid',displayName:'Synthetic mixed room',passwordHash:'unused',birthDate:'1990-01-01',region:process.env.REGION,emailVerified:true,adultVerified:true}}),session=await db.session.create({data:{userId:user.id,tokenHash:randomUUID(),expiresAt:new Date(Date.now()+60000)}});return {user,sessionId:session.id,policy:await accountPolicy(db,user)};}
try{
const access=new SyntheticAcceptance(),play=new PlayController(db,infra,new Competitions(db,infra),access),smart=new SmartAttemptController(db,infra,play,access),profile=new ProfileController(db,infra,replays),actors=await Promise.all([person(),person(),person()]),room=await play.create(actors[0],{puzzle:'3x3',input:'virtual',mode:'race',mixed:true,ranked:false,private:true});
await play.join(actors[1],{code:room.code,input:'scan'});await play.join(actors[2],{code:room.code,input:'smart'});await play.startRoom(actors[0],room.id);const attempts=await Promise.all(actors.map(actor=>play.attempt(actor,room.id)));
for(const a of attempts){assert.deepEqual(a.scramble,attempts[0].scramble);assert.deepEqual(a.scrambleSource,attempts[0].scrambleSource);}assert.deepEqual(attempts.map(a=>a.input),['virtual','scan','smart']);
for(let i=0;i<3;i++){
 const actor=actors[i],a=attempts[i],hardware=core.applyMoves(core.solvedCube(),a.scramble);let row;
 if(i===1){await play.checkpoint(actor,a.id,{nonce:a.nonce,stage:'scramble',faces:core.facelets(hardware)});await assert.rejects(play.moves(actor,a.id,{nonce:a.nonce,events:[{sequence:0,move:'R',elapsedMs:1}]}));}
 if(i===2)row=await smart.bind(actor,a.id,{nonce:a.nonce,version:a.version,model:'gan-356-i3',platform:'ios',faces:core.facelets(hardware),counter:250});
 await play.inspect(actor,a.id,{nonce:a.nonce});await play.start(actor,a.id,{nonce:a.nonce});await db.attempt.update({where:{id:a.id},data:{startedAt:new Date(Date.now()-1000)}});
 const moves=core.inverse(a.scramble);
 if(i===0)await play.moves(actor,a.id,{nonce:a.nonce,events:moves.map((move,sequence)=>({move,sequence,elapsedMs:sequence+1}))});
 if(i===2){row=await smart.get(actor,a.id);const turns=moves.flatMap(move=>move.endsWith('2')?[move[0],move[0]]:[move]);await smart.turns(actor,a.id,{action:'turns',nonce:a.nonce,version:row.version,epoch:row.smart.epoch,turns:turns.map((move,sequence)=>({move,sequence,counter:(251+sequence)&255,receivedAt:100+sequence,recovered:false})),faces:core.facelets(core.solvedCube()),counter:(250+turns.length)&255,independentState:true});}
 let done=await play.finish(actor,a.id,{nonce:a.nonce});if(i===1){assert.equal(done.status,'AWAITING_EVIDENCE');done=await play.checkpoint(actor,a.id,{nonce:a.nonce,stage:'final',faces:core.facelets(core.solvedCube())});}assert.equal(done.status,'APPROVED');
 const history=await profile.history(actor,{input:a.input});assert.equal(history.items.find(item=>item.id===a.id).room.input,a.input);if(i===1)await assert.rejects(profile.replay(actor,a.id));if(i===2)assert.equal((await profile.replay(actor,a.id)).input,'smart');
 await assert.rejects(play.chooseInput(actor,room.id,{input:'virtual'}));await assert.rejects(db.attempt.update({where:{id:a.id},data:{input:i===0?'scan':'virtual'}}));
 assert.equal((await play.rankings(actor,{puzzle:'3x3',input:a.input})).some(row=>row.id===a.id),false);
}
for(const data of [{ranked:true},{mixed:false},{competitionAttempt:true}])await assert.rejects(db.room.update({where:{id:room.id},data}));
const view=await play.room(actors[1],room.id);assert.equal(view.input,'scan');assert.equal(view.mixedScramble,undefined);assert.equal(view.ownAttempt.input,'scan');assert.equal(core.smartDeviceCatalogue().every(row=>!row.enabled&&!row.playEnabled),true);
console.log(JSON.stringify({inputs:3,sharedWca:true,frozen:true,privateCategories:true,rankingsExcluded:true,gatesOff:true}));
}finally{await replays.onModuleDestroy();await db.$disconnect();await infra.close();}
`,
    ),
  );
  assert.deepEqual(proof, {
    inputs: 3,
    sharedWca: true,
    frozen: true,
    privateCategories: true,
    rankingsExcluded: true,
    gatesOff: true,
  });
  s.checks.push(
    "Compiled mixed rooms share WCA scrambles across virtual, scanned and synthetic smart solves; immutable actual inputs, private history, ranking exclusion and disabled device gates verified",
  );
}

async function checkSmartReplays(s: Stack) {
  const proof = JSON.parse(
    await inside(
      s,
      `
require('reflect-metadata');const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{PrismaClient}=require('@prisma/client'),core=require('@cubers/core'),{readConfig}=require('./apps/api/dist/config'),{Infrastructure}=require('./apps/api/dist/services'),{accountPolicy}=require('./apps/api/dist/security'),{PlayController}=require('./apps/api/dist/play.controller'),{Competitions}=require('./apps/api/dist/competitions'),{SmartPlayAccess}=require('./apps/api/dist/smart-play-access'),{SmartAttemptController}=require('./apps/api/dist/smart-attempt.controller'),{ProfileController}=require('./apps/api/dist/profile.controller'),{Replays}=require('./apps/api/dist/replays');
const db=new PrismaClient(),infra=new Infrastructure({...readConfig(),NODE_ENV:'test',CN_GAMES_APPROVED:'true'}),replays=new Replays();class SyntheticAcceptance extends SmartPlayAccess{room(puzzle){assert.equal(puzzle,'3x3');}require(){}}
try{
 const access=new SyntheticAcceptance(),play=new PlayController(db,infra,new Competitions(db,infra),access),smart=new SmartAttemptController(db,infra,play,access),profile=new ProfileController(db,infra,replays);
 for(const model of ['gan-356-i3','gocube-edge','giiker-i3s']){
  const user=await db.user.create({data:{email:randomUUID()+'@cubers.invalid',displayName:'Synthetic replay archive',passwordHash:'unused',birthDate:'1990-01-01',region:process.env.REGION,emailVerified:true,adultVerified:true}}),session=await db.session.create({data:{userId:user.id,tokenHash:randomUUID(),expiresAt:new Date(Date.now()+60000)}}),actor={user,sessionId:session.id,policy:await accountPolicy(db,user)},mixed=model==='gan-356-i3',room=await play.create(actor,{puzzle:'3x3',input:mixed?'virtual':'smart',mode:model==='gocube-edge'?'daily':'race',mixed,ranked:false,private:true});if(mixed)await play.chooseInput(actor,room.id,{input:'smart'});await play.startRoom(actor,room.id);
  const a=await play.attempt(actor,room.id),hardware=core.applyMoves(core.solvedCube(),a.scramble);let row=await smart.bind(actor,a.id,{nonce:a.nonce,version:a.version,model,platform:'ios',faces:core.facelets(hardware),counter:model==='gan-356-i3'?250:null});
  await play.inspect(actor,a.id,{nonce:a.nonce});await play.start(actor,a.id,{nonce:a.nonce});await db.attempt.update({where:{id:a.id},data:{startedAt:new Date(Date.now()-1000)}});row=await smart.get(actor,a.id);
  const turns=core.inverse(a.scramble).flatMap(move=>model!=='giiker-i3s'&&move.endsWith('2')?[move[0],move[0]]:[move]);await smart.turns(actor,a.id,{action:'turns',nonce:a.nonce,version:row.version,epoch:row.smart.epoch,turns:turns.map((move,sequence)=>({move,sequence,counter:model==='gan-356-i3'?(251+sequence)&255:null,receivedAt:100+sequence,recovered:false})),faces:core.facelets(core.solvedCube()),counter:model==='gan-356-i3'?(250+turns.length)&255:null,independentState:true});assert.equal((await play.finish(actor,a.id,{nonce:a.nonce})).status,'APPROVED');
  const packet=await profile.replay(actor,a.id);assert.equal(packet.input,'smart');assert.deepEqual(packet.telemetry,{model,continuity:model==='gan-356-i3'?'counter':'net-state'});assert.equal(core.practiceSolved(core.practiceApply(core.practiceApply(core.solvedPuzzle('3x3'),packet.scramble),packet.moves)),true);for(const field of ['smart','epoch','counter','nonce','platform','evidenceId'])assert.equal(Object.hasOwn(packet,field),false);const item=(await profile.history(actor,{input:'smart'})).items[0];assert.equal(item.replayAvailable,true);assert.equal(model==='gan-356-i3'?item.moveCount>0:item.moveCount===null,true);assert.equal(Object.hasOwn(item,'smart'),false);
  const changed=new ProfileController(db,infra,{validate:async source=>{const packet=await replays.validate(source);await db.attempt.update({where:{id:a.id},data:{version:{increment:1}}});return packet;}});await assert.rejects(changed.replay(actor,a.id),error=>error.getStatus?.()===409);assert.throws(()=>new SmartPlayAccess().require(model,'ios'),error=>error.getStatus?.()===403);
 }
 console.log(JSON.stringify({models:3,privateReplay:true,mixedInput:true,counterlessLabeled:true,postWorkerChangesDenied:true,hardwareOff:true}));
}finally{await replays.onModuleDestroy();await db.$disconnect();await infra.close();}
`,
    ),
  );
  assert.deepEqual(proof, {
    models: 3,
    privateReplay: true,
    mixedInput: true,
    counterlessLabeled: true,
    postWorkerChangesDenied: true,
    hardwareOff: true,
  });
  s.checks.push(
    "Compiled private smart replay workers validate three model archives and actual mixed inputs, exclude connection context, preserve counterless limits, reject changed sources and keep hardware disabled",
  );
}

async function checkReplaySharing(s: Stack) {
  const proof = JSON.parse(
    await inside(
      s,
      `
require('reflect-metadata');const assert=require('node:assert/strict'),{randomUUID,createHash}=require('node:crypto'),{authenticator}=require('otplib'),{PrismaClient}=require('@prisma/client'),core=require('@cubers/core'),{Infrastructure}=require('./apps/api/dist/services'),{readConfig}=require('./apps/api/dist/config'),{accountPolicy}=require('./apps/api/dist/security'),{ReplayShares}=require('./apps/api/dist/replay-shares'),{Replays}=require('./apps/api/dist/replays');
const db=new PrismaClient(),infra=new Infrastructure({...readConfig(),NODE_ENV:'test',CN_GAMES_APPROVED:'true',CN_SOCIAL_APPROVED:'true'}),replays=new Replays(),service=new ReplayShares(db,infra,replays);
async function person(child=false,staff=false){const user=await db.user.create({data:{email:randomUUID()+'@cubers.invalid',displayName:'Synthetic replay share',passwordHash:'unused',birthDate:child?'2018-01-01':'1990-01-01',region:process.env.REGION,emailVerified:true,adultVerified:true,identityVerified:true,role:staff?'ADMIN':'USER',mfaSecret:staff?authenticator.generateSecret():null}}),session=await db.session.create({data:{userId:user.id,tokenHash:randomUUID(),mfaVerified:staff,expiresAt:new Date(Date.now()+120000)}});return {user,sessionId:session.id,policy:await accountPolicy(db,user)};}
async function source(actor){const set=await infra.scrambles.generate('3x3'),moves=core.inverse(set.scrambles[0]),room=await db.room.create({data:{ownerId:actor.user.id,code:randomUUID(),puzzle:'3x3',input:'virtual',mode:'race',private:true,ranked:false}});return db.attempt.create({data:{userId:actor.user.id,roomId:room.id,nonce:randomUUID(),scramble:set.scrambles[0],scrambleSource:set.source,moves:moves.map((move,sequence)=>({move,sequence,elapsedMs:100+sequence})),status:'APPROVED',durationMs:1000}});}
try{
 const owner=await person(),reader=await person(),staff=await person(false,true),parent=await person(false,true),child=await person(true);await db.consent.create({data:{childId:child.user.id,guardianId:parent.user.id,documentId:randomUUID(),status:'APPROVED',publicPosting:true,recording:true}});
 const original=await source(owner),row=await service.prepare(owner,{attemptId:original.id,disclosureConfirmed:true}),link=await service.publish(owner,row.id,{revision:row.revision,packetDigest:row.packetDigest,disclosureConfirmed:true}),packet=(await service.open(reader,{id:row.id,key:link.key})).packet;assert.equal(packet.attemptId,row.id);assert.notEqual(packet.attemptId,original.id);assert.equal(Object.hasOwn(packet,'userId'),false);assert.equal((await db.replayShare.findUniqueOrThrow({where:{id:row.id}})).tokenHash,createHash('sha256').update(link.key).digest('hex'));
 const rotated=await service.publish(owner,row.id,{revision:link.share.revision,packetDigest:row.packetDigest,disclosureConfirmed:true});await assert.rejects(service.open(reader,{id:row.id,key:link.key}),e=>e.getStatus?.()===404);await db.social.create({data:{actorId:owner.user.id,targetId:reader.user.id,kind:'block'}});await assert.rejects(service.open(reader,{id:row.id,key:rotated.key}),e=>e.getStatus?.()===404);await db.social.deleteMany({where:{actorId:owner.user.id,targetId:reader.user.id,kind:'block'}});
 const attempt=await source(child),pending=await service.prepare(child,{attemptId:attempt.id,disclosureConfirmed:true});assert.equal(pending.status,'PENDING_GUARDIAN');const gp=await service.preview(parent,pending.id,'guardian',{}),gr=await service.review(parent,pending.id,'guardian',{revision:gp.revision,packetDigest:gp.packetDigest,receipt:gp.receipt,approve:true,packetChecked:true});assert.equal(gr.status,'PENDING_REVIEW');await assert.rejects(service.preview(parent,pending.id,'staff',{}),e=>e.getStatus?.()===403);const sp=await service.preview(staff,pending.id,'staff',{}),ready=await service.review(staff,pending.id,'staff',{revision:sp.revision,packetDigest:sp.packetDigest,receipt:sp.receipt,approve:true,packetChecked:true});const childLink=await service.publish(child,pending.id,{revision:ready.revision,packetDigest:ready.packetDigest,disclosureConfirmed:true});assert.equal((await service.open(reader,{id:pending.id,key:childLink.key})).packet.attemptId,pending.id);
 const rp=await service.preview(parent,pending.id,'guardian',{});await service.review(parent,pending.id,'guardian',{revision:rp.revision,packetDigest:rp.packetDigest,receipt:rp.receipt,approve:false,packetChecked:true,reason:'Synthetic withdrawal'});assert.equal((await db.replayShare.findUniqueOrThrow({where:{id:pending.id}})).status,'REJECTED');await assert.rejects(service.open(reader,{id:pending.id,key:childLink.key}),e=>e.getStatus?.()===404);
 await service.cancel(owner,row.id,{});await assert.rejects(service.open(reader,{id:row.id,key:rotated.key}),e=>e.getStatus?.()===404);assert.equal(core.smartDeviceCatalogue().every(device=>!device.enabled&&!device.playEnabled),true);
 console.log(JSON.stringify({anonymousSnapshot:true,hashedRotatedLinks:true,blocking:true,exactGuardianStaffReview:true,withdrawal:true,gatesOff:true}));
}finally{await replays.onModuleDestroy();await db.$disconnect();await infra.close();}
`,
    ),
  );
  assert.deepEqual(proof, {
    anonymousSnapshot: true,
    hashedRotatedLinks: true,
    blocking: true,
    exactGuardianStaffReview: true,
    withdrawal: true,
    gatesOff: true,
  });
  s.checks.push(
    "Compiled replay sharing verifies anonymous source-bound snapshots, hashed rotation, recipient blocking, exact guardian and independent MFA review, withdrawal and closed hardware gates",
  );
}

async function checkSmartCompetitions(s: Stack) {
  const proof = JSON.parse(
    await inside(
      s,
      `
  require('reflect-metadata');const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{authenticator}=require('otplib'),{PrismaClient}=require('@prisma/client'),core=require('@cubers/core'),{readConfig}=require('./apps/api/dist/config'),{Infrastructure}=require('./apps/api/dist/services'),{accountPolicy}=require('./apps/api/dist/security'),{Competitions}=require('./apps/api/dist/competitions'),{PlayController}=require('./apps/api/dist/play.controller'),{SmartPlayAccess}=require('./apps/api/dist/smart-play-access'),{SmartAttemptController}=require('./apps/api/dist/smart-attempt.controller');
  const db=new PrismaClient(),infra=new Infrastructure({...readConfig(),NODE_ENV:'test',CN_GAMES_APPROVED:'true'});
  class SyntheticAcceptance extends SmartPlayAccess{room(puzzle){assert.equal(puzzle,'3x3');}require(){}}
  async function person(staff=false){const user=await db.user.create({data:{email:randomUUID()+'@cubers.invalid',displayName:'Synthetic scheduled smart',passwordHash:'unused',birthDate:'1990-01-01',region:process.env.REGION,emailVerified:true,adultVerified:true,role:staff?'ADMIN':'USER',mfaSecret:staff?authenticator.generateSecret():null}}),session=await db.session.create({data:{userId:user.id,tokenHash:randomUUID(),mfaVerified:staff,expiresAt:new Date(Date.now()+60000)}});return {user,sessionId:session.id,policy:await accountPolicy(db,user)};}
  let phase='setup';try{
   const access=new SyntheticAcceptance(),service=new Competitions(db,infra,access),play=new PlayController(db,infra,service,access),smart=new SmartAttemptController(db,infra,play,access),admin=await person(true),owners=await Promise.all([person(),person(),person()]),now=Date.now();
   phase='draft';const event=await service.create(admin,{title:{en:'Synthetic scheduled smart',zh:'合成智能魔方比赛'},description:{en:'Private compiled workflow fixture',zh:'私密编译工作流测试'},puzzle:'3x3',input:'smart',ranked:false,capacity:3,registrationOpensAt:new Date(now-60000).toISOString(),registrationClosesAt:new Date(now+600000).toISOString(),rounds:[{title:{en:'Private round',zh:'私密轮次'},format:'BEST1',opensAt:new Date(now+1200000).toISOString(),closesAt:new Date(now+1800000).toISOString()}]});
   const reviewed={expectedVersion:1,englishReviewed:true,chineseReviewed:true,rulesReviewed:true,rightsConfirmed:true};await assert.rejects(new Competitions(db,infra).publish(admin,event.id,reviewed),e=>e.getStatus?.()===400);assert.deepEqual((await db.competitionRound.findUniqueOrThrow({where:{id:event.rounds[0].id}})).scrambles,[]);
   phase='publish';await service.publish(admin,event.id,reviewed);for(const actor of owners)await service.register(actor,event.id,{expectedVersion:2,privateResultsUnderstood:true});await db.competitionRound.update({where:{id:event.rounds[0].id},data:{opensAt:new Date(Date.now()-60000),closesAt:new Date(Date.now()+600000)}});
   let shared;for(const [index,model]of ['gan-356-i3','gocube-edge','giiker-i3s'].entries()){
    phase='solve-'+model;const actor=owners[index],entered=await service.enter(actor,event.id,event.rounds[0].id,{index:0}),a=entered.attempt;if(shared)assert.deepEqual(a.scramble,shared);else shared=a.scramble;
    let hardware=core.applyMoves(core.solvedCube(),a.scramble),row=await smart.bind(actor,a.id,{nonce:a.nonce,version:a.version,model,platform:'ios',faces:core.facelets(hardware),counter:index===0?254:null});const epoch=row.smart.epoch;
    await play.inspect(actor,a.id,{nonce:a.nonce});await play.start(actor,a.id,{nonce:a.nonce});await new Promise(resolve=>setTimeout(resolve,350));row=await smart.get(actor,a.id);
    const received=core.inverse(a.scramble).flatMap(move=>index!==2&&move.endsWith('2')?[move[0],move[0]]:[move]);
    for(let at=0;at<received.length;at+=50){const batch=received.slice(at,at+50);hardware=core.applyMoves(hardware,batch);row=await smart.turns(actor,a.id,{action:'turns',nonce:a.nonce,version:row.version,epoch,turns:batch.map((move,i)=>({sequence:at+i,move,receivedAt:100+at+i,counter:index===0?(255+at+i)&255:null,recovered:false})),faces:core.facelets(hardware),counter:index===0?(254+at+batch.length)&255:null,independentState:at+batch.length===received.length});}
    assert.equal((await play.finish(actor,a.id,{nonce:a.nonce})).status,'APPROVED');const saved=await db.attempt.findUniqueOrThrow({where:{id:a.id},include:{room:true}});assert.equal(saved.room.competitionAttempt,true);assert.equal(saved.room.input,'smart');assert.equal(saved.smart.epoch,epoch);assert.equal(saved.smart.nextSequence,received.length);assert.deepEqual(saved.moves.map(e=>e.move),received);
    const detail=await service.detail(actor,event.id);assert.equal(detail.input,'smart');assert.equal(detail.mine.results.score.status,'PENDING');assert.equal(detail.mine.results.rounds[0].score.status,'SCORED');assert.equal(await db.competitionPublication.count({where:{entry:{competitionId:event.id}}}),0);
   }
   phase='closed-results';await db.competitionRound.update({where:{id:event.rounds[0].id},data:{closesAt:new Date()}});for(const actor of owners)assert.equal((await service.detail(actor,event.id)).mine.results.score.status,'SCORED');await assert.rejects(service.enter(owners[0],event.id,event.rounds[0].id,{index:0}),e=>e.getStatus?.()===409);
   assert.equal(core.smartDeviceCatalogue().every(row=>!row.enabled&&!row.physicallyTested&&!row.playEnabled&&!row.playPlatforms.length),true);
   console.log(JSON.stringify({models:3,sharedScrambles:true,privateResults:true,deadlineDenied:true,defaultGatesOff:true,syntheticOnly:true}));
  }catch(error){console.error(JSON.stringify({scope:'smart-competition',phase,name:error.name,code:error.code,status:error.getStatus?.(),actual:typeof error.actual==='string'&&error.actual.length<40?error.actual:undefined,expected:typeof error.expected==='string'&&error.expected.length<40?error.expected:undefined}));throw error;}finally{await db.$disconnect();await infra.close();}
 `,
    ),
  );
  assert.deepEqual(proof, {
    models: 3,
    sharedScrambles: true,
    privateResults: true,
    deadlineDenied: true,
    defaultGatesOff: true,
    syntheticOnly: true,
  });
  s.checks.push(
    "Compiled scheduled smart competitions verify three model streams, shared community scrambles, private results and round deadlines; default hardware and production gates remain off",
  );
}
async function checkLearningAuthority(s: Stack) {
  const proof = JSON.parse(
    await inside(
      s,
      `
    require('reflect-metadata');
    const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{PrismaClient}=require('@prisma/client');
    const {Infrastructure}=require('./apps/api/dist/services'),{readConfig}=require('./apps/api/dist/config'),{accountPolicy}=require('./apps/api/dist/security');
    const {LearningController}=require('./apps/api/dist/learning.controller'),{AssessmentController}=require('./apps/api/dist/assessment.controller');
    const db=new PrismaClient(),infra=new Infrastructure(readConfig());
    async function person(){const user=await db.user.create({data:{email:randomUUID()+'@cubers.invalid',displayName:'Synthetic learning authority',passwordHash:'unused',birthDate:'1985-01-01',region:process.env.REGION,emailVerified:true,adultVerified:true}});const session=await db.session.create({data:{userId:user.id,tokenHash:randomUUID(),expiresAt:new Date(Date.now()+60000)}});return {user,sessionId:session.id,policy:await accountPolicy(db,user)};}
    try {
      const revoked=await person(),assessment=new AssessmentController(db,infra),learning=new LearningController(db,infra);
      await db.session.update({where:{id:revoked.sessionId},data:{scope:'DELETION'}});
      await assert.rejects(assessment.start(revoked,{puzzle:'3x3'}),e=>e.getStatus?.()===403);
      assert.equal(await db.learningAssessment.count({where:{userId:revoked.user.id}}),0);
      const actor=await person(),lessonId=require('@cubers/core').lessons.find(l=>l.alternatives?.length).id,course=await db.course.findUniqueOrThrow({where:{id:lessonId}}),deadline=Date.now()+2000;
      await db.session.update({where:{id:actor.sessionId},data:{expiresAt:new Date(deadline)}});
      let release,acquired;const gate=new Promise(r=>release=r),locked=new Promise(r=>acquired=r);
      const blocker=db.$transaction(async tx=>{await tx.$queryRawUnsafe('SELECT id FROM "Course" WHERE id=$1 FOR UPDATE',course.id);acquired();await gate;},{timeout:10000});await locked;
      const pending=learning.complete(actor,course.id,{courseVersion:course.version,moves:course.content.algorithm.split(' ')}).then(()=>({status:201}),e=>({status:e.getStatus?.()}));
      try {let waited=false;for(let i=0;i<100;i++){const rows=await db.$queryRawUnsafe("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type=$1 AND query LIKE $2) AS waiting",'Lock','%SELECT id FROM "Course"%');if(rows[0].waiting){waited=true;break;}await new Promise(r=>setTimeout(r,10));}assert.equal(waited,true);await new Promise(r=>setTimeout(r,Math.max(0,deadline-Date.now()+25)));}finally{release();await blocker;}
      assert.equal((await pending).status,403);assert.equal(await db.lessonSession.count({where:{userId:actor.user.id}}),0);assert.equal(await db.progress.count({where:{userId:actor.user.id}}),0);
      console.log(JSON.stringify({revokedPlacement:true,realCourseWait:true,expiredCheckpointRollback:true}));
    }finally{await db.$disconnect();await infra.close();}
  `,
    ),
  );
  assert.deepEqual(proof, {
    revokedPlacement: true,
    realCourseWait: true,
    expiredCheckpointRollback: true,
  });
  s.checks.push(
    "Compiled learning rejects revoked placement sessions and rolls back expired checkpoint/progress writes after actual course-lock waits",
  );
}
async function checkTutorAuthority(s: Stack) {
  const proof = JSON.parse(
    await inside(
      s,
      `
    require('reflect-metadata');
    const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
    const {PrismaClient}=require('@prisma/client'),{Infrastructure}=require('./apps/api/dist/services');
    const {readConfig}=require('./apps/api/dist/config'),{accountPolicy}=require('./apps/api/dist/security');
    const {LearningController}=require('./apps/api/dist/learning.controller'),{AiTutor}=require('./apps/api/dist/ai');
    const db=new PrismaClient(),infra=new Infrastructure(readConfig()),original=AiTutor.prototype.explain;
    async function person(birthDate='1985-01-01'){
      const user=await db.user.create({data:{email:randomUUID()+'@cubers.invalid',displayName:'Synthetic lesson authority',passwordHash:'unused',birthDate,region:process.env.REGION,emailVerified:true,adultVerified:true}});
      const session=await db.session.create({data:{userId:user.id,tokenHash:randomUUID(),expiresAt:new Date(Date.now()+60000)}});
      return {user,sessionId:session.id,policy:await accountPolicy(db,user)};
    }
    try{
      assert.equal(infra.config.AI_MODE,'disabled');
      // The seed-preservation check deliberately withdraws 3-notation. Use an
      // untouched published case instead of overriding that editorial decision.
      const lessonId=require('@cubers/core').lessons.find(l=>l.alternatives?.length).id;
      const service=new LearningController(db,infra),course=await db.course.findUniqueOrThrow({where:{id:lessonId}}),request={lessonId:course.id,courseVersion:course.version,locale:'en',moves:[],question:'why'};
      const stale=await person();await db.user.update({where:{id:stale.user.id},data:{adultVerified:false}});
      AiTutor.prototype.explain=async function(...args){assert.equal(args[2],false);return original.apply(this,args);};
      assert.equal((await service.tutor(stale,request)).source,'authored');
      const revoked=await person();await db.session.delete({where:{id:revoked.sessionId}});
      AiTutor.prototype.explain=async()=>{throw Error('Revoked admission reached provider');};
      await assert.rejects(service.tutor(revoked,request),e=>e.getStatus?.()===403);
      for(const change of ['adult','guardian']){
        const actor=await person(change==='guardian'?'2018-01-01':'1985-01-01'),guardian=change==='guardian'?await person():null;
        if(guardian){await db.consent.create({data:{childId:actor.user.id,guardianId:guardian.user.id,documentId:randomUUID(),status:'APPROVED'}});actor.policy=await accountPolicy(db,actor.user);}
        AiTutor.prototype.explain=async function(...args){const reply=await original.apply(this,args);await db.user.update({where:{id:guardian?guardian.user.id:actor.user.id},data:{adultVerified:false}});return reply;};
        await assert.rejects(service.tutor(actor,request),e=>e.getStatus?.()===403);
      }
      console.log(JSON.stringify({currentAdmission:true,revokedSession:true,currentDelivery:true,noProvider:true}));
    }finally{AiTutor.prototype.explain=original;await db.$disconnect();await infra.close();}
  `,
    ),
  );
  assert.deepEqual(proof, {
    currentAdmission: true,
    revokedSession: true,
    currentDelivery: true,
    noProvider: true,
  });
  s.checks.push(
    "Compiled tutoring rechecks adult, session and guardian authority before generation and delivery; no external AI",
  );
}
async function checkWcaProgram(s: Stack) {
  const proof = JSON.parse(
    await inside(
      s,
      `
    const assert=require('node:assert/strict'),{WcaScrambles,WCA_PROGRAM,WCA_EVENTS}=require('./apps/api/dist/wca-scrambles'),{readConfig}=require('./apps/api/dist/config'),{practiceApply,practiceSolved,solvedPuzzle,inverse}=require('@cubers/core');
    const client=new WcaScrambles(readConfig());try{const events=[];for(const puzzle of Object.keys(WCA_EVENTS)){
      const set=await client.generate(puzzle,2);assert.deepEqual(set.source,{...WCA_PROGRAM,event:WCA_EVENTS[puzzle]});
      for(const moves of set.scrambles){const state=practiceApply(solvedPuzzle(puzzle),moves);assert.equal(practiceSolved(state),false);assert.equal(practiceSolved(practiceApply(state,inverse(moves))),true);}
      events.push(WCA_EVENTS[puzzle]);
    }console.log(JSON.stringify({events,program:WCA_PROGRAM.program,approval:process.env.CN_GAMES_APPROVED}));}finally{await client.close();}
  `,
    ),
  );
  assert.deepEqual(proof.events, ["222", "333", "444", "pyram"]);
  assert.equal(proof.program, "cubing.js");
  assert.equal(proof.approval, "false");
  s.checks.push(
    "Pinned cubing.js regional in-process workers, distance filtering and actual four-event engine-checked output; game approvals remain off",
  );
}
async function checkLessonAlternatives(s: Stack) {
  for (const family of ["OLL", "PLL", "CLL"]) {
    const lesson = lessons.find(
      (row) => row.caseFamily === family && row.alternatives?.length,
    )!;
    const fetched = await api(s, `courses/${lesson.id}`, undefined, s.token);
    assert.equal(fetched.status, 200);
    const option = fetched.body.content.alternatives[0],
      moves = option.algorithm.split(" ");
    assert.equal(option.algorithm, lesson.alternatives![0].algorithm);
    const made = await api(
      s,
      `progress/${lesson.id}`,
      { courseVersion: fetched.body.version, alternativeId: option.id, moves },
      s.token,
    );
    assert.equal(made.status, 201);
    const sessions = await api(s, "lesson-sessions", undefined, s.token),
      saved = sessions.body.find(
        (row: any) => row.lessonId === lesson.id && row.guideId === option.id,
      );
    assert.ok(saved);
    assert.equal(saved.algorithm, lesson.algorithm);
    assert.equal(saved.guideAlgorithm, option.algorithm);
    assert.deepEqual(saved.moves, moves);
    const downloaded = await api(
      s,
      `courses/${lesson.id}/download`,
      { includeAlternatives: true },
      s.token,
    );
    assert.equal(downloaded.status, 201);
    assert.equal(
      DownloadedLesson.parse(downloaded.body).lesson.alternatives![0].algorithm,
      option.algorithm,
    );
    const legacy = await api(s, `courses/${lesson.id}/download`, {}, s.token);
    assert.equal(legacy.status, 201);
    assert.equal(legacy.body.lesson.alternatives, undefined);
    assert.equal(
      (
        await api(
          s,
          `progress/${lesson.id}`,
          {
            courseVersion: fetched.body.version,
            alternativeId: "invented",
            moves,
          },
          s.token,
        )
      ).status,
      400,
    );
  }
  s.checks.push(
    "Published shorter OLL/PLL/CLL guides preserve original setups, save selected guides separately from actual moves, download safely and reject invented identities",
  );
}
async function checkHttp2(s: Stack) {
  assert.ok(s.ca);
  const client = connectHttp2(`https://localhost:${s.port}`, { ca: s.ca });
  client.on("error", () => {});
  client.setTimeout(10000, () =>
    client.destroy(Error("HTTP/2 check timed out")),
  );
  try {
    await once(client, "connect");
    assert.equal(client.alpnProtocol, "h2");
    const responses = await Promise.all(
      ["health", "legal/privacy", "me"].map(
        (path) =>
          new Promise<{ status: number; body: any }>((resolve, reject) => {
            const stream = client.request({
              ":method": "GET",
              ":path": `/v1/${path}`,
            });
            let raw = "",
              status = 0,
              ended = false;
            stream.setEncoding("utf8");
            stream.once("response", (headers) => {
              status = Number(headers[":status"]);
            });
            stream.on("data", (chunk) => {
              raw += chunk;
              if (raw.length > 1024 * 1024)
                stream.destroy(Error("HTTP/2 response bound exceeded"));
            });
            stream.once("error", reject);
            stream.once("end", () => {
              ended = true;
              try {
                resolve({ status, body: JSON.parse(raw) });
              } catch (error) {
                reject(error);
              }
            });
            stream.once("close", () => {
              if (!ended) reject(Error("HTTP/2 stream interrupted"));
            });
            stream.end();
          }),
      ),
    );
    assert.equal(responses[0].status, 200);
    assert.equal(responses[0].body.region, s.region);
    assert.equal(responses[1].status, 200);
    const document = responses[1].body;
    assert.equal(document.operator.region, s.region);
    assert.equal(
      document.operator.website,
      s.region === "CN" ? "https://juyuanqin.com" : "https://exabyte.org.cn",
    );
    assert.ok(document.body.zh.includes("北京聚缘琴科技有限公司"));
    assert.ok(
      document.body.zh.includes("北京市海淀区上地十街1号院5号楼17层1704室"),
    );
    assert.ok(document.body.en.includes("support@exabyte.org.cn"));
    assert.equal(responses[2].status, 401);
    s.checks.push(
      "Verified HTTP/2 TLS multiplexing, public regional operator contacts and unauthenticated account refusal",
    );
  } finally {
    client.destroy();
  }
}
// JSON transport only: no browser, HTML, DOM or UI inspection.
async function checkPublicCompanion(s: Stack) {
  const call = (path: string, method = "GET", body?: unknown, token?: string) =>
    new Promise<{ status: number; body: any; headers: any }>(
      (resolve, reject) => {
        const data = body === undefined ? undefined : JSON.stringify(body);
        const req = request(
          {
            hostname: "127.0.0.1",
            port: s.port,
            servername: "app.localhost",
            path,
            method,
            ca: s.ca,
            rejectUnauthorized: true,
            headers: {
              Host: `app.localhost:${s.port}`,
              Origin: `https://app.localhost:${s.port}`,
              "Content-Type": "application/json",
              ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          },
          (res) => {
            if (
              !(res.headers["content-type"] || "").includes("application/json")
            ) {
              const result = {
                status: res.statusCode!,
                body: null,
                headers: res.headers,
              };
              res.destroy();
              resolve(result);
              return;
            }
            void limitedJsonResponse(res, 512 * 1024).then(
              (body) =>
                resolve({
                  status: res.statusCode!,
                  body,
                  headers: res.headers,
                }),
              reject,
            );
          },
        );
        req.on("error", reject);
        req.setTimeout(15000, () =>
          req.destroy(new Error("Public API timeout")),
        );
        req.end(data);
      },
    );
  await waitFor(async () => {
    try {
      return (await call("/v1/legal/support")).status === 200;
    } catch {
      return false;
    }
  });
  const health = await call("/healthz");
  assert.equal(health.status, 204);
  assert.equal(health.headers["x-cubers-surface"], "web");
  assert.match(
    health.headers["content-security-policy"],
    /frame-ancestors 'none'/,
  );
  assert.match(health.headers["cache-control"], /no-store/);
  for (const slug of [
    "support",
    "privacy",
    "terms",
    "children",
    "community",
    "deletion",
  ]) {
    const result = await call(`/v1/legal/${slug}`);
    assert.equal(result.status, 200);
    const document = PublicLegalDocument.parse(result.body);
    assert.equal(document.operator.region, s.region);
    assert.equal(document.operator.name.zh, "北京聚缘琴科技有限公司");
    if (s.region === "CN")
      assert.equal(document.operator.name.en, "北京聚缘琴科技有限公司");
    if (slug === "deletion")
      assert.equal(
        new URL(document.actionUrl!).origin,
        `https://app.localhost:${s.port}`,
      );
  }
  assert.equal((await call("/v1/courses")).status, 401);
  const email = `public-${runId}@cubers.test`,
    password = randomBytes(24).toString("hex");
  const userId = JSON.parse(
    await inside(
      s,
      `
    const {PrismaClient}=require('@prisma/client'),{passwordHash}=require('./apps/api/dist/crypto.js');const db=new PrismaClient();
    try{const u=await db.user.create({data:{email:${JSON.stringify(email)},displayName:'Synthetic public erasure',passwordHash:await passwordHash(${JSON.stringify(password)}),birthDate:'1990-01-01',region:${JSON.stringify(s.region)},emailVerified:true}});console.log(JSON.stringify(u.id));}finally{await db.$disconnect();}
  `,
    ),
  );
  let login = await call("/v1/auth/deletion-login", "POST", {
    email,
    password,
  });
  assert.equal(login.status, 201);
  assert.equal(login.body.region, s.region);
  let token = login.body.token;
  assert.equal((await call("/v1/me", "GET", undefined, token)).status, 403);
  assert.equal((await call("/v1/auth/logout", "POST", {}, token)).status, 201);
  assert.equal((await call("/v1/me", "GET", undefined, token)).status, 401);
  login = await call("/v1/auth/deletion-login", "POST", { email, password });
  assert.equal(login.status, 201);
  token = login.body.token;
  assert.equal(
    (await call("/v1/me", "DELETE", { confirmation: "delete" }, token)).status,
    400,
  );
  assert.equal(
    (await call("/v1/me", "DELETE", { confirmation: "DELETE" }, token)).status,
    200,
  );
  assert.equal((await call("/v1/me", "GET", undefined, token)).status, 401);
  const disabled = JSON.parse(
    await inside(
      s,
      `const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();try{const u=await db.user.findUnique({where:{id:${JSON.stringify(userId)}}});console.log(JSON.stringify(!u||!!u.deletedAt));}finally{await db.$disconnect();}`,
    ),
  );
  assert.equal(disabled, true);
  s.checks.push(
    "Public app-host TLS routing, web health/security headers, six regional documents and restricted account erasure",
  );
}
async function check(s: Stack) {
  const health = await api(s, "health");
  assert.equal(health.status, 200);
  assert.equal(health.body.region, s.region);
  assert.equal(health.body.aiMode, "disabled");
  s.checks.push("TLS certificate verified; API, PostgreSQL and Redis healthy");
  await checkHttp2(s);
  await checkWcaProgram(s);
  const community = await api(s, "community-region");
  assert.equal(community.status, 200);
  assert.equal(community.body.region, s.region);
  assert.equal(community.body.serverRegion, s.region);
  assert.equal(community.body.source, "development");
  assert.match(community.headers["cache-control"], /no-store/);
  assert.equal(community.body.attribution.url, "https://freeipapi.com");
  const spoofed = await api(
    s,
    "community-region",
    undefined,
    undefined,
    undefined,
    undefined,
    {
      "X-Forwarded-For": s.region === "CN" ? "8.8.8.8" : "114.114.114.114",
      "CF-IPCountry": s.region === "CN" ? "US" : "CN",
      "X-Country": s.region === "CN" ? "US" : "CN",
    },
  );
  assert.equal(spoofed.status, 200);
  assert.equal(spoofed.body.region, s.region);
  assert.equal(spoofed.body.source, "development");
  assert.equal(
    await inside(
      s,
      `const {CommunityRegion}=require('./apps/api/dist/community-region');const {readConfig}=require('./apps/api/dist/config');const region=new CommunityRegion({...readConfig(),NODE_ENV:'production'},{country:async ip=>ip==='114.114.114.114'?'CN':'US'});Promise.all([region.detect('114.114.114.114'),region.detect('8.8.8.8')]).then(values=>console.log(values.map(v=>v.region).join(',')))`,
    ),
    "CN,INTL",
  );
  s.checks.push(
    "Server-authoritative country routing with synthetic vendor responses, both communities and uncached anonymous discovery",
  );
  assert.equal((await api(s, "me")).status, 401);
  assert.equal(
    (
      await api(
        s,
        "health",
        undefined,
        undefined,
        undefined,
        "https://attacker.invalid",
      )
    ).status,
    403,
  );
  const constraints = JSON.parse(
    (
      await command([
        "inspect",
        (await compose(s, ["ps", "-q", "api"])).stdout.trim(),
        "--format",
        "{{json .HostConfig}}",
      ])
    ).stdout,
  );
  assert.equal(constraints.ReadonlyRootfs, true);
  assert.ok(constraints.CapDrop.includes("ALL"));
  assert.ok(constraints.Memory > 0 && constraints.PidsLimit > 0);
  assert.notEqual(await inside(s, "console.log(process.getuid())"), "0");
  assert.equal(
    await inside(
      s,
      "const fs=require('node:fs');try{fs.writeFileSync('/app/forbidden','x');throw new Error()}catch(e){if(e.code!=='EROFS'&&e.code!=='EACCES')throw e;console.log('read-only')}",
    ),
    "read-only",
  );
  s.checks.push(
    "Non-root API, read-only filesystem, dropped capabilities and resource limits",
  );
  let releaseRefused = false;
  try {
    await compose(s, [
      "run",
      "--rm",
      "--no-deps",
      "-e",
      "NODE_ENV=production",
      "-e",
      "PUBLIC_RELEASE_APPROVED=false",
      "api",
    ]);
  } catch (error) {
    releaseRefused = String((error as any).stderr).includes(
      "Production release review is not approved",
    );
  }
  assert.equal(releaseRefused, true);
  s.checks.push(
    "Production API refuses startup while release review is unapproved",
  );
  const counts = JSON.parse(
    await inside(
      s,
      "const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();console.log(JSON.stringify({users:await db.user.count(),courses:await db.course.count(),migrations:await db.$queryRaw`SELECT COUNT(*)::int AS count FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL`}));await db.$disconnect()",
    ),
  );
  assert.equal(counts.users, 0);
  assert.equal(counts.courses, lessons.length);
  const migrationCount = (
    await readdir("apps/api/prisma/migrations", { withFileTypes: true })
  ).filter((entry) => entry.isDirectory()).length;
  assert.equal(counts.migrations[0].count, migrationCount);
  s.checks.push(
    migrationCount +
      " migrations and authored-only initialization; no seeded users",
  );
  const schemaDiff = await compose(s, [
    "run",
    "--rm",
    "--no-deps",
    "--entrypoint",
    "node",
    "migrate",
    "node_modules/prisma/build/index.js",
    "migrate",
    "diff",
    "--from-schema-datasource",
    "apps/api/prisma/schema.prisma",
    "--to-schema-datamodel",
    "apps/api/prisma/schema.prisma",
    "--script",
    "--exit-code",
  ]);
  await writeFile(
    join(root, `${s.region}-schema-diff.log`),
    schemaDiff.stdout + schemaDiff.stderr,
    { mode: 0o600 },
  );
  s.checks.push(
    "Migrated PostgreSQL schema exactly matches the packaged Prisma model",
  );
  const course = lessons[0].id;
  await inside(
    s,
    `const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();await db.course.update({where:{id:${JSON.stringify(course)}},data:{published:false,version:2}});await db.$disconnect()`,
  );
  await compose(s, ["run", "--rm", "--no-deps", "seed"]);
  assert.equal(
    await inside(
      s,
      `const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();const c=await db.course.findUniqueOrThrow({where:{id:${JSON.stringify(course)}}});if(c.published||c.version!==2)throw new Error();console.log('preserved');await db.$disconnect()`,
    ),
    "preserved",
  );
  s.checks.push(
    "Repeated course initialization preserves existing publication and version",
  );
  const registered = await api(s, "auth/register", {
    email: s.email,
    password: s.password,
    displayName: "Synthetic Docker tester",
    birthDate: "1990-01-01",
    region: s.region,
    terms: true,
    privacy: true,
  });
  assert.equal(registered.status, 201);
  assert.equal(
    (await api(s, "auth/login", { email: s.email, password: s.password }))
      .status,
    403,
  );
  let verification = "";
  await waitFor(async () => {
    const result = await inside(
      s,
      `const list=await (await fetch('http://mail:8025/api/v1/messages')).json();for(const m of list.messages||[]){const full=await(await fetch('http://mail:8025/api/v1/message/'+m.ID)).json();const match=(full.Text||'').match(/\\/verify\\?token=([A-Za-z0-9_-]+)/);if(match){console.log(match[1]);break}}`,
    );
    verification = result;
    return !!verification;
  });
  assert.equal(
    (await api(s, "auth/verify", { token: verification })).status,
    201,
  );
  assert.equal(
    (await api(s, "auth/verify", { token: verification })).status,
    400,
  );
  const login = await api(s, "auth/login", {
    email: s.email,
    password: s.password,
  });
  assert.equal(login.status, 201);
  s.token = login.body.token;
  const deletion = await api(s, "auth/deletion-login", {
    email: s.email,
    password: s.password,
  });
  assert.equal(deletion.status, 201);
  assert.equal(deletion.body.region, s.region);
  for (const path of [
    "me",
    "me/export",
    "me/profile",
    "admin/overview",
    "admin/operations",
    "learning-plan?puzzle=3x3",
  ])
    assert.equal(
      (await api(s, path, undefined, deletion.body.token)).status,
      403,
    );
  assert.equal(
    (await api(s, "auth/logout", {}, deletion.body.token)).status,
    201,
  );
  assert.equal(
    (await api(s, "me", undefined, deletion.body.token)).status,
    401,
  );
  s.checks.push(
    "Deletion-only ten-minute authentication rejects account, export, profile and staff access",
  );
  assert.equal(
    (await api(s, "admin/overview", undefined, s.token)).status,
    403,
  );
  s.checks.push(
    "Captured SMTP verification, one-use email token, password login and admin denial",
  );
  assert.equal((await api(s, "discovery")).status, 401);
  const discovery = await api(s, "discovery", undefined, s.token);
  assert.equal(discovery.status, 200);
  assert.match(discovery.headers["cache-control"], /no-store/);
  const stories = DiscoveryResponse.parse(discovery.body).items;
  assert.equal(stories.length, 4);
  assert.ok(
    stories.every(
      (story) => !story.actions.some((action) => action.courseId === course),
    ),
  );
  assert.equal(
    (await api(s, "discovery/more-than-one-color", undefined, s.token)).status,
    200,
  );
  assert.equal(
    (await api(s, "discovery/missing-story", undefined, s.token)).status,
    404,
  );
  assert.equal(
    await inside(
      s,
      "const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();console.log(await db.progress.count());await db.$disconnect()",
    ),
    "0",
  );
  s.checks.push(
    "Original bilingual four-puzzle discovery, current regional publication, no reading credit and authenticated access even while mainland social/game services stay gated",
  );
  const provisionedStaff = await bootstrapStaffCli(s);
  const profile = await api(s, "me/profile", undefined, s.token);
  assert.equal(profile.status, 200);
  assert.match(profile.headers["cache-control"], /no-store/);
  assert.ok(
    Object.values(profile.body.settings.visibility).every(
      (value) => value === "PRIVATE",
    ),
  );
  const privateSettings = {
    ...profile.body.settings,
    avatar: { shape: "pyramid", color: "indigo" },
    favorites: ["3x3"],
  };
  const profileSave = await api(
    s,
    "me/profile",
    {
      displayName: profile.body.displayName,
      bio: "",
      privateProfile: true,
      revision: profile.body.review.revision,
      settings: privateSettings,
    },
    s.token,
  );
  assert.equal(profileSave.status, 201);
  assert.deepEqual(
    (await api(s, "me/profile", undefined, s.token)).body.settings.avatar,
    privateSettings.avatar,
  );
  const invalidSharing = await api(
    s,
    "me/profile",
    {
      displayName: profile.body.displayName,
      bio: "",
      privateProfile: false,
      revision: profileSave.body.revision,
      settings: {
        ...privateSettings,
        visibility: { ...privateSettings.visibility, about: "PUBLIC" },
      },
      sharingConfirmed: true,
    },
    s.token,
  );
  assert.equal(invalidSharing.status, 403);
  s.checks.push(
    "Persistent private profile customization, private/no-store responses and unverified sharing denial",
  );
  const beforeProgress = (await api(s, "progress", undefined, s.token)).body
    .length;
  const catalogue = await api(s, "devices", undefined, s.token);
  assert.equal(catalogue.status, 200);
  assert.equal(catalogue.body.devices.length, 3);
  assert.ok(
    catalogue.body.devices.every(
      (d: any) => d.enabled === false && d.physicallyTested === false,
    ),
  );
  s.checks.push(
    "Three protocol adapters advertised with physical activation disabled",
  );
  const download = await api(s, "courses/2-first-solve/download", {}, s.token);
  assert.equal(download.status, 201);
  assert.equal(download.body.region, s.region);
  assert.equal(download.body.lesson.id, "2-first-solve");
  assert.ok(download.body.courseVersion >= 1);
  assert.ok(download.body.expiresAt > download.body.downloadedAt);
  assert.ok(
    download.body.expiresAt - download.body.downloadedAt <= 24 * 60 * 60 * 1000,
  );
  assert.equal(
    (await api(s, "progress", undefined, s.token)).body.length,
    beforeProgress,
  );
  s.checks.push(
    "Regional versioned lesson download, bounded offline access and no earned progress",
  );
  for (const family of ["OLL", "PLL", "CLL"] as const) {
    const entry = algorithmCases.find((row) => row.family === family)!;
    const scanned = practiceApply(
      practiceSetup(entry.puzzle, entry.algorithm),
      ["U"],
    );
    assert.ok(!isPyraminx(scanned));
    const guidance = await api(
      s,
      "last-layer/recognize",
      { family, faces: facelets(scanned) },
      s.token,
    );
    assert.equal(guidance.status, 201);
    assert.equal(guidance.body.kind, "case");
    assert.equal(guidance.body.source, "validated");
    assert.ok(guidance.body.before.length > 0);
    assert.deepEqual(
      guidance.body.observations.current,
      observeLastLayer(scanned, family),
    );
    const prepared = practiceApply(scanned, guidance.body.before);
    assert.ok(!isPyraminx(prepared));
    assert.deepEqual(
      guidance.body.observations.prepared,
      observeLastLayer(prepared, family),
    );
    const result = practiceApply(prepared, [
      ...guidance.body.algorithm,
      ...guidance.body.after,
    ]);
    assert.ok(!isPyraminx(result));
    if (family === "OLL")
      assert.ok(facelets(result).U.every((color) => color === "U"));
    else assert.ok(practiceSolved(result));
  }
  assert.equal(
    (await api(s, "progress", undefined, s.token)).body.length,
    beforeProgress,
  );
  s.checks.push(
    "OLL/PLL/CLL scan coaching, actual sticker destinations, distinct upper-face setup views and no recognition credit",
  );
  const notificationSettings = await api(
    s,
    "me/notification-settings",
    undefined,
    s.token,
  );
  assert.equal(notificationSettings.status, 200);
  assert.deepEqual(notificationSettings.body.required, ["SYSTEM", "REVIEW"]);
  assert.equal(
    notificationSettings.body.communityUpdatesAvailable,
    s.region !== "CN",
  );
  await inside(
    s,
    `const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();try {const user=await db.user.findUniqueOrThrow({where:{email:${JSON.stringify(s.email)}}});await db.notification.createMany({data:[{userId:user.id,category:'SYSTEM',title:'Synthetic account status',body:'Synthetic required status'},{userId:user.id,category:'CONNECTION',title:'Synthetic connection status',body:'Synthetic optional status'}]});}finally{await db.$disconnect();}`,
  );
  const defaultInbox = await api(s, "me/notifications", undefined, s.token);
  assert.equal(defaultInbox.status, 200);
  assert.ok(defaultInbox.body.items.some((n: any) => n.category === "SYSTEM"));
  assert.equal(
    defaultInbox.body.items.some((n: any) => n.category === "CONNECTION"),
    s.region !== "CN",
  );
  const savedNotifications = await api(
    s,
    "me/notification-settings",
    {
      revision: notificationSettings.body.revision,
      settings: { connections: false, clubs: false },
    },
    s.token,
    "PUT",
  );
  assert.equal(savedNotifications.status, 200);
  assert.equal(
    (
      await api(
        s,
        "me/notification-settings",
        {
          revision: notificationSettings.body.revision,
          settings: { connections: true, clubs: true },
        },
        s.token,
        "PUT",
      )
    ).status,
    409,
  );
  const inbox = await api(s, "me/notifications", undefined, s.token);
  assert.equal(inbox.status, 200);
  assert.ok(Array.isArray(inbox.body.items));
  assert.ok(inbox.body.items.some((n: any) => n.category === "SYSTEM"));
  assert.ok(inbox.body.items.every((n: any) => n.category !== "CONNECTION"));
  s.checks.push(
    "Account notification preferences, required status notices, regional social gate, optimistic revision and private inbox",
  );
  // Seed-preservation intentionally withdrew 3-notation. Keep that editorial
  // decision intact and exercise placement on another published path.
  assert.equal(
    (await api(s, "assessments", { puzzle: "3x3" }, s.token)).status,
    409,
  );
  let placement = await api(s, "assessments", { puzzle: "2x2" }, s.token);
  assert.equal(placement.status, 201);
  const placementId = placement.body.id;
  assert.equal("correctOptionId" in placement.body.current, false);
  placement = await api(
    s,
    `assessments/${placementId}/answers`,
    {
      kind: "submit",
      version: 0,
      optionId: "a",
      moves: inverse(placement.body.current.setup),
    },
    s.token,
  );
  assert.equal(placement.status, 201);
  assert.equal(placement.body.feedback[0].puzzle, true);
  for (let version = 1; version <= 2; version++) {
    placement = await api(
      s,
      `assessments/${placementId}/answers`,
      { kind: "skip", version },
      s.token,
    );
    assert.equal(placement.status, 201);
  }
  assert.equal(placement.body.status, "COMPLETED");
  const learningPlan = await api(
    s,
    "learning-plan?puzzle=2x2",
    undefined,
    s.token,
  );
  assert.equal(learningPlan.status, 200);
  assert.equal(learningPlan.body.assessment.id, placementId);
  assert.ok(learningPlan.body.queue.length > 0);
  assert.equal(
    (await api(s, "progress", undefined, s.token)).body.length,
    beforeProgress,
  );
  s.checks.push(
    "Publication-aware private placement, actual virtual move grading and adaptive practice without unearned progress",
  );
  assert.equal(
    (await api(s, "progress/3-first-solve", { moves: [] }, s.token)).status,
    400,
  );
  let guidedFour = await api(
    s,
    "first-solves",
    { input: "virtual", puzzle: "4x4" },
    s.token,
  );
  assert.equal(
    guidedFour.status,
    201,
    [
      "Guidance is busy; try again shortly",
      "Could not validate guidance for this state",
      "Guidance interrupted; retry",
      "Guidance timed out; retry",
      "Guidance is shutting down",
    ].includes(guidedFour.body?.message)
      ? guidedFour.body.message
      : "4×4 guided lesson creation failed",
  );
  const guidedFourId = guidedFour.body.id;
  assert.equal(guidedFour.body.total, 32);
  assert.equal(guidedFour.body.currentFaces.U.length, 16);
  let guidedPyra = await api(
    s,
    "first-solves",
    { input: "virtual", puzzle: "pyraminx" },
    s.token,
  );
  assert.equal(guidedPyra.status, 201);
  const guidedPyraId = guidedPyra.body.id;
  assert.equal(guidedPyra.body.total, 12);
  assert.deepEqual(Object.keys(guidedPyra.body.currentFaces).sort(), [
    "D",
    "F",
    "L",
    "R",
  ]);
  let guidedTwo = await api(
    s,
    "first-solves",
    { input: "virtual", puzzle: "2x2" },
    s.token,
  );
  assert.equal(guidedTwo.status, 201);
  const guidedTwoId = guidedTwo.body.id;
  assert.equal(guidedTwo.body.puzzle, "2x2");
  let guided = await api(s, "first-solves", { input: "virtual" }, s.token);
  assert.equal(guided.status, 201);
  const guidedId = guided.body.id;
  const beforeOfflineProgress = (await api(s, "progress", undefined, s.token))
    .body;
  for (const source of [guided, guidedTwo, guidedFour, guidedPyra]) {
    const downloaded = await api(
      s,
      `first-solves/${source.body.id}/download`,
      { version: source.body.version },
      s.token,
    );
    assert.equal(downloaded.status, 201);
    const packet = DownloadedLesson.parse(downloaded.body);
    assert.equal(packet.region, s.region);
    assert.equal(packet.guidedPractice!.sourceVersion, source.body.version);
    const local = await openOfflineGuidance(packet);
    for (const step of packet.guidedPractice!.steps) {
      for (const move of step.moves) local.turn(move);
      local.checkpoint();
    }
    assert.equal(local.view().completed, true);
    const unchanged = await api(
      s,
      `first-solves/${source.body.id}`,
      undefined,
      s.token,
    );
    assert.equal(unchanged.body.status, "ACTIVE");
    assert.equal(unchanged.body.version, source.body.version);
    assert.equal(unchanged.body.stage, source.body.stage);
    assert.deepEqual(unchanged.body.currentFaces, source.body.currentFaces);
  }
  assert.deepEqual(
    (await api(s, "progress", undefined, s.token)).body,
    beforeOfflineProgress,
  );
  const offlinePrivacy = (await api(s, "legal/privacy")).body;
  assert.ok(
    offlinePrivacy.body.en.includes("download remaining first-solve guidance"),
  );
  assert.ok(offlinePrivacy.body.zh.includes("下载剩余首次还原指导"));
  s.checks.push(
    "Four-puzzle frozen guidance downloads, local reconstructed completion, unchanged online sessions/no credit and bilingual privacy disclosure",
  );
  for (let stage = 0; stage < 13; stage++) {
    const moves = guided.body.step.moves;
    for (let at = 0; at < moves.length; at += 100) {
      guided = await api(
        s,
        `first-solves/${guidedId}/moves`,
        { version: guided.body.version, moves: moves.slice(at, at + 100) },
        s.token,
      );
      assert.equal(guided.status, 201);
    }
    guided = await api(
      s,
      `first-solves/${guidedId}/checkpoint`,
      { version: guided.body.version },
      s.token,
    );
    assert.equal(guided.status, 201);
  }
  assert.equal(guided.body.status, "COMPLETED");
  assert.equal(
    (await api(s, "progress", undefined, s.token)).body.find(
      (row: any) => row.lessonId === "3-first-solve",
    ).repetitions,
    1,
  );
  s.checks.push(
    "Complete thirteen-stage virtual 3×3 guidance in a bounded worker, with verified progress and legacy-bypass rejection",
  );
  assert.equal(
    (await api(s, "progress/2-first-solve", { moves: [] }, s.token)).status,
    400,
  );
  for (let stage = 0; stage < 6; stage++) {
    const moves = guidedTwo.body.step.moves;
    for (let at = 0; at < moves.length; at += 100) {
      guidedTwo = await api(
        s,
        `first-solves/${guidedTwoId}/moves`,
        { version: guidedTwo.body.version, moves: moves.slice(at, at + 100) },
        s.token,
      );
      assert.equal(guidedTwo.status, 201);
    }
    guidedTwo = await api(
      s,
      `first-solves/${guidedTwoId}/checkpoint`,
      { version: guidedTwo.body.version },
      s.token,
    );
    assert.equal(guidedTwo.status, 201);
  }
  assert.equal(guidedTwo.body.status, "COMPLETED");
  assert.equal(
    (await api(s, "progress", undefined, s.token)).body.find(
      (row: any) => row.lessonId === "2-first-solve",
    ).repetitions,
    1,
  );
  const twoHistory = await api(
    s,
    "first-solves?puzzle=2x2",
    undefined,
    s.token,
  );
  assert.equal(twoHistory.status, 200);
  assert.ok(JSON.stringify(twoHistory.body).includes(guidedTwoId));
  assert.ok(!JSON.stringify(twoHistory.body).includes(guidedId));
  s.checks.push(
    "Complete six-stage virtual 2×2 guidance with independent active sessions, private history and course credit",
  );
  assert.equal(
    (await api(s, "progress/pyra-first-solve", { moves: [] }, s.token)).status,
    400,
  );
  assert.equal(
    (
      await api(
        s,
        `first-solves/${guidedPyraId}/moves`,
        { version: guidedPyra.body.version, moves: ["F"] },
        s.token,
      )
    ).status,
    400,
  );
  for (let stage = 0; stage < 12; stage++) {
    const moves = guidedPyra.body.step.moves;
    if (moves.length) {
      guidedPyra = await api(
        s,
        `first-solves/${guidedPyraId}/moves`,
        { version: guidedPyra.body.version, moves },
        s.token,
      );
      assert.equal(guidedPyra.status, 201);
    }
    guidedPyra = await api(
      s,
      `first-solves/${guidedPyraId}/checkpoint`,
      { version: guidedPyra.body.version },
      s.token,
    );
    assert.equal(guidedPyra.status, 201);
  }
  assert.equal(guidedPyra.body.status, "COMPLETED");
  assert.equal(
    (await api(s, "progress", undefined, s.token)).body.find(
      (row: any) => row.lessonId === "pyra-first-solve",
    ).repetitions,
    1,
  );
  const pyraHistory = (
    await api(s, "first-solves?puzzle=pyraminx", undefined, s.token)
  ).body;
  assert.ok(JSON.stringify(pyraHistory).includes(guidedPyraId));
  assert.ok(!JSON.stringify(pyraHistory).includes(guidedId));
  assert.ok(!JSON.stringify(pyraHistory).includes(guidedTwoId));
  s.checks.push(
    "Complete twelve-stage Pyraminx guidance, puzzle-specific turns, independent history and validated course credit",
  );
  assert.equal(
    (await api(s, "progress/4-first-solve", { moves: [] }, s.token)).status,
    400,
  );
  for (let stage = 0; stage < 32; stage++) {
    const moves = guidedFour.body.step.moves;
    for (let at = 0; at < moves.length; at += 100) {
      guidedFour = await api(
        s,
        `first-solves/${guidedFourId}/moves`,
        { version: guidedFour.body.version, moves: moves.slice(at, at + 100) },
        s.token,
      );
      assert.equal(guidedFour.status, 201);
    }
    guidedFour = await api(
      s,
      `first-solves/${guidedFourId}/checkpoint`,
      { version: guidedFour.body.version },
      s.token,
    );
    assert.equal(guidedFour.status, 201);
  }
  assert.equal(guidedFour.body.status, "COMPLETED");
  assert.equal(
    (await api(s, "progress", undefined, s.token)).body.find(
      (row: any) => row.lessonId === "4-first-solve",
    ).repetitions,
    1,
  );
  const fourHistory = (
    await api(s, "first-solves?puzzle=4x4", undefined, s.token)
  ).body;
  assert.ok(JSON.stringify(fourHistory).includes(guidedFourId));
  for (const otherId of [guidedId, guidedTwoId, guidedPyraId])
    assert.ok(!JSON.stringify(fourHistory).includes(otherId));
  s.checks.push(
    "Complete 32-stage 4×4 reduction, wide-turn reconstruction, independent history and validated course credit",
  );
  await checkRelay(s);
  await checkStageLessons({request:(path,body,method)=>api(s,path,body,s.token,method),compiled:code=>inside(s,code)});
  s.checks.push("Stage-specific guidance validates prerequisites, preserves colors, completes only the selected target on four puzzles, admits scoped offline packets and verifies synthetic smart stages under migration47");
  const sourceClaim = {
    Label: "2" as const,
    ContentProducer: "synthetic-source",
    ProduceID: "source-001",
    ReservedCode1: "",
    ContentPropagator: "",
    PropagateID: "",
    ReservedCode2: "",
  };
  const sourceImage = await sharp({
    create: { width: 32, height: 32, channels: 3, background: "#285c47" },
  })
    .withExif({ IFD0: { ImageDescription: "PRIVATE-SYNTHETIC" } })
    .withXmp(imageAiXmp(sourceClaim, "synthetic-source-id"))
    .jpeg()
    .toBuffer();
  assert.equal(
    await inside(
      s,
      `const assert=require('node:assert/strict'),sharp=require('sharp'),{readImageAiMetadata,imageAiXmp}=require('./apps/api/dist/image-ai-metadata');const b=Buffer.from(${JSON.stringify(sourceImage.toString("base64"))},'base64'),claim=readImageAiMetadata(b,'image/jpeg');assert.equal(claim.Label,'2');assert.equal(claim.ContentProducer,'synthetic-source');const out=await sharp(b).png().withXmp(imageAiXmp(claim,'compiled-test')).toBuffer();assert.equal((await sharp(out).metadata()).exif,undefined);assert.equal(readImageAiMetadata(out,'image/png').PropagateID,'compiled-test');console.log('preserved');`,
    ),
    "preserved",
  );
  s.checks.push(
    "Compiled Linux JPEG/PNG AI claim round trip preserves source fields while removing unrelated EXIF, without authenticating origin",
  );
  assert.equal(
    await inside(
      s,
      `const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict'),{readVideoAiMetadata}=require('./apps/api/dist/video-ai-metadata');const p='/tmp/compiled-claim.mp4',claim=${JSON.stringify({ ...{ Label: "3", ContentProducer: "synthetic-source", ProduceID: "source-video-001", ReservedCode1: "", ContentPropagator: "", PropagateID: "", ReservedCode2: "" } })};try{cp.execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=32x32:d=0.5','-c:v','libx264','-metadata','AIGC='+JSON.stringify({AIGC:claim}),'-movflags','use_metadata_tags',p]);const bytes=fs.readFileSync(p);assert.deepEqual(readVideoAiMetadata(bytes),claim);const marker=Buffer.alloc(24);marker.writeUInt32BE(24);marker.write('uuid',4);Buffer.from('d8fec3d61b0e483c92975828877ec481','hex').copy(marker,8);assert.throws(()=>readVideoAiMetadata(Buffer.concat([bytes,marker])),/preservation-capable/);console.log('preserved')}finally{if(fs.existsSync(p))fs.unlinkSync(p)}`,
    ),
    "preserved",
  );
  s.checks.push(
    "Compiled Linux MP4 metadata preserves source claims and rejects C2PA credential UUIDs without stripping them",
  );
  let sourceImageId: string | undefined, sourceVideoId: string | undefined;
  if (s.region === "CN") {
    assert.equal((await api(s, "feed", undefined, s.token)).status, 403);
    assert.equal(
      (await api(s, `posts/${randomUUID()}/comments/page`, undefined, s.token))
        .status,
      403,
    );
    assert.equal(
      (
        await api(
          s,
          "rooms",
          {
            puzzle: "3x3",
            input: "virtual",
            mode: "race",
            ranked: false,
            private: true,
          },
          s.token,
        )
      ).status,
      403,
    );
    s.checks.push("Unapproved mainland social/game services remain disabled");
    // Only private consent-document processing is exercised in this region.
  } else {
    const community = JSON.parse(
      await inside(
        s,
        `
      const {PrismaClient}=require('@prisma/client'),{randomUUID}=require('node:crypto');
      const db=new PrismaClient(),u=await db.user.findUniqueOrThrow({where:{email:${JSON.stringify(s.email)}}});
      const club=await db.club.create({data:{ownerId:u.id,name:'Synthetic Docker club',description:'Disposable paging fixture',private:false,status:'APPROVED'}});
      await db.membership.create({data:{clubId:club.id,userId:u.id,status:'APPROVED'}});
      const posts=Array.from({length:21},()=>randomUUID()),comments=Array.from({length:21},()=>randomUUID());
      await db.post.createMany({data:posts.map((id,i)=>({id,clubId:club.id,authorId:u.id,kind:'ANNOUNCEMENT',body:'Synthetic Docker announcement',tags:[],mediaIds:[],status:'PUBLISHED',moderatorApproved:true,createdAt:new Date(1767225600000+i)}))});
      await db.comment.createMany({data:comments.map((id,i)=>({id,postId:posts[0],authorId:u.id,body:'Synthetic Docker reply',status:'PUBLISHED',parentId:i===20?comments[0]:null,createdAt:new Date(1767225600000+i)}))});
      console.log(JSON.stringify({postId:posts[0],clubId:club.id}));await db.$disconnect();
    `,
      ),
    );
    const replies = await api(
      s,
      `posts/${community.postId}/comments/page`,
      undefined,
      s.token,
    );
    assert.equal(replies.status, 200);
    assert.equal(replies.body.items.length, 20);
    const nextReplies = await api(
      s,
      `posts/${community.postId}/comments/page?cursor=${replies.body.nextCursor}`,
      undefined,
      s.token,
    );
    assert.equal(nextReplies.status, 200);
    assert.equal(nextReplies.body.items.length, 1);
    assert.equal(nextReplies.body.context[0].id, replies.body.items[0].id);
    const announcementPath = `feed?clubId=${community.clubId}&postKind=ANNOUNCEMENT`;
    const announcements = await api(s, announcementPath, undefined, s.token);
    assert.equal(announcements.body.items.length, 20);
    assert.equal(
      (
        await api(
          s,
          `feed?clubId=${community.clubId}&postKind=DISCUSSION&cursor=${announcements.body.nextCursor}`,
          undefined,
          s.token,
        )
      ).status,
      400,
    );
    await inside(
      s,
      `const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();await db.post.delete({where:{id:${JSON.stringify(announcements.body.items[19].id)}}});await db.$disconnect();`,
    );
    const nextAnnouncements = await api(
      s,
      `${announcementPath}&cursor=${announcements.body.nextCursor}`,
      undefined,
      s.token,
    );
    assert.equal(nextAnnouncements.status, 200);
    assert.equal(nextAnnouncements.body.items[0].id, community.postId);
    s.checks.push(
      "Paged replies preserve authorized ancestry; club announcements use scoped cursors that survive boundary deletion",
    );
    const room = (
      await api(
        s,
        "rooms",
        {
          puzzle: "3x3",
          input: "virtual",
          mode: "race",
          ranked: false,
          private: true,
        },
        s.token,
      )
    ).body;
    assert.ok(room.id);
    await api(s, `rooms/${room.id}/start`, {}, s.token);
    const attempt = (await api(s, `rooms/${room.id}/attempts`, {}, s.token))
      .body;
    const socket = io(`https://localhost:${s.port}/play`, {
      transports: ["websocket"],
      auth: { token: s.token },
      ca: s.ca,
      rejectUnauthorized: true,
      reconnection: false,
      extraHeaders: { Origin: `https://localhost:${s.port}` },
      timeout: 15000,
    });
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("connect_error", reject);
      });
      assert.equal(
        (
          await socket
            .timeout(10000)
            .emitWithAck("room.join", { roomId: room.id })
        ).ok,
        true,
      );
      assert.equal(
        (
          await api(
            s,
            `attempts/${attempt.id}/inspect`,
            { nonce: attempt.nonce },
            s.token,
          )
        ).status,
        201,
      );
      assert.equal(
        (
          await api(
            s,
            `attempts/${attempt.id}/start`,
            { nonce: attempt.nonce },
            s.token,
          )
        ).status,
        201,
      );
      await new Promise((r) => setTimeout(r, 400));
      const events = inverse(attempt.scramble).map((move, sequence) => ({
        move,
        sequence,
        elapsedMs: sequence,
      }));
      assert.equal(
        (
          await socket.timeout(10000).emitWithAck("attempt.moves", {
            attemptId: attempt.id,
            nonce: attempt.nonce,
            events,
          })
        ).ok,
        true,
      );
      assert.equal(
        (
          await api(
            s,
            `attempts/${attempt.id}/finish`,
            { nonce: attempt.nonce },
            s.token,
          )
        ).body.status,
        "APPROVED",
      );
      s.checks.push(
        "Authenticated TLS WebSocket room and server-reconstructed virtual finish",
      );
      const replay = await api(
        s,
        `me/replays/${attempt.id}`,
        undefined,
        s.token,
      );
      assert.equal(replay.status, 200);
      assert.deepEqual(
        replay.body.moves,
        events.map((event) => event.move),
      );
      assert.deepEqual(replay.body.scramble, attempt.scramble);
      assert.equal(replay.body.input, "virtual");
      assert.equal("nonce" in replay.body, false);
      assert.match(replay.headers["cache-control"], /private.*no-store/);
    } finally {
      socket.disconnect();
    }
    const image = sourceImage;
    const upload = await api(
      s,
      "media",
      { purpose: "post", type: "image/jpeg", size: image.length },
      s.token,
    );
    assert.equal(upload.status, 201);
    sourceImageId = upload.body.id;
    assert.equal(
      await inside(
        s,
        `const r=await fetch(${JSON.stringify(upload.body.uploadUrl)},{method:'PUT',headers:{'Content-Type':'image/jpeg'},body:Buffer.from(${JSON.stringify(image.toString("base64"))},'base64')});console.log(r.status)`,
      ),
      "200",
    );
    assert.equal(
      (await api(s, `media/${upload.body.id}/complete`, {}, s.token)).status,
      201,
    );
    let processed: any;
    await waitFor(async () => {
      processed = (await api(s, `media/${upload.body.id}`, undefined, s.token))
        .body;
      return processed.status === "READY";
    });
    assert.equal(processed.aiLabel, "2");
    assert.equal(processed.aiMetadata, undefined);
    assert.equal(
      await inside(
        s,
        `const b=Buffer.from(await(await fetch(${JSON.stringify(processed.url)})).arrayBuffer());const metadata=await require('sharp')(b).metadata();if(metadata.exif)throw new Error();const claim=require('./apps/api/dist/image-ai-metadata').readImageAiMetadata(b,'image/jpeg');if(claim.Label!=='2'||claim.PropagateID!==${JSON.stringify(upload.body.id)})throw new Error();console.log('stripped')`,
      ),
      "stripped",
    );
    const object = await inside(
      s,
      `const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();const m=await db.media.findUniqueOrThrow({where:{id:${JSON.stringify(upload.body.id)}}});const r=await fetch(process.env.S3_ENDPOINT+'/'+process.env.S3_BUCKET+'/'+m.key);console.log(r.status);await db.$disconnect()`,
    );
    assert.equal(object, "403");
    s.checks.push(
      "Emulated S3 signed upload, separate Linux worker processing, AI source-claim preservation, unrelated metadata stripping and unsigned-access denial",
    );
    const video = await inside(
      s,
      `const fs=require('node:fs'),p='/tmp/synthetic-video.mp4';require('node:child_process').execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=red:s=32x32:d=1','-f','lavfi','-i','sine=frequency=1000:duration=1','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-metadata','title=PRIVATE-SYNTHETIC','-metadata:s:v:0','handler_name=PRIVATE-DEVICE','-metadata','AIGC='+JSON.stringify({AIGC:${JSON.stringify({ ...sourceClaim, Label: "3", ProduceID: "source-video-001" })}}),'-movflags','+faststart+use_metadata_tags',p]);console.log(fs.readFileSync(p).toString('base64'));fs.unlinkSync(p)`,
    );
    const reservation = await api(
      s,
      "media",
      {
        purpose: "post",
        type: "video/mp4",
        size: Buffer.from(video, "base64").length,
      },
      s.token,
    );
    assert.equal(reservation.status, 201);
    sourceVideoId = reservation.body.id;
    assert.equal(
      await inside(
        s,
        `const r=await fetch(${JSON.stringify(reservation.body.uploadUrl)},{method:'PUT',headers:{'Content-Type':'video/mp4'},body:Buffer.from(${JSON.stringify(video)},'base64')});console.log(r.status)`,
      ),
      "200",
    );
    assert.equal(
      (await api(s, `media/${reservation.body.id}/complete`, {}, s.token))
        .status,
      201,
    );
    let processedVideo: any;
    await waitFor(async () => {
      processedVideo = (
        await api(s, `media/${reservation.body.id}`, undefined, s.token)
      ).body;
      return processedVideo.status === "READY";
    });
    assert.equal(processedVideo.aiLabel, "3");
    assert.equal(
      await inside(
        s,
        `const fs=require('node:fs'),p='/tmp/processed-video.mp4';const bytes=Buffer.from(await(await fetch(${JSON.stringify(processedVideo.url)})).arrayBuffer());fs.writeFileSync(p,bytes);const probe=JSON.parse(require('node:child_process').execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',p],{encoding:'utf8'}));const claim=require('./apps/api/dist/video-ai-metadata').readVideoAiMetadata(bytes);if(probe.streams.length!==1||probe.streams[0].codec_type!=='video'||probe.streams[0].codec_name!=='h264'||JSON.stringify(probe).includes('PRIVATE-')||claim.Label!=='3'||claim.PropagateID!==${JSON.stringify(reservation.body.id)})throw new Error('Unsanitized video');fs.unlinkSync(p);console.log('sanitized')`,
      ),
      "sanitized",
    );
    s.checks.push(
      "Linux worker retains video AI claims while removing audio and private global/stream metadata, with silent MP4 output",
    );
  }
  assert.match(
    await inside(
      s,
      "console.log(require('node:child_process').execFileSync('ffmpeg',['-version'],{encoding:'utf8'}).split('\\n')[0])",
    ),
    /ffmpeg version/,
  );
  assert.match(
    await inside(
      s,
      "console.log(require('node:child_process').execFileSync('ffprobe',['-version'],{encoding:'utf8'}).split('\\n')[0])",
    ),
    /ffprobe version/,
  );
  s.checks.push(
    "Linux FFmpeg and FFprobe execute in the non-root API container",
  );
  const unverifiedCards = await api(
    s,
    "me/achievement-cards",
    undefined,
    s.token,
  );
  assert.equal(unverifiedCards.status, 200);
  assert.equal(unverifiedCards.body.sharingAvailable, false);
  // This is solely the runner's synthetic account, never operator verification.
  await inside(
    s,
    `const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();try{await db.user.update({where:{email:${JSON.stringify(s.email)}},data:{adultVerified:true,identityVerified:true}});}finally{await db.$disconnect();}`,
  );
  for (const [sourceId, Label] of [
    [sourceImageId, "2"],
    [sourceVideoId, "3"],
  ] as const)
    if (sourceId) {
      const post = await api(
        s,
        "posts",
        {
          body: "Synthetic source claim",
          mediaIds: [sourceId],
          aiGenerated: false,
        },
        s.token,
      );
      assert.equal(post.status, 201);
      assert.equal(post.body.aiGenerated, true);
      assert.equal(post.body.aiSourceLabel, Label);
      const edited = await api(
        s,
        `posts/${post.body.id}`,
        {
          body: "Synthetic declaration cannot remove source label",
          mediaIds: [sourceId],
          aiGenerated: false,
          revision: 1,
        },
        s.token,
        "PATCH",
      );
      assert.equal(edited.status, 200);
      assert.equal(edited.body.aiSourceLabel, Label);
      assert.equal(edited.body.aiGenerated, true);
    }
  if (sourceImageId && sourceVideoId)
    s.checks.push(
      "Processed imported image/video claims force post labels on creation and editing despite a false user declaration",
    );
  const cards = await api(s, "me/achievement-cards", undefined, s.token);
  assert.equal(cards.status, 200);
  assert.ok(
    cards.body.achievements.some((a: any) => a.id === "first-checkpoint"),
  );
  assert.equal(cards.body.sharingAvailable, s.region === "INTL");
  const persistedCards: string[] = [];
  const cardRequest = {
    achievementId: "first-checkpoint",
    locale: "en",
    includeName: false,
    disclosureConfirmed: true,
  };
  if (s.region === "CN") {
    assert.equal(
      (await api(s, "me/achievement-cards", cardRequest, s.token)).status,
      403,
    );
  } else {
    assert.equal(
      (
        await api(
          s,
          "me/achievement-cards",
          { ...cardRequest, achievementId: "reviewed-physical" },
          s.token,
        )
      ).status,
      400,
    );
    for (const locale of ["en", "zh"]) {
      const prepared = await api(
        s,
        "me/achievement-cards",
        { ...cardRequest, locale },
        s.token,
      );
      assert.equal(prepared.status, 201);
      assert.equal(prepared.body.status, "READY");
      const row = prepared.body;
      persistedCards.push(row.id);
      const preview = await api(
        s,
        `me/achievement-cards/${row.id}/preview`,
        {},
        s.token,
      );
      assert.equal(preview.status, 201);
      assert.equal(preview.body.watermarked, true);
      assert.equal(preview.body.approvalDigest, row.imageDigest);
      assert.notEqual(preview.body.imageDigest, row.imageDigest);
      const clean = await api(
        s,
        `me/achievement-cards/${row.id}/export`,
        {
          revision: row.revision,
          imageDigest: row.imageDigest,
          disclosureConfirmed: true,
        },
        s.token,
      );
      assert.equal(clean.status, 201);
      assert.equal(clean.body.watermarked, false);
      assert.equal(clean.body.filename, "cubers-milestone.png");
      assert.match(clean.headers["cache-control"], /private.*no-store/);
      const png = Buffer.from(clean.body.base64, "base64"),
        metadata = await sharp(png).metadata();
      assert.equal(
        createHash("sha256").update(png).digest("hex"),
        row.imageDigest,
      );
      assert.equal(metadata.width, 1200);
      assert.equal(metadata.height, 1500);
      assert.equal(metadata.exif, undefined);
      assert.equal(metadata.xmp, undefined);
      await writeFile(join(root, `card-${locale}.png`), png, { mode: 0o600 });
    }
    const named = await api(
      s,
      "me/achievement-cards",
      { ...cardRequest, includeName: true },
      s.token,
    );
    assert.equal(named.status, 201);
    assert.equal(named.body.status, "PENDING_REVIEW");
    const row = named.body;
    assert.equal(
      (
        await api(
          s,
          `me/achievement-cards/${row.id}/export`,
          {
            revision: row.revision,
            imageDigest: row.imageDigest,
            disclosureConfirmed: true,
          },
          s.token,
        )
      ).status,
      409,
    );
    const staff = JSON.parse(
      await inside(
        s,
        `const {PrismaClient}=require('@prisma/client');const {passwordHash}=require('/app/apps/api/dist/crypto');const {authenticator}=require('otplib');const password=require('node:crypto').randomBytes(24).toString('base64url');const email='card-review-${runId}@cubers.test';const db=new PrismaClient();try{await db.user.create({data:{email,passwordHash:await passwordHash(password),displayName:'Synthetic card reviewer',birthDate:'1990-01-01',region:'INTL',role:'MODERATOR',emailVerified:true,adultVerified:true,identityVerified:true,mfaSecret:authenticator.generateSecret()}});console.log(JSON.stringify({email,password}));}finally{await db.$disconnect();}`,
      ),
    );
    let staffLogin: Awaited<ReturnType<typeof api>> | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      const otp = await inside(
        s,
        `const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();try{const user=await db.user.findUniqueOrThrow({where:{email:${JSON.stringify(staff.email)}}});console.log(require('otplib').authenticator.generate(user.mfaSecret));}finally{await db.$disconnect();}`,
      );
      staffLogin = await api(s, "auth/login", { ...staff, otp });
      if (staffLogin.status === 201) break;
    }
    assert.equal(staffLogin?.status, 201);
    const staffToken = staffLogin!.body.token;
    const reviewImage = await api(
      s,
      `admin/achievement-cards/${row.id}/preview`,
      {},
      staffToken,
    );
    assert.equal(reviewImage.status, 201);
    assert.equal(reviewImage.body.imageDigest, row.imageDigest);
    const reviewed = await api(
      s,
      `admin/achievement-cards/${row.id}/review`,
      {
        revision: row.revision,
        imageDigest: row.imageDigest,
        approve: true,
        imageChecked: true,
        reason: "",
      },
      staffToken,
    );
    assert.equal(reviewed.status, 201);
    assert.equal(reviewed.body.status, "READY");
    const exported = await api(
      s,
      `me/achievement-cards/${row.id}/export`,
      {
        revision: reviewed.body.revision,
        imageDigest: row.imageDigest,
        disclosureConfirmed: true,
      },
      s.token,
    );
    assert.equal(exported.status, 201);
    assert.equal(
      (
        await api(
          s,
          `admin/achievement-cards/${row.id}/review`,
          {
            revision: reviewed.body.revision,
            imageDigest: row.imageDigest,
            approve: false,
            imageChecked: false,
            reason: "Synthetic withdrawal check",
          },
          staffToken,
        )
      ).status,
      201,
    );
    assert.equal(
      (
        await api(
          s,
          `me/achievement-cards/${row.id}/export`,
          {
            revision: reviewed.body.revision,
            imageDigest: row.imageDigest,
            disclosureConfirmed: true,
          },
          s.token,
        )
      ).status,
      409,
    );
    // Transfer bounded QA images through exec output; Docker Desktop cannot
    // reliably copy a path backed by the container's private tmpfs mount.
    const artifacts = JSON.parse(
      await inside(
        s,
        `const assert=require('node:assert/strict');const fs=require('node:fs');const cp=require('node:child_process');assert.ok(cp.execFileSync('fc-match',['-f','%{family}','Noto Sans CJK SC'],{encoding:'utf8'}).includes('Noto Sans CJK SC'));assert.ok(fs.readFileSync('/usr/share/doc/fonts-noto-cjk/copyright','utf8').includes('SIL'));const {AchievementCatalog}=require('@cubers/core');const {renderAchievementCard}=require('/app/apps/api/dist/achievement-card-image');const sharp=require('sharp');const tiles=[];let i=0;for(const card of AchievementCatalog)for(const locale of ['en','zh']){const result=await renderAchievementCard(card.id,locale,null);tiles.push({input:await sharp(result.image).resize(300,375).toBuffer(),left:i%4*300,top:Math.floor(i/4)*375});i++;}const artifacts={'card-catalogue.png':(await sharp({create:{width:1200,height:1125,channels:3,background:'#ffffff'}}).composite(tiles).png().toBuffer()).toString('base64')};for(const [locale,label] of [['en','W'.repeat(40)],['zh','张'.repeat(40)]]){const result=await renderAchievementCard('first-checkpoint',locale,label);artifacts['card-wide-'+locale+'.png']=result.image.toString('base64');}console.log(JSON.stringify(artifacts));`,
      ),
    );
    for (const name of [
      "card-catalogue.png",
      "card-wide-en.png",
      "card-wide-zh.png",
    ]) {
      const bytes = Buffer.from(artifacts[name], "base64");
      assert.ok(bytes.length > 1000 && bytes.length < 1000000);
      assert.equal((await sharp(bytes).metadata()).format, "png");
      await writeFile(join(root, name), bytes, { mode: 0o600 });
    }
  }
  await compose(s, ["restart", "postgres"]);
  await waitFor(async () => {
    try {
      return (await api(s, "health")).status === 200;
    } catch {
      return false;
    }
  });
  assert.equal(
    (await api(s, "me", undefined, s.token)).body.displayName,
    "Synthetic Docker tester",
  );
  s.checks.push(
    "PostgreSQL restart preserves account/session data in its regional volume",
  );
  const restoredCards = await api(
    s,
    "me/achievement-cards/requests",
    undefined,
    s.token,
  );
  assert.equal(restoredCards.status, 200);
  for (const id of persistedCards)
    assert.ok(
      restoredCards.body.items.some(
        (row: any) => row.id === id && row.status === "READY",
      ),
    );
  s.checks.push(
    s.region === "CN"
      ? "Achievement-card sharing stays gated despite verified synthetic eligibility and earned milestones"
      : "Earned private PNG cards, CJK fonts, watermarked preview, real staff MFA review, withdrawal and database persistence",
  );
  assert.deepEqual(
    (await api(s, "me/notification-settings", undefined, s.token)).body
      .settings,
    { connections: false, clubs: false },
  );
  const sessionStats = await api(
    s,
    "me/session-statistics?timeZone=Asia%2FShanghai",
    undefined,
    s.token,
  );
  assert.equal(sessionStats.status, 200);
  assert.equal(sessionStats.body.timeZone, "Asia/Shanghai");
  assert.equal(sessionStats.body.window.limit, 1000);
  assert.ok(sessionStats.body.sessions.length <= 30);
  assert.ok(sessionStats.body.days.length <= 30);
  assert.equal(sessionStats.body.window.solves > 0, s.region === "INTL");
  assert.match(sessionStats.headers["cache-control"], /private.*no-store/);
  assert.equal(
    (
      await api(
        s,
        "me/session-statistics?timeZone=Mars%2FCity",
        undefined,
        s.token,
      )
    ).status,
    400,
  );
  assert.equal(JSON.stringify(sessionStats.body).includes('"nonce"'), false);
  s.checks.push(
    "Private timezone-aware session statistics, eligible solve categories, bounded history and database persistence",
  );
  assert.equal(
    (await api(s, `me/replays/${randomUUID()}`, undefined, s.token)).status,
    s.region === "CN" ? 403 : 404,
  );
  s.checks.push(
    "Owner-only saved virtual replay, bounded worker validation and mainland game gate",
  );
  assert.equal(
    (await api(s, `first-solves/${guidedId}`, undefined, s.token)).body.status,
    "COMPLETED",
  );
  assert.equal(
    (await api(s, `first-solves/${guidedTwoId}`, undefined, s.token)).body
      .status,
    "COMPLETED",
  );
  assert.equal(
    (await api(s, `first-solves/${guidedPyraId}`, undefined, s.token)).body
      .status,
    "COMPLETED",
  );
  assert.equal(
    (await api(s, `first-solves/${guidedFourId}`, undefined, s.token)).body
      .status,
    "COMPLETED",
  );
  assert.equal(
    (await api(s, `assessments/${placementId}`, undefined, s.token)).body
      .status,
    "COMPLETED",
  );
  let staffOtp = "";
  await waitFor(async () => {
    const proof = JSON.parse(
      await inside(
        s,
        `const {PrismaClient}=require('@prisma/client');const {authenticator}=require('otplib');const db=new PrismaClient();const u=await db.user.findUniqueOrThrow({where:{id:${JSON.stringify(provisionedStaff.id)}}});console.log(JSON.stringify({fresh:Math.floor(Date.now()/30000)>u.mfaLastStep&&Date.now()%30000<25000,otp:authenticator.generate(u.mfaSecret)}));await db.$disconnect();`,
      ),
    );
    staffOtp = proof.otp;
    return proof.fresh;
  }, 35000);
  const staffLogin = await api(s, "auth/login", {
    email: provisionedStaff.email,
    password: s.password,
    otp: staffOtp,
  });
  assert.equal(staffLogin.status, 201);
  assert.equal(
    (await api(s, "admin/overview", undefined, staffLogin.body.token)).status,
    200,
  );
  const operational = await api(
    s,
    "admin/operations",
    undefined,
    staffLogin.body.token,
  );
  assert.equal(operational.status, 200);
  const signals = OperationalSnapshot.parse(operational.body);
  assert.equal(signals.region, s.region);
  for (const signal of ["database", "redis", "worker"])
    assert.equal(signals.checks.find((c) => c.signal === signal)?.state, "ok");
  assert.ok(!JSON.stringify(signals).includes(provisionedStaff.email));
  assert.equal(
    (await api(s, "admin/operations", undefined, s.token)).status,
    403,
  );
  const monitorOutput = (
    await compose(s, ["logs", "--no-log-prefix", "--tail", "80", "monitor"])
  ).stdout;
  assert.ok(
    monitorOutput.split("\n").some((line) => {
      try {
        const event = JSON.parse(line);
        return (
          event.event === "cubers.operational.sample" &&
          event.region === s.region
        );
      } catch {
        return false;
      }
    }),
  );
  s.checks.push(
    "MFA-only aggregate service health, real worker heartbeat and separate redacted regional monitor process; no external alert delivery",
  );
  assert.equal(
    (
      await api(s, "auth/login", {
        email: provisionedStaff.email,
        password: s.password,
        otp: staffOtp,
      })
    ).status,
    403,
  );
  s.checks.push(
    "Compiled operator CLI bootstrap, protected enrollment files and cleanup, no eligibility override, MFA login and used-code replay denial",
  );
  // The second staff identity and every reported hardware observation are
  // synthetic fixtures. Real MFA runs, but no physical acceptance is claimed.
  const reviewerProof = JSON.parse(
    await inside(
      s,
      `const {PrismaClient}=require('@prisma/client'),{authenticator}=require('otplib'),{passwordHash}=require('./apps/api/dist/crypto');const db=new PrismaClient(),secret=authenticator.generateSecret();const u=await db.user.create({data:{email:'device-review-${runId}-${s.region.toLowerCase()}@cubers.invalid',displayName:'Synthetic device reviewer',birthDate:'1990-01-01',passwordHash:await passwordHash(${JSON.stringify(s.password)}),region:process.env.REGION,emailVerified:true,role:'ADMIN',mfaSecret:secret}});console.log(JSON.stringify({email:u.email,otp:authenticator.generate(secret)}));await db.$disconnect();`,
    ),
  );
  const reviewerLogin = await api(s, "auth/login", {
    email: reviewerProof.email,
    password: s.password,
    otp: reviewerProof.otp,
  });
  assert.equal(reviewerLogin.status, 201);
  const testContent = declaredPassingDeviceTest();
  if (s.region === "CN") {
    testContent.model = "giiker-i3s";
    testContent.platform = "android";
  }
  const deviceReport = await api(
    s,
    "admin/device-tests",
    {
      content: testContent,
      reason: "Synthetic declared-physical review workflow only",
    },
    staffLogin.body.token,
  );
  assert.equal(deviceReport.status, 201);
  const devicePath = `admin/device-tests/${deviceReport.body.id}`;
  assert.equal(
    (
      await api(
        s,
        `${devicePath}/submit`,
        {
          expectedVersion: 1,
          reason: "Submit a synthetic workflow edition for independent review",
        },
        staffLogin.body.token,
      )
    ).status,
    201,
  );
  const deviceDecision = {
    expectedVersion: 2,
    approve: true,
    reason: "Exercise independent review without real hardware",
    evidenceInspected: true,
    physicalDeviceConfirmed: true,
    configurationConfirmed: true,
    independentReview: true,
  };
  assert.equal(
    (
      await api(
        s,
        `${devicePath}/review`,
        deviceDecision,
        staffLogin.body.token,
      )
    ).status,
    403,
  );
  const deviceApproved = await api(
    s,
    `${devicePath}/review`,
    deviceDecision,
    reviewerLogin.body.token,
  );
  assert.equal(deviceApproved.status, 201);
  assert.equal(deviceApproved.body.status, "APPROVED");
  assert.equal(deviceApproved.body.reviewedVersion, 2);
  assert.equal(deviceApproved.body.activationAvailable, false);
  assert.ok(
    (await api(s, "devices", undefined, s.token)).body.devices.every(
      (device: any) => !device.enabled && !device.physicallyTested,
    ),
  );
  const changedTest = await api(
    s,
    `${devicePath}/content`,
    {
      expectedVersion: 3,
      content: testContent,
      reason: "Editing physical declarations must clear the old review",
    },
    staffLogin.body.token,
  );
  assert.equal(changedTest.status, 201);
  assert.equal(changedTest.body.status, "DRAFT");
  assert.equal(changedTest.body.reviewedVersion, null);
  assert.equal(
    (
      await api(
        s,
        `${devicePath}/review`,
        deviceDecision,
        reviewerLogin.body.token,
      )
    ).status,
    409,
  );
  const deviceHistory = await api(
    s,
    `${devicePath}/history`,
    undefined,
    reviewerLogin.body.token,
  );
  assert.deepEqual(
    deviceHistory.body.map((row: any) => row.version),
    [4, 3, 2, 1],
  );
  const deviceLibrary = await api(
    s,
    "admin/device-tests",
    undefined,
    staffLogin.body.token,
  );
  assert.equal(deviceLibrary.body.activationAvailable, false);
  assert.equal("content" in deviceLibrary.body.items[0], false);
  assert.equal(
    (await api(s, "admin/device-tests", undefined, s.token)).status,
    403,
  );
  assert.equal(
    (
      await api(
        s,
        `${devicePath}/withdraw`,
        {
          expectedVersion: 4,
          reason: "Withdraw the isolated synthetic workflow record",
        },
        staffLogin.body.token,
      )
    ).status,
    201,
  );
  const devicePrivacy = (await api(s, "legal/privacy")).body;
  assert.ok(devicePrivacy.body.en.includes("Staff device-test records"));
  assert.ok(devicePrivacy.body.zh.includes("设备测试记录"));
  s.checks.push(
    "Scoped device test evidence, actual staff MFA, contributor-independent exact-version review, edit withdrawal and unchanged disabled hardware catalogue",
  );
  const sponsorPrivacy = (await api(s, "legal/privacy")).body;
  assert.ok(
    sponsorPrivacy.body.en.includes("Optional first-party sponsor cards"),
  );
  assert.ok(sponsorPrivacy.body.zh.includes("\u4e09\u4e2a\u65e5\u5386\u5e74"));
  const campaignLibrary = await api(
    s,
    "admin/campaigns",
    undefined,
    staffLogin.body.token,
  );
  assert.equal(campaignLibrary.status, 200);
  assert.equal(campaignLibrary.body.deliveryApproved, false);
  const campaignContent = {
    title: { en: "Synthetic cubing session", zh: "魔方体验测试" },
    summary: {
      en: "A synthetic first-party sponsor draft.",
      zh: "用于验收的第一方赞助草稿。",
    },
    category: "cubing-education",
    destination: "https://example.org/cubers",
    startsAt: new Date(Date.now() - 60000).toISOString(),
    endsAt: new Date(Date.now() + 3600000).toISOString(),
  };
  const announcementContent = {
    kind: "learning",
    title: { en: "Synthetic learning update", zh: "合成学习公告" },
    summary: { en: "A checked lesson update", zh: "经过检查的课程公告" },
    body: { en: "Read the current lesson slowly.", zh: "请慢慢学习当前课程。" },
    startsAt: new Date(Date.now() - 5000).toISOString(),
    endsAt: new Date(Date.now() + 3600000).toISOString(),
    courseId: "2-first-solve",
  };
  const notice = await api(
    s,
    "admin/announcements",
    {
      content: announcementContent,
      reason: "Synthetic staff editorial creation",
    },
    staffLogin.body.token,
  );
  assert.equal(notice.status, 201);
  assert.equal(notice.body.published, false);
  assert.equal(
    (
      await api(
        s,
        `announcements/${notice.body.id}?version=1`,
        undefined,
        s.token,
      )
    ).status,
    404,
  );
  const lessonVersion = (
    await api(s, "courses/2-first-solve", undefined, s.token)
  ).body.version;
  const reviewedNotice = await api(
    s,
    `admin/announcements/${notice.body.id}/publication`,
    {
      expectedVersion: 1,
      published: true,
      englishReviewed: true,
      chineseReviewed: true,
      rightsConfirmed: true,
      serviceOrLearningOnly: true,
      courseVersion: lessonVersion,
      reason: "Synthetic bilingual and scope review",
    },
    staffLogin.body.token,
  );
  assert.equal(reviewedNotice.status, 201);
  const noticePage = await api(s, "announcements", undefined, s.token);
  assert.equal(noticePage.status, 200);
  assert.ok(
    noticePage.body.items.some((item: any) => item.id === notice.body.id),
  );
  const noticeDetail = await api(
    s,
    `announcements/${notice.body.id}?version=2`,
    undefined,
    s.token,
  );
  assert.equal(noticeDetail.status, 200);
  assert.equal(noticeDetail.body.body.zh, announcementContent.body.zh);
  assert.equal(noticeDetail.body.courseId, announcementContent.courseId);
  assert.ok(noticeDetail.body.validForMs <= 30000);
  assert.equal(noticeDetail.body.reviewedAt, undefined);
  assert.equal(
    (
      await api(
        s,
        `announcements/${notice.body.id}?version=1`,
        undefined,
        s.token,
      )
    ).status,
    409,
  );
  const changedNotice = await api(
    s,
    `admin/announcements/${notice.body.id}/content`,
    {
      expectedVersion: 2,
      content: {
        ...announcementContent,
        body: {
          ...announcementContent.body,
          en: "Corrected synthetic learning copy.",
        },
      },
      reason: "Synthetic correction withdraws the old copy",
    },
    staffLogin.body.token,
  );
  assert.equal(changedNotice.status, 201);
  assert.equal(changedNotice.body.published, false);
  assert.equal(
    (
      await api(
        s,
        `announcements/${notice.body.id}?version=2`,
        undefined,
        s.token,
      )
    ).status,
    404,
  );
  const noticeHistory = await api(
    s,
    `admin/announcements/${notice.body.id}/history`,
    undefined,
    staffLogin.body.token,
  );
  assert.deepEqual(
    noticeHistory.body.map((item: any) => item.version),
    [3, 2, 1],
  );
  assert.equal(
    (
      await api(
        s,
        "admin/announcements",
        {
          content: announcementContent,
          reason: "Unauthorized synthetic staff write",
        },
        s.token,
      )
    ).status,
    403,
  );
  s.checks.push(
    "Bilingual staff announcements, exact-version review and lesson binding, current private reads and automatic withdrawal on edit",
  );
  const campaignDraft = await api(
    s,
    "admin/campaigns",
    { content: campaignContent, reason: "Synthetic operator campaign test" },
    staffLogin.body.token,
  );
  assert.equal(campaignDraft.status, 201);
  assert.equal(campaignDraft.body.enabled, false);
  assert.equal(campaignDraft.body.reviewed, false);
  const campaignReview = await api(
    s,
    `admin/campaigns/${campaignDraft.body.id}/review`,
    {
      expectedVersion: 1,
      decision: "approve",
      archiveReference: "REGISTER/2026/DOCKER",
      advertiserRecordReviewed: true,
      destinationReviewed: true,
      bilingualReviewed: true,
      reason: "Synthetic advertiser review confirmation",
    },
    staffLogin.body.token,
  );
  assert.equal(campaignReview.status, 201);
  assert.equal(campaignReview.body.enabled, false);
  const campaignEnable = await api(
    s,
    `admin/campaigns/${campaignDraft.body.id}/enabled`,
    {
      expectedVersion: 2,
      enabled: true,
      reason: "Synthetic scheduled activation test",
    },
    staffLogin.body.token,
  );
  assert.equal(campaignEnable.status, 201);
  assert.deepEqual((await api(s, "sponsors", undefined, s.token)).body, []);
  assert.equal(
    (
      await api(
        s,
        `sponsors/${campaignDraft.body.id}/open`,
        { expectedVersion: 3 },
        s.token,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await api(
        s,
        "admin/settings/sponsors",
        {
          expectedVersion: campaignLibrary.body.setting.version,
          enabled: true,
        },
        staffLogin.body.token,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await api(
        s,
        `admin/campaigns/${campaignDraft.body.id}/content`,
        {
          expectedVersion: 1,
          content: campaignContent,
          reason: "Synthetic stale-version denial test",
        },
        staffLogin.body.token,
      )
    ).status,
    409,
  );
  const campaignEdit = await api(
    s,
    `admin/campaigns/${campaignDraft.body.id}/content`,
    {
      expectedVersion: 3,
      content: {
        ...campaignContent,
        title: { en: "Revised synthetic session", zh: "修订后的体验测试" },
      },
      reason: "Synthetic bilingual revision test",
    },
    staffLogin.body.token,
  );
  assert.equal(campaignEdit.status, 201);
  assert.equal(campaignEdit.body.enabled, false);
  assert.equal(campaignEdit.body.reviewed, false);
  const campaignHistory = await api(
    s,
    `admin/campaigns/${campaignDraft.body.id}/history`,
    undefined,
    staffLogin.body.token,
  );
  assert.equal(campaignHistory.status, 200);
  assert.equal(campaignHistory.body.items.length, 4);
  s.checks.push(
    "Bilingual sponsor drafts, exact-version review and withdrawal, archived revisions and independent regional delivery gate remains off",
  );
  const draftLesson = {
    puzzle: "3x3",
    kind: "drill",
    level: "beginner",
    title: { en: "Synthetic original drill", zh: "原创测试练习" },
    summary: {
      en: "A bounded exercise for container verification.",
      zh: "用于容器验收的有限练习。",
    },
    steps: {
      en: ["Keep the reference and follow each turn."],
      zh: ["保持参照方向，逐步完成转动。"],
    },
    algorithm: "R U R' U'",
    minutes: 5,
  };
  const publication = (version: number) => ({
    expectedVersion: version,
    published: true,
    reviewed: true,
    englishReviewed: true,
    chineseReviewed: true,
    rightsConfirmed: true,
  });
  const createdCourse = await api(
    s,
    "admin/courses",
    { lesson: draftLesson, reason: "Synthetic container course authoring" },
    staffLogin.body.token,
  );
  assert.equal(createdCourse.status, 201);
  assert.equal(createdCourse.body.published, false);
  let authoredCourse = createdCourse.body;
  assert.equal(
    (await api(s, `courses/${authoredCourse.id}`, undefined, s.token)).status,
    404,
  );
  assert.equal(
    (
      await api(
        s,
        `admin/courses/${authoredCourse.id}`,
        publication(1),
        staffLogin.body.token,
      )
    ).status,
    201,
  );
  assert.equal(
    (
      await api(
        s,
        `progress/${authoredCourse.id}`,
        { courseVersion: 2, moves: draftLesson.algorithm.split(" ") },
        s.token,
      )
    ).status,
    201,
  );
  const physicalStart = await api(
    s,
    `courses/${authoredCourse.id}/sessions`,
    { input: "scan", courseVersion: 2 },
    s.token,
  );
  assert.equal(physicalStart.status, 201);
  const revisedLesson = {
    ...authoredCourse.content,
    title: { en: "Revised synthetic drill", zh: "修订后的测试练习" },
    algorithm: "U R U' R'",
  };
  const revision = await api(
    s,
    `admin/courses/${authoredCourse.id}/content`,
    {
      expectedVersion: 2,
      lesson: revisedLesson,
      reason: "Synthetic publication and history revision",
    },
    staffLogin.body.token,
  );
  assert.equal(revision.status, 201);
  assert.equal(revision.body.version, 3);
  assert.equal(revision.body.published, false);
  assert.equal(
    (await api(s, `courses/${authoredCourse.id}`, undefined, s.token)).status,
    404,
  );
  assert.equal(
    (
      await api(
        s,
        `admin/courses/${authoredCourse.id}`,
        publication(2),
        staffLogin.body.token,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await api(
        s,
        `admin/courses/${authoredCourse.id}`,
        publication(3),
        staffLogin.body.token,
      )
    ).status,
    201,
  );
  const progressReply = await api(s, "progress", undefined, s.token);
  assert.equal(
    progressReply.status,
    200,
    `Progress read HTTP ${progressReply.status}: ${String(progressReply.body?.message || "unexpected response").slice(0, 180)}`,
  );
  assert.ok(
    Array.isArray(progressReply.body),
    "Progress response must remain an array",
  );
  const priorPractice = progressReply.body.find(
    (row: any) => row.lessonId === authoredCourse.id,
  );
  assert.equal(priorPractice.completed, true);
  assert.equal(priorPractice.currentCompleted, false);
  assert.equal(priorPractice.courseVersion, 2);
  assert.equal(
    (
      await api(
        s,
        `progress/${authoredCourse.id}`,
        { courseVersion: 2, moves: draftLesson.algorithm.split(" ") },
        s.token,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await api(
        s,
        "tutor",
        {
          lessonId: authoredCourse.id,
          courseVersion: 2,
          locale: "en",
          moves: [],
          question: "why",
        },
        s.token,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await api(
        s,
        `lesson-sessions/${physicalStart.body.id}/moves`,
        { version: 0, moves: ["R"] },
        s.token,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await api(
        s,
        `progress/${authoredCourse.id}`,
        { courseVersion: 4, moves: revisedLesson.algorithm.split(" ") },
        s.token,
      )
    ).status,
    201,
  );
  assert.equal(
    (await api(s, "progress", undefined, s.token)).body.find(
      (row: any) => row.lessonId === authoredCourse.id,
    ).currentCompleted,
    true,
  );
  const revisions = await api(
    s,
    `admin/courses/${authoredCourse.id}/revisions`,
    undefined,
    staffLogin.body.token,
  );
  assert.equal(revisions.status, 200);
  assert.deepEqual(
    revisions.body.items.map((row: any) => row.version),
    [4, 3, 2, 1],
  );
  const library = await api(
    s,
    `admin/course-library?q=${encodeURIComponent(authoredCourse.id)}`,
    undefined,
    staffLogin.body.token,
  );
  assert.equal(library.status, 200);
  assert.equal(library.body.items[0].id, authoredCourse.id);
  s.checks.push(
    "Persisted original bilingual course authoring, review-bound publication, revision conflicts/history, preserved historical progress and stale virtual/scan/tutor rejection",
  );
  const competitionNow = Date.now();
  const competition = await api(
    s,
    "admin/competitions",
    {
      title: { en: "Synthetic container competition", zh: "容器测试比赛" },
      description: {
        en: "Private scores; explicit approved sharing.",
        zh: "成绩私密，明确授权后分享。",
      },
      puzzle: "3x3",
      input: "virtual",
      ranked: false,
      capacity: 100,
      registrationOpensAt: new Date(competitionNow - 60000).toISOString(),
      registrationClosesAt: new Date(competitionNow + 600000).toISOString(),
      rounds: [
        {
          title: { en: "Round one", zh: "第一轮" },
          format: "BEST1",
          opensAt: new Date(competitionNow + 1200000).toISOString(),
          closesAt: new Date(competitionNow + 1800000).toISOString(),
        },
      ],
    },
    staffLogin.body.token,
  );
  assert.equal(competition.status, 201);
  assert.equal(JSON.stringify(competition.body).includes("scrambles"), false);
  const publishedCompetition = await api(
    s,
    `admin/competitions/${competition.body.id}/publish`,
    {
      expectedVersion: 1,
      englishReviewed: true,
      chineseReviewed: true,
      rulesReviewed: true,
      rightsConfirmed: true,
    },
    staffLogin.body.token,
  );
  if (s.region === "CN") {
    assert.equal(publishedCompetition.status, 403);
    assert.equal(
      (await api(s, "competitions", undefined, s.token)).status,
      403,
    );
    assert.equal(
      (
        await api(
          s,
          `admin/competitions/${competition.body.id}`,
          undefined,
          staffLogin.body.token,
        )
      ).body.status,
      "DRAFT",
    );
    s.checks.push(
      "Persisted private bilingual competition draft; mainland game gate prevents publication and participation",
    );
  } else {
    assert.equal(publishedCompetition.status, 201);
    assert.equal(
      (
        await api(
          s,
          `competitions/${competition.body.id}/register`,
          { expectedVersion: 2, privateResultsUnderstood: true },
          s.token,
        )
      ).status,
      201,
    );
    const roundId = competition.body.rounds[0].id;
    await inside(
      s,
      `const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();try{await db.competition.update({where:{id:${JSON.stringify(competition.body.id)}},data:{registrationClosesAt:new Date(Date.now()-60000)}});await db.competitionRound.update({where:{id:${JSON.stringify(roundId)}},data:{opensAt:new Date(Date.now()-60000),closesAt:new Date(Date.now()+600000)}});}finally{await db.$disconnect();}`,
    );
    const entered = await api(
      s,
      `competitions/${competition.body.id}/rounds/${roundId}/attempts`,
      { index: 0 },
      s.token,
    );
    assert.equal(entered.status, 201);
    const a = entered.body.attempt;
    assert.equal(
      (await api(s, `rooms/${entered.body.roomId}/attempts`, {}, s.token))
        .status,
      403,
    );
    assert.equal(
      (await api(s, `attempts/${a.id}/inspect`, { nonce: a.nonce }, s.token))
        .status,
      201,
    );
    assert.equal(
      (await api(s, `attempts/${a.id}/start`, { nonce: a.nonce }, s.token))
        .status,
      201,
    );
    assert.equal(
      (
        await api(
          s,
          `attempts/${a.id}/moves`,
          {
            nonce: a.nonce,
            events: inverse(a.scramble).map((move, sequence) => ({
              move,
              sequence,
              elapsedMs: 0,
            })),
          },
          s.token,
        )
      ).status,
      201,
    );
    await new Promise((resolve) => setTimeout(resolve, 350));
    const finish = await api(
      s,
      `attempts/${a.id}/finish`,
      { nonce: a.nonce },
      s.token,
    );
    assert.equal(finish.status, 201);
    assert.equal(finish.body.status, "APPROVED");
    await inside(
      s,
      `const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();try{await db.competitionRound.update({where:{id:${JSON.stringify(roundId)}},data:{closesAt:new Date()}});}finally{await db.$disconnect();}`,
    );
    assert.equal(
      (
        await api(
          s,
          `competitions/${competition.body.id}/board`,
          undefined,
          s.token,
        )
      ).body.items.length,
      0,
    );
    const detail = (
      await api(s, `competitions/${competition.body.id}`, undefined, s.token)
    ).body;
    const shared = await api(
      s,
      `competitions/${competition.body.id}/share`,
      {
        scope: "overall",
        sharingUnderstood: true,
        digest: detail.mine.digests.overall,
      },
      s.token,
    );
    assert.equal(shared.status, 201);
    assert.equal(shared.body.status, "READY");
    const board = (
      await api(
        s,
        `competitions/${competition.body.id}/board`,
        undefined,
        s.token,
      )
    ).body;
    assert.equal(board.items.length, 1);
    assert.equal(board.items[0].score.units, finish.body.durationMs * 3);
    assert.deepEqual(Object.keys(board.items[0]).sort(), [
      "number",
      "rank",
      "score",
    ]);
    assert.equal(
      (
        await api(
          s,
          `competitions/publications/${shared.body.id}/cancel`,
          {
            revision: shared.body.revision,
            digest: shared.body.digest,
            approve: false,
            checkedExactResult: true,
            reason: "Synthetic owner withdrew anonymous score sharing",
          },
          s.token,
        )
      ).status,
      201,
    );
    assert.equal(
      (
        await api(
          s,
          `competitions/${competition.body.id}/board`,
          undefined,
          s.token,
        )
      ).body.items.length,
      0,
    );
    s.checks.push(
      "Persisted bilingual scheduled competition, private registration/attempt, shared secret scramble, real verified solve, exact anonymous sharing, withdrawal and generic-room bypass denial",
    );
  }
  const journalProof = JSON.parse(
    await inside(
      s,
      `
    const fs=require('node:fs/promises');const {execFileSync}=require('node:child_process');const {PrismaClient}=require('@prisma/client');const {FileDeletionJournal}=require('/app/apps/api/dist/deletion-journal');
    const root='/tmp/recovery-${runId}',directory=root+'/journal',key=root+'/keys/key.json',input=root+'/request.json';
    await fs.mkdir(root,{mode:0o700});await fs.mkdir(directory,{mode:0o700});await fs.mkdir(root+'/keys',{mode:0o700});
    const env={...process.env,DELETION_JOURNAL_MODE:'file',DELETION_JOURNAL_DIRECTORY:directory,DELETION_JOURNAL_KEY_FILE:key};
    async function cli(operation,confirmation){await fs.writeFile(input,JSON.stringify({operation,confirmation,region:process.env.REGION,databaseHost:'postgres',databaseName:'cubers'}),{mode:0o600});try{return {code:0,...JSON.parse(execFileSync(process.execPath,['apps/api/dist/recovery-cli.js',input],{env,stdio:['ignore','pipe','pipe']}).toString())};}catch(e){if(e.status===2)return {code:2,...JSON.parse(e.stdout.toString())};throw new Error('Synthetic recovery operator command failed');}}
    const initialized=await cli('initialize','INITIALIZE RECOVERY');if(initialized.status!=='initialized')throw new Error('Recovery binding not initialized');
    const db=new PrismaClient();try{const u=await db.user.create({data:{email:'recovery-${runId}@cubers.test',displayName:'Synthetic recovery account',birthDate:'1990-01-01',region:process.env.REGION,emailVerified:true,passwordHash:'synthetic-not-a-production-password'}});
      const journal=await FileDeletionJournal.load(directory,key,process.env.REGION),record=await journal.append([u.id]);
      if((await fs.readFile(directory+'/'+record.id+'.journal','utf8')).includes(u.id))throw new Error('Journal was not encrypted');
      const pending=await cli('check','CHECK RECOVERY');if(pending.code!==2||pending.pending!==1)throw new Error('Pending recovery was not detected');
      const replay=await cli('replay','REPLAY DELETIONS');if(replay.applied!==1)throw new Error('Journal was not replayed');
      const checked=await cli('check','CHECK RECOVERY');if(checked.code!==0||checked.pending!==0)throw new Error('Replay did not settle');
      const current=await db.user.findUnique({where:{id:u.id}});if(current&&!current.deletedAt)throw new Error('Deleted account stayed active');
      console.log(JSON.stringify({initialized:true,encrypted:true,pendingDenied:true,replayed:true,checked:true,temporaryStorageOnly:true}));
    }finally{await db.$disconnect();}
  `,
    ),
  );
  assert.deepEqual(journalProof, {
    initialized: true,
    encrypted: true,
    pendingDenied: true,
    replayed: true,
    checked: true,
    temporaryStorageOnly: true,
  });
  s.checks.push(
    "Compiled recovery operator CLI, private encrypted regional journal/binding, pending-check denial and idempotent deletion replay in container tmpfs; production storage persistence and real backup restore remain separate acceptance",
  );
}
async function checkRelay(s: Stack) {
  const definition = {
    puzzle: "2x2",
    input: "virtual",
    mode: "relay",
    ranked: false,
    private: true,
  };
  if (s.region === "CN") {
    assert.equal((await api(s, "rooms", definition, s.token)).status, 403);
    assert.equal(
      (await api(s, `rooms/${randomUUID()}/relay/end`, {}, s.token)).status,
      403,
    );
    s.checks.push(
      "Cooperative relay remains unavailable under mainland game approval gates",
    );
    return;
  }
  const host = (await api(s, "me", undefined, s.token)).body.id;
  const peer = JSON.parse(
    await inside(
      s,
      `const {PrismaClient}=require('@prisma/client'),{opaque,hash,passwordHash}=require('/app/apps/api/dist/crypto');const db=new PrismaClient();try{const token=opaque(),u=await db.user.create({data:{email:'relay-${runId}@cubers.test',passwordHash:await passwordHash(opaque()),displayName:'Synthetic relay peer',birthDate:'1990-01-01',region:process.env.REGION,emailVerified:true}});await db.session.create({data:{userId:u.id,tokenHash:hash(token),expiresAt:new Date(Date.now()+3600000)}});console.log(JSON.stringify({id:u.id,token}));}finally{await db.$disconnect();}`,
    ),
  );
  const tokens: Record<string, string> = {
    [host]: s.token!,
    [peer.id]: peer.token,
  };
  const made = await api(s, "rooms", definition, s.token);
  assert.equal(made.status, 201);
  const room = made.body;
  assert.equal(
    (await api(s, "rooms/join", { code: room.code }, peer.token)).status,
    201,
  );
  assert.equal(
    (await api(s, `rooms/${room.id}/relay/end`, {}, peer.token)).status,
    403,
  );
  assert.equal(
    (await api(s, `rooms/${room.id}/start`, {}, s.token)).status,
    201,
  );
  const order = (await api(s, `rooms/${room.id}`, undefined, s.token)).body
    .roster;
  let total = 0;
  for (const [index, user] of order.entries()) {
    const token = tokens[user],
      madeAttempt = await api(s, `rooms/${room.id}/attempts`, {}, token);
    assert.equal(madeAttempt.status, 201);
    const a = madeAttempt.body;
    assert.equal(
      (await api(s, `attempts/${a.id}/inspect`, { nonce: a.nonce }, token))
        .status,
      201,
    );
    assert.equal(
      (await api(s, `attempts/${a.id}/start`, { nonce: a.nonce }, token))
        .status,
      201,
    );
    const events = inverse(a.scramble).map((move, sequence) => ({
      move,
      sequence,
      elapsedMs: sequence,
    }));
    assert.equal(
      (
        await api(
          s,
          `attempts/${a.id}/moves`,
          { nonce: a.nonce, events },
          token,
        )
      ).status,
      201,
    );
    await new Promise((resolve) => setTimeout(resolve, 350));
    const done = await api(
      s,
      `attempts/${a.id}/finish`,
      { nonce: a.nonce },
      token,
    );
    assert.equal(done.status, 201);
    total += done.body.durationMs;
    const current = (await api(s, `rooms/${room.id}`, undefined, s.token)).body;
    assert.equal(current.round, index + 1);
    assert.equal(current.relay.completed, index + 1);
    assert.equal(current.relay.solveTotalMs, total);
    assert.equal(
      current.relay.status,
      index === order.length - 1 ? "complete" : "active",
    );
    for (const id of order)
      assert.equal(JSON.stringify(current.relay).includes(id), false);
  }
  const second = (await api(s, "rooms", definition, s.token)).body;
  await api(s, "rooms/join", { code: second.code }, peer.token);
  await api(s, `rooms/${second.id}/start`, {}, s.token);
  const state = (await api(s, `rooms/${second.id}`, undefined, s.token)).body;
  const token = tokens[state.roster[0]],
    a = (await api(s, `rooms/${second.id}/attempts`, {}, token)).body;
  const socket = io(`https://localhost:${s.port}/play`, {
    auth: { token },
    transports: ["websocket"],
    reconnection: false,
    ca: s.ca,
    rejectUnauthorized: false,
    extraHeaders: { Origin: `https://localhost:${s.port}` },
    timeout: 15000,
  });
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });
    assert.equal(
      (
        await socket
          .timeout(10000)
          .emitWithAck("room.join", { roomId: second.id })
      ).ok,
      true,
    );
    assert.equal(
      (await api(s, `attempts/${a.id}/inspect`, { nonce: a.nonce }, token))
        .status,
      201,
    );
    socket.disconnect();
    await waitFor(
      async () =>
        (await api(s, `rooms/${second.id}`, undefined, s.token)).body.status ===
        "CLOSED",
      10000,
    );
    const ended = (await api(s, `rooms/${second.id}`, undefined, s.token)).body;
    assert.equal(ended.relay.status, "interrupted");
    assert.equal(ended.relay.completed, 0);
  } finally {
    socket.disconnect();
  }
  s.checks.push(
    "Atomic cooperative relay handoffs, exact private team totals, host-only ending and real WebSocket interruption without ranking credit",
  );
}

async function main() {
  await mkdir(root, { recursive: true, mode: 0o700 });
  try {
    report.engine = (
      await command(["info", "--format", "{{.ServerVersion}}"])
    ).stdout.trim();
    if (process.env.CUBERS_DOCKER_OFFLINE_BASES) {
      await buildOfflineImages(process.env.CUBERS_DOCKER_OFFLINE_BASES);
    } else {
      await streamed(
        [
          "build",
          ...(pullBaseImages ? ["--pull"] : []),
          "-f",
          "infra/Dockerfile.api",
          "--target",
          "runtime",
          "-t",
          images.api,
          ".",
        ],
        "API image build",
      );
      await streamed(
        [
          "build",
          "-f",
          "infra/Dockerfile.api",
          "--target",
          "migrations",
          "-t",
          images.migrations,
          ".",
        ],
        "Migration image build",
      );
      await streamed(
        [
          "build",
          ...(pullBaseImages ? ["--pull"] : []),
          "-f",
          "infra/Dockerfile.admin",
          "-t",
          images.admin,
          ".",
        ],
        "Admin image build",
      );
      await streamed(
        [
          "build",
          "-f",
          "infra/Dockerfile.api",
          "--target",
          "development-storage",
          "-t",
          images.developmentStorage,
          ".",
        ],
        "Development storage image build",
      );
    }
    if (process.env.CUBERS_WEB_IMAGE_ID) {
      const id = process.env.CUBERS_WEB_IMAGE_ID;
      assert.match(id, /^sha256:[a-f0-9]{64}$/);
      const sourceFile = join(root, "web-source-proof.json");
      await execFile("node", ["scripts/web-build-proof.mjs", sourceFile], {
        encoding: "utf8",
      });
      const expected = JSON.parse(await readFile(sourceFile, "utf8"));
      const actual = JSON.parse(
        (
          await command([
            "run",
            "--rm",
            "--network",
            "none",
            "--read-only",
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges:true",
            "--user",
            "101",
            "--entrypoint",
            "cat",
            id,
            "/opt/cubers-web-build.json",
          ])
        ).stdout,
      );
      assert.deepEqual(
        actual.sources,
        expected.sources,
        "Cached web image must match all current frontend/build sources",
      );
      await command(["tag", id, images.web]);
      report.webImage = {
        id,
        sourceHashes: Object.keys(actual.sources).length,
        publicBuild: actual.publicBuild,
      };
    } else {
      await streamed(
        [
          "build",
          ...(pullBaseImages ? ["--pull"] : []),
          "-f",
          "infra/Dockerfile.web",
          "--build-arg",
          "EXPO_PUBLIC_API_URL_INTL=https://api-intl.example.invalid",
          "--build-arg",
          "EXPO_PUBLIC_API_URL_CN=https://api-cn.example.invalid",
          "--build-arg",
          "EXPO_PUBLIC_COMMUNITY_DISCOVERY_URL=https://community.example.invalid",
          "-t",
          images.web,
          ".",
        ],
        "Web companion image build",
      );
    }
    await command([
      "run",
      "--rm",
      "--network",
      "none",
      "--read-only",
      "--tmpfs",
      "/tmp:size=67108864,mode=1777",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges:true",
      "--user",
      "101",
      "--entrypoint",
      "nginx",
      images.web,
      "-t",
    ]);
    report.caveats.push(
      "The web build uses reserved example service addresses. Static packaging and JSON transport are checked; no browser/HTML/UI inspection or production frontend commissioning.",
    );
    if (process.env.CUBERS_DOCUMENTS_IMAGE_ID) {
      const id = process.env.CUBERS_DOCUMENTS_IMAGE_ID;
      assert.match(id, /^sha256:[a-f0-9]{64}$/);
      const expected = createHash("sha256")
        .update(await readFile("infra/document-review.mjs"))
        .digest("hex");
      const actual = await command([
        "run",
        "--rm",
        "--network",
        "none",
        "--read-only",
        "--cap-drop",
        "ALL",
        "--entrypoint",
        "node",
        id,
        "-e",
        "console.log(require('crypto').createHash('sha256').update(require('fs').readFileSync('/opt/cubers-documents/document-review.mjs')).digest('hex'))",
      ]);
      assert.equal(actual.stdout.trim(), expected);
      await command(["tag", id, images.documents]);
      report.documentImage = {
        id,
        sourceSha256: expected,
        refresh: "explicit-local-image",
      };
    } else {
      await streamed(
        [
          "build",
          ...(pullBaseImages ? ["--pull"] : []),
          "-f",
          "infra/Dockerfile.documents",
          "-t",
          images.documents,
          ".",
        ],
        "Isolated document image build",
      );
    }
    if (process.env.CUBERS_PROXY_IMAGE_ID) {
      const id = process.env.CUBERS_PROXY_IMAGE_ID;
      assert.match(id, /^sha256:[a-f0-9]{64}$/);
      await command(["tag", id, images.proxy]);
      report.proxyImage = { id, refresh: "explicit-local-image" };
    } else {
      await streamed(
        [
          "build",
          ...(pullBaseImages ? ["--pull"] : []),
          "-f",
          "infra/Dockerfile.proxy",
          "-t",
          images.proxy,
          ".",
        ],
        "Proxy image build",
      );
    }
    report.images = images;
    report.imageMetadata = (
      await command([
        "image",
        "inspect",
        ...Object.values(images),
        "--format",
        "{{json .}}",
      ])
    ).stdout
      .trim()
      .split("\n")
      .map((line) => {
        const i = JSON.parse(line);
        return {
          id: i.Id,
          os: i.Os,
          architecture: i.Architecture,
        };
      });
    await checkDevelopmentStorage();
    for (const [index, region] of (["INTL", "CN"] as const).entries()) {
      const stack = await setup(region, index);
      stacks.push(stack);
      await compose(stack, ["config", "--quiet"]);
      await streamed(
        [
          ...stack.compose,
          "up",
          "--detach",
          "--no-build",
          "--wait",
          "--wait-timeout",
          "180",
        ],
        `${region} container startup`,
      );
      stack.ca = (
        await compose(stack, [
          "exec",
          "-T",
          "https",
          "cat",
          "/data/caddy/pki/authorities/local/root.crt",
        ])
      ).stdout;
      await compose(stack, [
        "exec",
        "-T",
        "https",
        "caddy",
        "validate",
        "--config",
        "/etc/caddy/Caddyfile",
        "--adapter",
        "caddyfile",
      ]);
      await compose(stack, ["exec", "-T", "admin", "nginx", "-t"]);
      report.regions.push({ region, checks: stack.checks });
      await check(stack);
      await checkCommunityAuthority(stack);
      await checkOperationalDelivery(stack);
      await checkSnapshotExpiry(stack);
      await checkLearningAuthority(stack);
      await checkSmartLearning(stack);
      await checkSmartFirstSolves(stack);
      await checkSmartPlay(stack);
      await checkSmartCompetitions(stack);
      await checkMixedRooms(stack);
      await checkSmartReplays(stack);
      await checkReplaySharing(stack);
      await checkAppAttestation(stack);
      await checkAppleCertificateStatus(stack);
      await checkAppleReceiptExchange(stack);
      await checkMediaLabels(stack);
      await checkAiModeration(stack);
      await checkPlayIntegrity(stack);
      await checkTutorAuthority(stack);
      await checkLessonAlternatives(stack);
      await checkPublicCompanion(stack);
      console.log(`${region}: ${stack.checks.length} container checks passed`);
    }
    const [intl, cn] = stacks;
    assert.equal((await api(cn, "me", undefined, intl.token)).status, 401);
    assert.equal((await api(intl, "me", undefined, cn.token)).status, 401);
    assert.notEqual(
      createHash("sha256").update(intl.ca!).digest("hex"),
      createHash("sha256").update(cn.ca!).digest("hex"),
    );
    report.regionalIsolation =
      "Cross-region bearer sessions rejected; separate volumes, networks, credentials and TLS authorities";
    report.status = "passed";
    report.completedAt = new Date().toISOString();
  } catch (error) {
    report.status = "failed";
    report.error = (error as Error).message;
    report.errorStack = (error as Error).stack;
    throw error;
  } finally {
    for (const s of stacks) {
      try {
        const logs = await compose(s, ["logs", "--no-color"]);
        await writeFile(
          join(root, `${s.region}-containers.log`),
          logs.stdout + logs.stderr,
          { mode: 0o600 },
        );
      } catch {}
      // Names are generated here, never accepted from arguments or environment.
      // Remove only this test's own containers and disposable named volumes.
      try {
        await compose(s, ["down", "--volumes", "--remove-orphans"]);
        await rm(s.file, { force: true });
      } catch {
        report.cleanupIncomplete = true;
        (report.remainingProjects ??= []).push({
          project: s.project,
          envFile: s.file,
        });
      }
    }
    if (report.cleanupIncomplete) {
      report.status = "cleanup-incomplete";
      process.exitCode = 1;
    }
    await writeFile(
      join(root, "report.json"),
      JSON.stringify(report, null, 2) + "\n",
      { mode: 0o600 },
    );
    console.log(`Private container test report: ${join(root, "report.json")}`);
  }
}
void main().catch(() => {
  console.error(
    "Docker verification failed; inspect its private report and logs.",
  );
  process.exitCode = 1;
});
