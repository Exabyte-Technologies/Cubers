// Disposable real PostgreSQL + S3-emulator media capture/expiry drill. No public ports.
import assert from "node:assert/strict";
import { execFile as callback } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
const exec = promisify(callback),
  id = randomUUID().slice(0, 8),
  prefix = `cubers-vault-${id}`,
  root = resolve(".data/media-vault-drill", id),
  anonymous = new Set<string>();
const recoveryImage =
    process.env.CUBERS_RECOVERY_IMAGE || "cubers-recovery:development",
  migrationImage =
    process.env.CUBERS_RECOVERY_MIGRATIONS_IMAGE ||
    "cubers-recovery-migrations:development",
  storageImage =
    process.env.CUBERS_VAULT_STORAGE_IMAGE ||
    "cubers-vault-storage:development";
const report: any = {
  id,
  startedAt: new Date().toISOString(),
  regions: [],
  caveats: [
    "Synthetic PostgreSQL and local S3 emulator; not production IAM, off-host custody, replica/version erasure or durability certification",
    "Encrypted capture, sealed restoration and recurring current-object/key expiry; real provider version/replica controls and service commissioning remain unfinished",
    "Expiry tests advance an internal test clock; privacy-erasure pruning also runs at real current time",
    "No HTTP listener, SMTP, real AI, public ingress or existing database targeted",
  ],
};
async function docker(args: string[]) {
  return (
    await exec("docker", args, { timeout: 360000, maxBuffer: 8 * 1024 * 1024 })
  ).stdout.trim();
}
async function main() {
  await mkdir(root, { recursive: true, mode: 0o700 });
  await exec(
    "ffmpeg",
    [
      "-nostdin",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=32x32:r=2",
      "-t",
      "1",
      "-an",
      "-c:v",
      "libx264",
      "-map_metadata",
      "-1",
      "-movflags",
      "+faststart",
      join(root, "silent.mp4"),
    ],
    { timeout: 20000 },
  );
  const video = (await readFile(join(root, "silent.mp4"))).toString("base64");
  await unlink(join(root, "silent.mp4"));
  report.images = JSON.parse(
    "[" +
      (
        await docker([
          "image",
          "inspect",
          recoveryImage,
          migrationImage,
          storageImage,
          "--format",
          "{{json .Id}}",
        ])
      )
        .split("\n")
        .join(",") +
      "]",
  );
  for (const region of ["INTL", "CN"]) {
    const name = `${prefix}-${region.toLowerCase()}`,
      network = `${name}-private`,
      pg = `${name}-pg`,
      storage = `${name}-storage`,
      op = `${name}-operator`,
      maintenance = `${name}-maintenance`,
      volumes = ["db", "artifacts", "journal", "keys", "storage"].map(
        (x) => `${name}-${x}`,
      ),
      mounts = volumes
        .slice(1, 4)
        .flatMap((v, i) => [
          "-v",
          `${v}:/${["snapshots", "journal", "keys"][i]}`,
        ]);
    const env = {
        NODE_ENV: "test",
        REGION: region,
        DATABASE_URL: `postgresql://fixture:synthetic_only@${pg}/source?sslmode=disable`,
        REDIS_URL: "redis://unavailable:6379",
        S3_ENDPOINT: `http://${storage}:9000`,
        S3_BUCKET: `cubers-${region.toLowerCase()}`,
        S3_ACCESS_KEY: "synthetic-vault",
        S3_SECRET_KEY: "synthetic-vault-only",
        AI_MODE: "disabled",
        AI_API_KEY: "",
        OPENAI_API_KEY: "",
        QWEN_API_KEY: "",
        SMTP_URL: "",
        DELETION_JOURNAL_MODE: "file",
        DELETION_JOURNAL_DIRECTORY: "/journal",
        DELETION_JOURNAL_KEY_FILE: "/keys/journal.json",
      },
      envArgs = Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]);
    const checks: string[] = [];
    async function js(code: string) {
      return JSON.parse(
        (await docker([
          "exec",
          op,
          "node",
          "-e",
          `(async()=>{${code}})().catch(e=>{console.error(e.stack);if(e.privateDiagnostic)console.error(e.privateDiagnostic);process.exitCode=1})`,
        ])) || "null",
      );
    }
    const base = `const assert=require('node:assert/strict'),fs=require('node:fs/promises'),crypto=require('node:crypto'),{PrismaClient}=require('@prisma/client'),{readConfig}=require('./apps/api/dist/config'),{FileDeletionJournal}=require('./apps/api/dist/deletion-journal'),vault=require('./apps/api/dist/media-vault'),snapshot=require('./apps/api/dist/database-snapshot');const db=new PrismaClient(),j=await FileDeletionJournal.load('/journal','/keys/journal.json',process.env.REGION),config=readConfig(),paths={directory:'/snapshots/vault',secretDirectory:'/keys/vault',masterKeyFile:'/keys/vault-master.json'};`;
    const decode = `async function index(id){const k=await snapshot.readSnapshotKey('/keys/vault/'+id+'/database.json',j),box=JSON.parse(await fs.readFile('/snapshots/vault/'+id+'/bundle.json','utf8')),d=crypto.createDecipheriv('aes-256-gcm',k,Buffer.from(box.iv,'base64'));d.setAAD(Buffer.from(snapshot.canonicalSnapshotJson({format:'cubers-media-vault-index-v1',region:j.region,installationId:j.installationId,journalKeyId:j.keyId,bundleId:id})));d.setAuthTag(Buffer.from(box.tag,'base64'));return JSON.parse(Buffer.concat([d.update(Buffer.from(box.ciphertext,'base64')),d.final()]).toString());}`;
    try {
      await docker(["network", "create", "--internal", network]);
      for (const v of volumes) await docker(["volume", "create", v]);
      await docker([
        "run",
        "--rm",
        "--network",
        "none",
        "--user",
        "0:0",
        ...mounts,
        "-v",
        `${volumes[4]}:/data`,
        recoveryImage,
        "node",
        "-e",
        "const fs=require('fs');for(const p of ['/snapshots','/journal','/keys','/data']){fs.chownSync(p,1000,1000);fs.chmodSync(p,0o700)}",
      ]);
      await docker([
        "run",
        "-d",
        "--name",
        pg,
        "--network",
        network,
        "-e",
        "POSTGRES_USER=fixture",
        "-e",
        "POSTGRES_PASSWORD=synthetic_only",
        "-e",
        "POSTGRES_DB=source",
        "-v",
        `${volumes[0]}:/var/lib/postgresql/data`,
        "postgres:17-bookworm",
      ]);
      for (let n = 0; ; n++) {
        try {
          await docker([
            "exec",
            pg,
            "pg_isready",
            "-h",
            "127.0.0.1",
            "-U",
            "fixture",
            "-d",
            "source",
          ]);
          break;
        } catch {
          if (n > 60) throw Error("Private fixture database unavailable");
          await new Promise((r) => setTimeout(r, 250));
        }
      }
      await docker(["exec", pg, "createdb", "-U", "fixture", "target"]);
      await docker([
        "run",
        "--rm",
        "--network",
        network,
        ...envArgs,
        migrationImage,
      ]);
      await docker([
        "run",
        "-d",
        "--name",
        storage,
        "--network",
        network,
        ...envArgs,
        "-e",
        "STORAGE_DIRECTORY=/data",
        "-v",
        `${volumes[4]}:/data`,
        storageImage,
      ]);
      const start = async () => {
        await docker([
          "run",
          "-d",
          "--name",
          op,
          "--network",
          network,
          ...mounts,
          ...envArgs,
          "--read-only",
          "--cap-drop",
          "ALL",
          "--security-opt",
          "no-new-privileges:true",
          "--tmpfs",
          "/work:rw,noexec,nosuid,size=16777216,uid=1000,gid=1000,mode=0700",
          "--tmpfs",
          "/recovery-tmp:rw,noexec,nosuid,size=134217728,uid=1000,gid=1000,mode=0700",
          recoveryImage,
          "node",
          "-e",
          "setInterval(()=>{},100000)",
        ]);
        for (const m of JSON.parse(
          await docker(["inspect", op, "--format", "{{json .Mounts}}"]),
        ))
          if (m.Type === "volume" && !volumes.includes(m.Name)) {
            assert.equal(m.Destination, "/var/lib/postgresql/data");
            anonymous.add(m.Name);
          }
      };
      await start();
      await js(
        `const fs=require('node:fs/promises'),{PrismaClient}=require('@prisma/client'),{FileDeletionJournal}=require('./apps/api/dist/deletion-journal'),{bindJournal}=require('./apps/api/dist/recovery');const db=new PrismaClient(),j=await FileDeletionJournal.initialize('/journal','/keys/journal.json',process.env.REGION);await bindJournal(db,j,process.env.DATABASE_URL);for(const p of ['/snapshots/vault','/keys/vault'])await fs.mkdir(p,{mode:0o700});await db.$disconnect();console.log('null');`,
      );
      await docker([
        "run",
        "--rm",
        "--network",
        "none",
        "--user",
        "1000:1000",
        "-v",
        volumes[1] + ":/one",
        "-v",
        volumes[1] + ":/two",
        "-v",
        volumes[2] + ":/journal",
        "-v",
        volumes[3] + ":/keys",
        recoveryImage,
        "node",
        "-e",
        "(async()=>{const a=require('assert/strict'),fs=require('fs/promises'),{FileDeletionJournal}=require('./apps/api/dist/deletion-journal'),{initializeMediaVault}=require('./apps/api/dist/media-vault');const j=await FileDeletionJournal.load('/journal','/keys/journal.json','" +
          region +
          "');await a.rejects(initializeMediaVault({directory:'/one',secretDirectory:'/two',masterKeyFile:'/keys/alias.json'},j));await a.rejects(fs.stat('/keys/alias.json'));})().catch(()=>{console.error('Private alias-separation check failed');process.exitCode=1})",
      ]);
      checks.push(
        "Distinct bind-mount paths to the same physical volume cannot collapse ciphertext/key separation; initialization refuses the inode alias",
      );
      const fixture =
        await js(`${base}const {S3Client,PutObjectCommand,ListBucketsCommand}=require('@aws-sdk/client-s3'),sharp=require('sharp'),s3=new S3Client({endpoint:config.S3_ENDPOINT,region:config.S3_REGION,forcePathStyle:true,credentials:{accessKeyId:config.S3_ACCESS_KEY,secretAccessKey:config.S3_SECRET_KEY}});for(let n=0;;n++){try{await s3.send(new ListBucketsCommand({}));break;}catch(e){if(n>30)throw e;await new Promise(r=>setTimeout(r,100));}}
    const parent=await db.user.create({data:{email:'parent@synthetic.invalid',displayName:'Synthetic parent',birthDate:'1990-01-01',region:config.REGION,passwordHash:'!disabled',emailVerified:true,adultVerified:true}}),child=await db.user.create({data:{email:'child@synthetic.invalid',displayName:'Synthetic child',birthDate:'2020-01-01',region:config.REGION,passwordHash:'!disabled',emailVerified:true}}),removed=await db.user.create({data:{email:'deleted@synthetic.invalid',displayName:'Synthetic removed',birthDate:'1990-01-01',region:config.REGION,passwordHash:'!disabled',emailVerified:true}}),png=await sharp({create:{width:2,height:2,channels:3,background:'#4782bc'}}).png().toBuffer(),clip=Buffer.from(${JSON.stringify(video)},'base64'),pdf=Buffer.from('JVBERi0xLjQKU1lOVEhFVElDIFBSSVZBVEUgQ09OU0VOVAolJUVPRg==','base64');
    async function media(owner,purpose,type,body,attach=true,createdAt=new Date(Date.now()-1000)){const id=crypto.randomUUID(),key=config.REGION+'/'+owner.id+'/'+id+'/clean';let attempt;if(purpose==='evidence'){const room=await db.room.create({data:{code:crypto.randomUUID(),ownerId:owner.id,puzzle:'3x3',input:'scan',mode:'race',ranked:true,private:true}});attempt=await db.attempt.create({data:{userId:owner.id,roomId:room.id,nonce:crypto.randomUUID(),scramble:[],status:'PROVISIONAL',createdAt:new Date(Date.now()-2*86400000),evidenceDeleteAt:new Date(Date.now()+5*86400000)}});}await db.media.create({data:{id,userId:owner.id,key,purpose,type,size:body.length,status:'READY',attemptId:attempt?.id,createdAt}});await s3.send(new PutObjectCommand({Bucket:config.S3_BUCKET,Key:key,Body:body,ContentType:type}));if(attempt)await db.attempt.update({where:{id:attempt.id},data:{evidenceId:id}});if(attach&&purpose==='post')await db.post.create({data:{authorId:owner.id,body:'Synthetic private backup fixture',mediaIds:[id],tags:[],status:'PENDING'}});return{id,key,attemptId:attempt?.id};}
    const keep=await media(parent,'post','image/png',png),erase=await media(parent,'post','image/png',png),postVideo=await media(parent,'post','video/mp4',clip),evidence=await media(parent,'evidence','video/mp4',clip),childEvidence=await media(child,'evidence','video/mp4',clip),document=await media(parent,'consent','application/pdf',pdf),deleted=await media(removed,'post','image/png',png);await db.consent.create({data:{childId:child.id,guardianId:parent.id,documentId:document.id,status:'APPROVED',recording:true,publicPosting:true}});await media(parent,'post','image/png',png,false,new Date(Date.now()-2*86400000));const rawId=crypto.randomUUID();await db.media.create({data:{id:rawId,userId:parent.id,key:config.REGION+'/'+parent.id+'/'+rawId+'/upload',purpose:'post',type:'image/png',size:png.length,status:'PENDING'}});await s3.send(new PutObjectCommand({Bucket:config.S3_BUCKET,Key:config.REGION+'/'+parent.id+'/'+rawId+'/upload',Body:png,ContentType:'image/png'}));await db.$disconnect();s3.destroy();console.log(JSON.stringify({parent:parent.id,child:child.id,removed:removed.id,keep,erase,postVideo,evidence,childEvidence,document,deleted}));`);
      async function request(operation: string, bundleId?: string) {
        const req = {
          operation,
          region,
          databaseHost: pg,
          databaseName: "source",
          directory: "/snapshots/vault",
          secretDirectory: "/keys/vault",
          masterKeyFile: "/keys/vault-master.json",
          ...(bundleId ? { bundleId } : {}),
          ...(operation === "capture" ? { maintenanceConfirmed: true } : {}),
          confirmation: {
            initialize: "INITIALIZE MEDIA VAULT",
            capture: "CAPTURE PRIVATE MEDIA BUNDLE",
            verify: "VERIFY PRIVATE MEDIA BUNDLE",
            prune: "PRUNE EXPIRED MEDIA KEYS",
          }[operation],
        };
        await js(
          `await require('node:fs/promises').writeFile('/work/request.json',JSON.stringify(${JSON.stringify(req)}),{mode:0o600});console.log('null');`,
        );
        return JSON.parse(
          await docker([
            "exec",
            op,
            "node",
            "apps/api/dist/media-vault-cli.js",
            "/work/request.json",
          ]),
        );
      }
      await request("initialize");
      const captured = await request("capture"),
        bundle = captured.bundleId;
      assert.equal(captured.objects, 7);
      assert.equal((await request("verify", bundle)).available, 7);
      checks.push(
        "One exported PostgreSQL snapshot drives the real encrypted dump and seven ready media objects: photos, silent post/evidence MP4 and a private consent PDF; raw and expired orphan uploads are excluded",
      );
      await js(
        `${base}${decode}const v=await index('${bundle}');assert.equal(v.objects.length,7);assert.equal(new Set(v.objects.map(e=>e.keyId)).size,7);const raw=await fs.readFile('/snapshots/vault/${bundle}/bundle.json','utf8');assert.equal(raw.includes(${JSON.stringify(fixture.parent)}),false);for(const e of v.objects){const bytes=await fs.readFile('/snapshots/vault/${bundle}/media/'+e.objectId+'.enc');assert.notEqual(bytes.subarray(0,5).toString(),'%PDF-');assert.notEqual(bytes.subarray(0,4).toString(),'ftyp');}await db.$disconnect();console.log('null');`,
      );
      checks.push(
        "Media and index ciphertext contain no plaintext identifiers or document/video signatures; every object uses a distinct independent data key outside the artifact root",
      );
      await docker(["rm", "-f", "-v", op]);
      await start();
      assert.equal((await request("verify", bundle)).available, 7);
      checks.push(
        "Independent private journal, artifact and key volumes survive operator recreation; compiled protected-file CLI verifies the capture",
      );
      await js(
        `${base}${decode}const v=await index('${bundle}'),e=v.objects.find(e=>e.mediaId===${JSON.stringify(fixture.keep.id)}),path='/snapshots/vault/${bundle}/media/'+e.objectId+'.enc',raw=await fs.readFile(path);await fs.writeFile('/work/original-cipher',raw,{mode:0o600});raw[2]^=1;await fs.writeFile(path,raw);await db.$disconnect();console.log('null');`,
      );
      await assert.rejects(request("verify", bundle));
      await js(
        `${base}${decode}const v=await index('${bundle}'),e=v.objects.find(e=>e.mediaId===${JSON.stringify(fixture.keep.id)});await fs.writeFile('/snapshots/vault/${bundle}/media/'+e.objectId+'.enc',await fs.readFile('/work/original-cipher'));await db.media.update({where:{id:${JSON.stringify(fixture.keep.id)}},data:{size:{increment:1}}});await db.$disconnect();console.log('null');`,
      );
      await assert.rejects(request("capture"));
      await js(
        `${base}await db.media.update({where:{id:${JSON.stringify(fixture.keep.id)}},data:{size:{decrement:1}}});assert.deepEqual(await fs.readdir(paths.directory),['${bundle}']);for(const name of await fs.readdir(paths.secretDirectory)){if(name==='${bundle}')continue;const c=JSON.parse(await fs.readFile(paths.secretDirectory+'/'+name+'/control.json','utf8'));assert.equal(c.status,'PURGED');await assert.rejects(fs.stat(paths.secretDirectory+'/'+name+'/database.json'));}await db.$disconnect();console.log('null');`,
      );
      checks.push(
        "Changed ciphertext fails authentication; a producer size mismatch cannot publish a partial bundle and its per-bundle/media keys are removed",
      );
      await js(
        `${base}await j.appendMedia(${JSON.stringify(fixture.parent)},{kind:'MEDIA_ERASE',mediaId:${JSON.stringify(fixture.erase.id)},key:${JSON.stringify(fixture.erase.key)}});await j.append([${JSON.stringify(fixture.removed)}]);await j.appendMedia(${JSON.stringify(fixture.child)},{kind:'CONSENT_WITHDRAWAL',cutoff:new Date().toISOString()});const a=await db.attempt.findUniqueOrThrow({where:{id:${JSON.stringify(fixture.evidence.attemptId)}}});await j.appendMedia(${JSON.stringify(fixture.parent)},{kind:'EVIDENCE_DEADLINE',mediaId:${JSON.stringify(fixture.evidence.id)},attemptId:a.id,attemptCreatedAt:a.createdAt.toISOString(),deadline:new Date(a.createdAt.getTime()+30*86400000).toISOString()});await db.$disconnect();console.log('null');`,
      );
      await js(
        `${base}const path=paths.directory+'/${bundle}/bundle.json',raw=await fs.readFile(path);await fs.writeFile('/work/original-index',raw,{mode:0o600});const box=JSON.parse(raw.toString()),bytes=Buffer.from(box.ciphertext,'base64');bytes[3]^=1;box.ciphertext=bytes.toString('base64');await fs.writeFile(path,JSON.stringify(box));await db.$disconnect();console.log('null');`,
      );
      await assert.rejects(request("verify", bundle));
      const pruned = await request("prune", bundle);
      await js(
        `${base}await fs.writeFile(paths.directory+'/${bundle}/bundle.json',await fs.readFile('/work/original-index'));await db.$disconnect();console.log('null');`,
      );
      checks.push(
        "Authenticated per-file key records enforce privacy erasure even when the artifact index is damaged; restoring the original index does not revive purged files",
      );

      assert.equal(pruned.objects, 3);
      assert.equal((await request("verify", bundle)).available, 4);
      checks.push(
        "Real-time file erasure, account deletion and guardian withdrawal destroy the three exact media keys/ciphertexts; unrelated photo/video/document copies remain verifiable",
      );
      await js(
        `${base}${decode}const v=await index('${bundle}'),e=v.objects.find(e=>e.mediaId===${JSON.stringify(fixture.evidence.id)}),now=Date.parse(e.initialDeadline)+1;await vault.pruneMediaVault(paths,j,'${bundle}',now);await fs.stat(paths.secretDirectory+'/${bundle}/media/'+e.objectId+'.json');assert.equal((await vault.verifyMediaVault(paths,j,'${bundle}',now)).available,4);const targetConfig={...config,DATABASE_URL:config.DATABASE_URL.replace('/source?','/target?')};await snapshot.restoreSealedDatabase(targetConfig,paths.directory+'/${bundle}/database/'+v.databaseId,paths.secretDirectory+'/${bundle}/database.json',j,'/recovery-tmp');const target=new PrismaClient({datasourceUrl:targetConfig.DATABASE_URL});assert.equal((await target.recoveryBinding.findUniqueOrThrow({where:{id:'installation'}})).state,'SEALED');assert.equal(await target.media.count(),9);assert.equal((await target.media.findUniqueOrThrow({where:{id:${JSON.stringify(fixture.keep.id)}}})).size,v.objects.find(e=>e.mediaId===${JSON.stringify(fixture.keep.id)}).size);await target.$disconnect();await db.$disconnect();console.log('null');`,
      );
      checks.push(
        "A newer valid appeal preserves evidence through the original seven-day backup deadline, bounded by its hard limit; the matching real database dump restores separately and stays sealed",
      );
      await js(
        `${base}${decode}const v=await index('${bundle}'),e=v.objects.find(e=>e.mediaId===${JSON.stringify(fixture.postVideo.id)}),path=paths.secretDirectory+'/${bundle}/media/'+e.objectId+'.json',key=JSON.parse(await fs.readFile(path,'utf8'));key.entry.initialDeadline=new Date(Date.parse(e.hardExpiresAt)+1000).toISOString();await fs.writeFile(path,JSON.stringify(key));await db.$disconnect();console.log('null');`,
      );
      await assert.rejects(request("verify", bundle));
      await request("prune", bundle);
      assert.equal((await request("verify", bundle)).available, 3);
      checks.push(
        "A tampered key-expiry record cannot extend retention: verification refuses it and pruning irreversibly removes that exact corrupt copy",
      );
      const restoreBucket = `cubers-restored-${region.toLowerCase()}-${id}`;
      const restoreBase = `${base}const targetConfig={...config,DATABASE_URL:config.DATABASE_URL.replace('/source?','/target?'),S3_BUCKET:'${restoreBucket}'},target=new PrismaClient({datasourceUrl:targetConfig.DATABASE_URL}),restoreOptions={temporaryDirectory:'/recovery-tmp',isolatedTarget:true},s3lib=require('@aws-sdk/client-s3'),s3=new s3lib.S3Client({endpoint:config.S3_ENDPOINT,region:config.S3_REGION,forcePathStyle:true,credentials:{accessKeyId:config.S3_ACCESS_KEY,secretAccessKey:config.S3_SECRET_KEY}});`;
      await js(
        `${restoreBase}await s3.send(new s3lib.CreateBucketCommand({Bucket:'${restoreBucket}'}));await assert.rejects(vault.restoreMediaVault(config,paths,j,'${bundle}',restoreOptions));await assert.rejects(vault.restoreMediaVault({...targetConfig,S3_BUCKET:config.S3_BUCKET},paths,j,'${bundle}',restoreOptions));await assert.rejects(vault.restoreMediaVault(targetConfig,paths,j,'${bundle}',{...restoreOptions,temporaryDirectory:'/snapshots'}));const binding=await target.recoveryBinding.findUniqueOrThrow({where:{id:'installation'}});await target.recoveryBinding.update({where:{id:'installation'},data:{restoredSnapshotId:crypto.randomUUID()}});await assert.rejects(vault.restoreMediaVault(targetConfig,paths,j,'${bundle}',restoreOptions));await target.recoveryBinding.update({where:{id:'installation'},data:{restoredSnapshotId:binding.restoredSnapshotId}});await s3.send(new s3lib.PutObjectCommand({Bucket:'${restoreBucket}',Key:'foreign',Body:'preserve me'}));await assert.rejects(vault.restoreMediaVault(targetConfig,paths,j,'${bundle}',restoreOptions));assert.equal(await target.mediaRestoreBatch.count(),0);assert.equal((await s3.send(new s3lib.GetObjectCommand({Bucket:'${restoreBucket}',Key:'foreign'}))).ContentLength,11);await s3.send(new s3lib.DeleteObjectCommand({Bucket:'${restoreBucket}',Key:'foreign'}));await target.$disconnect();await db.$disconnect();s3.destroy();console.log('null');`,
      );
      checks.push(
        "Sealed media restore rejects the source database/bucket, ordinary disk staging, a mismatched snapshot and a nonempty target without adopting or overwriting foreign data",
      );
      await js(
        `${restoreBase}let interrupted=false;const send=s3lib.S3Client.prototype.send;s3lib.S3Client.prototype.send=async function(command,...args){const result=await send.call(this,command,...args);if(command instanceof s3lib.PutObjectCommand&&command.input.Bucket==='${restoreBucket}'&&!interrupted){interrupted=true;throw Error('Synthetic accepted-write connection loss');}return result;};try{await assert.rejects(vault.restoreMediaVault(targetConfig,paths,j,'${bundle}',restoreOptions));assert.ok(interrupted);}finally{s3lib.S3Client.prototype.send=send;}const batch=await target.mediaRestoreBatch.findUniqueOrThrow({where:{bucket:'${restoreBucket}'}});assert.equal(batch.status,'INCOMPLETE');assert.equal(await target.mediaRestoreFile.count({where:{batchId:batch.id}}),7);assert.equal(await target.media.count({where:{status:'READY'}}),0);assert.equal((await fs.readdir('/recovery-tmp')).length,0);assert.equal((await s3.send(new s3lib.ListObjectsV2Command({Bucket:'${restoreBucket}'}))).Contents.length,1);await target.$disconnect();await db.$disconnect();s3.destroy();console.log('null');`,
      );
      checks.push(
        "A successful S3 write followed by a lost response leaves durable pending ownership and quarantined rows, no plaintext staging, and an incomplete sealed batch",
      );
      await docker(["rm", "-f", "-v", op]);
      await start();
      const restored = await js(
        `${restoreBase}const r=await vault.restoreMediaVault(targetConfig,paths,j,'${bundle}',restoreOptions);assert.equal(r.written,3);assert.equal(r.excluded,4);const objects=(await s3.send(new s3lib.ListObjectsV2Command({Bucket:'${restoreBucket}'}))).Contents;assert.equal(objects.length,3);assert.equal((await target.recoveryBinding.findUniqueOrThrow({where:{id:'installation'}})).state,'SEALED');assert.equal(await target.media.count({where:{status:'READY'}}),0);assert.equal(await target.mediaRestoreFile.count({where:{status:'WRITTEN'}}),3);assert.equal(await target.media.count({where:{status:'RECOVERY_QUARANTINED'}}),3);assert.ok(await target.media.count({where:{status:'RECOVERY_EXCLUDED'}})>=3);assert.equal((await fs.readdir('/recovery-tmp')).length,0);await target.$disconnect();await db.$disconnect();s3.destroy();console.log(JSON.stringify(r));`,
      );
      assert.equal(restored.status, "media-restored-sealed");
      await js(
        `${restoreBase}const request={operation:'restore-sealed',region:config.REGION,databaseHost:new URL(targetConfig.DATABASE_URL).hostname,databaseName:'target',...paths,bundleId:'${bundle}',temporaryDirectory:'/recovery-tmp',isolatedTarget:true,maintenanceConfirmed:true,confirmation:'RESTORE MEDIA TO SEALED ISOLATED TARGET'};await fs.writeFile('/work/restore-request.json',JSON.stringify(request),{mode:0o600});const result=JSON.parse(require('node:child_process').execFileSync(process.execPath,['apps/api/dist/media-vault-cli.js','/work/restore-request.json'],{encoding:'utf8',env:{...process.env,DATABASE_URL:targetConfig.DATABASE_URL,S3_BUCKET:targetConfig.S3_BUCKET}}));assert.equal(result.status,'media-restored-sealed');assert.equal(result.written,3);await target.$disconnect();await db.$disconnect();s3.destroy();console.log('null');`,
      );

      async function startMaintenance(
        scope: "backups" | "target",
        bucket: string,
      ) {
        const req = {
          region,
          scope,
          databaseHost: pg,
          databaseName: scope === "target" ? "target" : "source",
          ...{
            directory: "/snapshots/vault",
            secretDirectory: "/keys/vault",
            masterKeyFile: "/keys/vault-master.json",
          },
          intervalSeconds: 30,
          ...(scope === "target" ? { isolatedTarget: true } : {}),
          confirmation: "RUN REGIONAL MEDIA EXPIRY",
        };
        await js(
          `await require('node:fs/promises').writeFile('/keys/maintenance-request.json',JSON.stringify(${JSON.stringify(req)}),{mode:0o600});console.log('null');`,
        );
        await docker([
          "run",
          "-d",
          "--name",
          maintenance,
          "--network",
          network,
          ...mounts,
          ...envArgs,
          "-e",
          "DATABASE_URL=" +
            env.DATABASE_URL.replace(
              "/source?",
              scope === "target" ? "/target?" : "/source?",
            ),
          "-e",
          "S3_BUCKET=" + bucket,
          "--read-only",
          "--cap-drop",
          "ALL",
          "--security-opt",
          "no-new-privileges:true",
          "--tmpfs",
          "/maintenance-health:rw,noexec,nosuid,size=1048576,uid=1000,gid=1000,mode=0700",
          "--tmpfs",
          "/var/lib/postgresql/data:rw,noexec,nosuid,size=1048576,uid=1000,gid=1000,mode=0700",
          recoveryImage,
          "node",
          "apps/api/dist/media-maintenance-cli.js",
          "daemon",
          "/keys/maintenance-request.json",
        ]);
      }
      async function waitMaintenance(phase: "healthy" | "degraded") {
        for (let n = 0; n < 225; n++) {
          try {
            const state = JSON.parse(
              await docker([
                "exec",
                maintenance,
                "node",
                "-e",
                "console.log(require('fs').readFileSync('/maintenance-health/status.json','utf8'))",
              ]),
            );
            if (state.phase === phase) {
              assert.equal(
                JSON.parse(
                  await docker([
                    "inspect",
                    maintenance,
                    "--format",
                    "{{json .State.Running}}",
                  ]),
                ),
                true,
              );
              if (phase === "healthy")
                assert.equal(
                  JSON.parse(
                    await docker([
                      "exec",
                      maintenance,
                      "node",
                      "apps/api/dist/media-maintenance-cli.js",
                      "health",
                      "/maintenance-health",
                    ]),
                  ).status,
                  "healthy",
                );
              else
                await assert.rejects(
                  docker([
                    "exec",
                    maintenance,
                    "node",
                    "apps/api/dist/media-maintenance-cli.js",
                    "health",
                    "/maintenance-health",
                  ]),
                );
              return state;
            }
          } catch {}
          await new Promise((r) => setTimeout(r, 200));
        }
        throw Error(
          "Synthetic maintenance worker did not reach expected phase",
        );
      }
      async function stopMaintenance() {
        await docker(["stop", "--time", "5", maintenance]);
        assert.equal(await docker(["wait", maintenance]), "0");
        await docker(["rm", "-v", maintenance]);
      }
      await startMaintenance("backups", env.S3_BUCKET);
      assert.equal((await waitMaintenance("healthy")).scope, "backups");
      await stopMaintenance();
      await docker(["network", "disconnect", network, storage]);
      try {
        await startMaintenance("target", restoreBucket);
        assert.ok((await waitMaintenance("degraded")).failures > 0);
      } finally {
        await docker(["network", "connect", network, storage]);
      }
      assert.equal((await waitMaintenance("healthy")).failures, 0);
      await stopMaintenance();
      console.log(`${region}: maintenance outage/retry passed`);
      checks.push(
        "Compiled recurring maintenance runs without an API, reports an actual storage disconnection as unhealthy, retries automatically after reconnect, and stops cleanly; backup expiry has its own healthy worker",
      );
      checks.push(
        "Operator recreation and the compiled protected-file CLI resume a partially written batch by authenticating its owned object and restores exactly three eligible photo/evidence/document files, all quarantined with the database still sealed",
      );
      await js(
        `${restoreBase}const e=await target.media.findUniqueOrThrow({where:{id:${JSON.stringify(fixture.keep.id)}}}),raw=await s3.send(new s3lib.GetObjectCommand({Bucket:'${restoreBucket}',Key:e.key})),bytes=await raw.Body.transformToByteArray(),meta=raw.Metadata;await s3.send(new s3lib.PutObjectCommand({Bucket:'${restoreBucket}',Key:e.key,Body:bytes,ContentType:e.type,Metadata:{...meta,'cubers-batch':crypto.randomUUID()}}));await assert.rejects(vault.restoreMediaVault(targetConfig,paths,j,'${bundle}',restoreOptions));const kept=await s3.send(new s3lib.GetObjectCommand({Bucket:'${restoreBucket}',Key:e.key}));assert.notEqual(kept.Metadata['cubers-batch'],meta['cubers-batch']);await s3.send(new s3lib.PutObjectCommand({Bucket:'${restoreBucket}',Key:e.key,Body:bytes,ContentType:e.type,Metadata:meta}));await j.appendMedia(e.userId,{kind:'MEDIA_ERASE',mediaId:e.id,key:e.key});const result=await vault.restoreMediaVault(targetConfig,paths,j,'${bundle}',restoreOptions);assert.equal(result.written,2);assert.equal(result.excluded,5);assert.equal((await s3.send(new s3lib.ListObjectsV2Command({Bucket:'${restoreBucket}'}))).Contents.length,2);const {reconcileDeletionJournal}=require('./apps/api/dist/recovery');await target.recoveryBinding.update({where:{id:'installation'},data:{state:'ACTIVE'}});await assert.rejects(reconcileDeletionJournal(target,{...targetConfig,DELETION_JOURNAL_MODE:'disabled'}),/sealed/);await target.recoveryBinding.update({where:{id:'installation'},data:{state:'SEALED'}});await target.$disconnect();await db.$disconnect();s3.destroy();console.log('null');`,
      );
      checks.push(
        "Resume refuses changed ownership without overwriting it; a newer file erasure removes only that restored copy, and changing the state flag cannot bypass the restored-snapshot startup seal",
      );
      const raceBucket = `${restoreBucket}-race`;
      await js(
        `${restoreBase}await s3.send(new s3lib.CreateBucketCommand({Bucket:'${raceBucket}'}));let accepted=false;const send=s3lib.S3Client.prototype.send;s3lib.S3Client.prototype.send=async function(command,...args){if(command instanceof s3lib.PutObjectCommand&&command.input.Bucket==='${raceBucket}'){assert.equal(command.input.IfNoneMatch,'*');assert.ok(command.input.ChecksumSHA256);}const result=await send.call(this,command,...args);if(command instanceof s3lib.PutObjectCommand&&command.input.Bucket==='${raceBucket}'&&command.input.Key===${JSON.stringify(fixture.document.key)}&&!accepted){accepted=true;await j.appendMedia(${JSON.stringify(fixture.parent)},{kind:'MEDIA_ERASE',mediaId:${JSON.stringify(fixture.document.id)},key:${JSON.stringify(fixture.document.key)}});}return result;};try{const result=await vault.restoreMediaVault({...targetConfig,S3_BUCKET:'${raceBucket}'},paths,j,'${bundle}',restoreOptions);assert.ok(accepted);assert.equal(result.written,1);assert.equal(result.excluded,6);assert.equal((await s3.send(new s3lib.ListObjectsV2Command({Bucket:'${raceBucket}'}))).Contents.length,1);}finally{s3lib.S3Client.prototype.send=send;}assert.equal((await vault.restoreMediaVault(targetConfig,paths,j,'${bundle}',restoreOptions)).written,1);await target.$disconnect();await db.$disconnect();s3.destroy();console.log('null');`,
      );
      checks.push(
        "Privacy erasure accepted immediately after a real PUT removes that document before batch acceptance, preserves unrelated evidence and reconciles the previously staged bucket; uploads carry conditional creation and the verified SHA-256 checksum",
      );
      const custodyBucket = `${restoreBucket}-custody`;
      await js(
        `${restoreBase}await s3.send(new s3lib.CreateBucketCommand({Bucket:'${custodyBucket}'}));const result=await vault.restoreMediaVault({...targetConfig,S3_BUCKET:'${custodyBucket}'},paths,j,'${bundle}',restoreOptions);assert.equal(result.written,1);const path=paths.secretDirectory+'/${bundle}/restores/'+result.batchId+'/inventory.json',raw=await fs.readFile(path),bad=JSON.parse(raw);bad.expiresAt=new Date(Date.now()+365*86400000).toISOString();await fs.writeFile(path,JSON.stringify(bad));assert.ok((await vault.sweepMediaVault({...targetConfig,S3_BUCKET:'${custodyBucket}'},paths,j,'target')).failures>0);assert.equal((await s3.send(new s3lib.ListObjectsV2Command({Bucket:'${custodyBucket}'}))).Contents.length,1);await fs.writeFile(path,raw);await target.mediaRestoreFile.updateMany({where:{batchId:result.batchId},data:{expiresAt:new Date(Date.now()+365*86400000)}});await target.$disconnect();await db.$disconnect();s3.destroy();console.log('null');`,
      );
      checks.push(
        "Independent target custody rejects a changed retention inventory without deleting unrelated objects; mutable restored database deadlines cannot extend the signed limits",
      );
      await js(
        `${base}await fs.copyFile(paths.secretDirectory+'/${bundle}/control.json','/keys/held-retirement-control.json');await fs.copyFile(paths.secretDirectory+'/${bundle}/database.json','/keys/held-retirement-database.json');await fs.cp(paths.directory+'/${bundle}','/snapshots/held-retirement-ciphertext',{recursive:true});await db.$disconnect();console.log('null');`,
      );
      await js(
        `${base}${decode}const v=await index('${bundle}'),e=v.objects.find(e=>e.mediaId===${JSON.stringify(fixture.evidence.id)});await j.appendMedia(e.userId,{kind:'MEDIA_ERASE',mediaId:e.mediaId,key:e.key});await vault.pruneMediaVault(paths,j,'${bundle}');await assert.rejects(fs.stat(paths.secretDirectory+'/${bundle}/media/'+e.objectId+'.json'));await assert.rejects(fs.stat(paths.directory+'/${bundle}/media/'+e.objectId+'.enc'));const c=JSON.parse(await fs.readFile(paths.secretDirectory+'/${bundle}/control.json','utf8'));assert.ok(c.purged.includes(e.objectId));const restoredConfig={...config,DATABASE_URL:config.DATABASE_URL.replace('/source?','/target?'),S3_BUCKET:'${restoreBucket}'};assert.equal((await vault.restoreMediaVault(restoredConfig,paths,j,'${bundle}',{temporaryDirectory:'/recovery-tmp',isolatedTarget:true})).written,0);assert.equal((await vault.restoreMediaVault({...restoredConfig,S3_BUCKET:'${raceBucket}'},paths,j,'${bundle}',{temporaryDirectory:'/recovery-tmp',isolatedTarget:true})).written,0);await vault.pruneMediaVault(paths,j,'${bundle}',Date.parse(v.expiresAt)+1);await assert.rejects(fs.stat(paths.secretDirectory+'/${bundle}/database.json'));await assert.rejects(fs.stat(paths.directory+'/${bundle}'));await assert.rejects(vault.verifyMediaVault(paths,j,'${bundle}'));await db.$disconnect();console.log('null');`,
      );
      await js(
        `${restoreBase}const cfg={...targetConfig,S3_BUCKET:'${custodyBucket}'},batch=await target.mediaRestoreBatch.findUniqueOrThrow({where:{bucket:cfg.S3_BUCKET}}),records=[];for await(const r of j.records())records.push(r);const last=records[records.length-1],recordPath='/journal/'+last.id+'.journal';await fs.rename(recordPath,'/journal/.held-maintenance-record');let denied=false;const send=s3lib.S3Client.prototype.send;s3lib.S3Client.prototype.send=async function(command,...args){if(command instanceof s3lib.DeleteObjectCommand&&command.input.Bucket===cfg.S3_BUCKET&&!denied){denied=true;throw Error('Synthetic deletion storage outage');}return send.call(this,command,...args);};try{const first=await vault.sweepMediaVault(cfg,paths,j,'target');assert.ok(first.failures>0);assert.ok(denied);}finally{s3lib.S3Client.prototype.send=send;}const state=JSON.parse(await fs.readFile(paths.secretDirectory+'/${bundle}/restores/'+batch.id+'/state.json','utf8'));assert.equal(state.purged.length,7);assert.equal((await s3.send(new s3lib.ListObjectsV2Command({Bucket:cfg.S3_BUCKET}))).Contents.length,1);await target.mediaRestoreFile.deleteMany({where:{batchId:batch.id}});const result=await vault.sweepMediaVault(cfg,paths,j,'target');assert.equal(result.failures,0);assert.equal(((await s3.send(new s3lib.ListObjectsV2Command({Bucket:cfg.S3_BUCKET}))).Contents||[]).length,0);assert.equal((await target.mediaRestoreBatch.findUniqueOrThrow({where:{id:batch.id}})).status,'PRUNED');assert.equal((await vault.sweepMediaVault(config,paths,j,'backups',Date.now()+31*86400000)).failures,0);await fs.rename('/journal/.held-maintenance-record',recordPath);await target.$disconnect();await db.$disconnect();s3.destroy();console.log('null');`,
      );
      checks.push(
        "After every backup key and ciphertext is gone, signed target custody still deletes the exact remaining copy; deletion outages retain terminal decisions for retry, missing database file rows cannot lose cleanup, and hard-expiry cleanup survives an unreadable current journal record",
      );
      await js(`${restoreBase}
        const deadline=Date.now()+31*86400000,cfg={...targetConfig,S3_BUCKET:'${restoreBucket}'},batch=await target.mediaRestoreBatch.findUniqueOrThrow({where:{bucket:cfg.S3_BUCKET},include:{files:true}}),folder=paths.secretDirectory+'/${bundle}/restores/'+batch.id,inventory=await fs.readFile(folder+'/inventory.json'),state=await fs.readFile(folder+'/state.json');
        await s3.send(new s3lib.PutObjectCommand({Bucket:cfg.S3_BUCKET,Key:'synthetic-unrelated-metadata',Body:'preserve'}));assert.ok((await vault.sweepMediaVault(cfg,paths,j,'target',deadline)).failures>0);assert.equal(await fs.readFile(folder+'/inventory.json','utf8'),inventory.toString());assert.equal((await s3.send(new s3lib.GetObjectCommand({Bucket:cfg.S3_BUCKET,Key:'synthetic-unrelated-metadata'}))).ContentLength,8);await s3.send(new s3lib.DeleteObjectCommand({Bucket:cfg.S3_BUCKET,Key:'synthetic-unrelated-metadata'}));
        const originalSend=s3lib.S3Client.prototype.send;let denied=false;s3lib.S3Client.prototype.send=async function(command,...args){if(command instanceof s3lib.ListObjectsV2Command&&command.input.Bucket===cfg.S3_BUCKET&&!denied){denied=true;throw Error('Synthetic empty-target probe outage');}return originalSend.call(this,command,...args);};try{assert.ok((await vault.sweepMediaVault(cfg,paths,j,'target',deadline)).failures>0);assert.ok(denied);await assert.rejects(fs.stat(folder+'/retired.json'));}finally{s3lib.S3Client.prototype.send=originalSend;}
        assert.equal((await vault.sweepMediaVault(cfg,paths,j,'target',deadline)).failures,0);assert.deepEqual(await fs.readdir(folder),['retired.json']);assert.equal(await target.mediaRestoreBatch.count({where:{id:batch.id}}),0);assert.equal(await target.mediaRestoreFile.count({where:{batchId:batch.id}}),0);const terminal=JSON.parse(await fs.readFile(folder+'/retired.json','utf8'));assert.equal(terminal.objects,7);assert.equal(Object.hasOwn(terminal,'userId'),false);assert.equal(Object.hasOwn(terminal,'key'),false);
        const {files,...row}=batch;await target.mediaRestoreBatch.create({data:row});if(files.length)await target.mediaRestoreFile.createMany({data:files});await fs.writeFile(folder+'/inventory.json',inventory,{mode:0o600});await fs.writeFile(folder+'/state.json',state,{mode:0o600});assert.equal((await vault.sweepMediaVault(cfg,paths,j,'target',deadline)).failures,0);assert.deepEqual(await fs.readdir(folder),['retired.json']);assert.equal(await target.mediaRestoreBatch.count({where:{id:batch.id}}),0);assert.equal(await target.mediaRestoreFile.count({where:{batchId:batch.id}}),0);
        await vault.pruneMediaVault(paths,j,'${bundle}',deadline);assert.equal(JSON.parse(await fs.readFile(paths.secretDirectory+'/${bundle}/control.json','utf8')).version,2);
        await fs.writeFile(folder+'/retired.json',JSON.stringify({...terminal,objects:8}));assert.ok((await vault.sweepMediaVault(cfg,paths,j,'target',deadline)).failures>0);await assert.rejects(vault.pruneMediaVault(paths,j,'${bundle}',deadline));await fs.writeFile(folder+'/retired.json',JSON.stringify(terminal));
        for(const bucket of ['${raceBucket}','${custodyBucket}'])assert.equal((await vault.sweepMediaVault({...targetConfig,S3_BUCKET:bucket},paths,j,'target',deadline)).failures,0);
        await vault.pruneMediaVault(paths,j,'${bundle}',deadline);const compact=JSON.parse(await fs.readFile(paths.secretDirectory+'/${bundle}/control.json','utf8'));assert.equal(compact.version,3);assert.deepEqual(compact.purged,[]);for(const name of ['objects','journal','indexDigest'])assert.equal(Object.hasOwn(compact,name),false);assert.equal(await target.mediaRestoreFile.count(),0);assert.equal(await target.mediaRestoreBatch.count(),0);
        await fs.copyFile('/keys/held-retirement-control.json',paths.secretDirectory+'/${bundle}/control.json');await fs.copyFile('/keys/held-retirement-database.json',paths.secretDirectory+'/${bundle}/database.json');await fs.cp('/snapshots/held-retirement-ciphertext',paths.directory+'/${bundle}',{recursive:true});await assert.rejects(vault.restoreMediaVault(cfg,paths,j,'${bundle}',restoreOptions),/terminally retired custody/);assert.equal(await target.mediaRestoreBatch.count(),0);await vault.pruneMediaVault(paths,j,'${bundle}',deadline);assert.equal(JSON.parse(await fs.readFile(paths.secretDirectory+'/${bundle}/control.json','utf8')).version,3);
        assert.equal((await target.recoveryBinding.findUniqueOrThrow({where:{id:'installation'}})).state,'SEALED');await target.$disconnect();await db.$disconnect();s3.destroy();console.log('null');`);
      checks.push(
        "Target inventory retirement requires a verified empty isolated bucket; unrelated objects and storage outages preserve private custody for retry",
      );
      checks.push(
        "Signed minimal terminal receipts precede cascading restore-row and per-file inventory removal, survive stale metadata replay, and reject changed signatures",
      );
      checks.push(
        "Expired source controls drop per-object references only after all targets finish; retained terminal receipts reject a replayed live index/control/key before creating a new restore batch",
      );
      checks.push(
        "Terminal erasure removes evidence keys and ciphertext; 30-day bundle expiry removes the independent database/index key and complete artifact tree, so the surviving master cannot reopen the bundle",
      );
      report.regions.push({
        region,
        checks,
        objects: captured.objects,
        bytes: captured.bytes,
      });
      console.log(
        `${region}: ${checks.length} encrypted media-vault groups passed`,
      );
    } finally {
      for (const c of [maintenance, op, storage, pg])
        await docker(["rm", "-f", "-v", c]).catch(() => {});
      for (const v of volumes)
        await docker(["volume", "rm", v]).catch(() => {});
      await docker(["network", "rm", network]).catch(() => {});
    }
  }
  for (const volume of anonymous)
    await assert.rejects(docker(["volume", "inspect", volume]));
  for (const command of [
    ["ps", "-aq", "--filter", `name=${prefix}`],
    ["volume", "ls", "-q", "--filter", `name=${prefix}`],
    ["network", "ls", "-q", "--filter", `name=${prefix}`],
  ])
    assert.equal(await docker(command), "");
  report.completedAt = new Date().toISOString();
  report.remainingResources = { containers: 0, volumes: 0, networks: 0 };
  report.anonymousVolumesRemoved = anonymous.size;
  await writeFile(join(root, "report.json"), JSON.stringify(report, null, 2), {
    mode: 0o600,
  });
  console.log(
    `Encrypted media-vault drill ${id} complete; no disposable resources remain`,
  );
}
void main().catch(async (e) => {
  report.failed = true;
  await writeFile(
    join(root, "failure.log"),
    String(e.stack || e) + "\n" + String(e.stderr || ""),
    { mode: 0o600 },
  ).catch(() => {});
  await writeFile(join(root, "report.json"), JSON.stringify(report, null, 2), {
    mode: 0o600,
  }).catch(() => {});
  console.error(
    "Encrypted media-vault drill failed; inspect private synthetic diagnostics.",
  );
  process.exitCode = 1;
});
