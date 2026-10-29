// Real isolated pg_dump/pg_restore drill. Synthetic records only; no exposed ports.
import assert from "node:assert/strict";
import { deviceTestFixture } from "../tests/helpers/device-test-fixture";
import {
  lessons,
  SmartLessonContext,
  smartLessonReference,
} from "@cubers/core";
import { WcaScrambles } from "../apps/api/src/wca-scrambles";
import { execFile as callback } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
const exec = promisify(callback),
  id = randomUUID().slice(0, 8),
  prefix = `cubers-recovery-${id}`;
const report: any = {
  id,
  startedAt: new Date().toISOString(),
  regions: [],
  caveats: [
    "Synthetic local Docker storage, not regional off-host custody or production durability",
    "Database-only snapshots with retired-history floor checks; all restores remain sealed and service commissioning is unfinished",
    "No HTTP, SMTP, real AI, public ingress or existing database targeted",
  ],
};
const root = resolve(".data/recovery-drill", id);
const recoveryImage =
  process.env.CUBERS_RECOVERY_IMAGE || "cubers-recovery:development";
const migrationImage =
  process.env.CUBERS_RECOVERY_MIGRATIONS_IMAGE ||
  "cubers-recovery-migrations:development";
const anonymousVolumes = new Set<string>();
async function docker(args: string[]) {
  return (
    await exec("docker", args, { timeout: 300000, maxBuffer: 4 * 1024 * 1024 })
  ).stdout.trim();
}
async function main() {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const generator = new WcaScrambles({ SCRAMBLE_TIMEOUT_MS: 30000 });
  let generated: Awaited<ReturnType<WcaScrambles["generate"]>>;
  try {
    generated = await generator.generate("3x3");
  } finally {
    await generator.close();
  }
  const wcaMoves = generated.scrambles[0],
    wcaSource = generated.source;
  const alternateLesson = lessons.find(
    (row) => row.caseFamily === "PLL" && row.alternatives?.length,
  )!;
  const smartLesson = lessons.find(
    (row) => row.caseFamily === "OLL" && row.alternatives?.length,
  )!;
  const smartContext = SmartLessonContext.parse({
    model: "gan-356-i3",
    platform: "ios",
    reference: smartLessonReference(smartLesson),
    epoch: randomUUID(),
    nextSequence: 3,
    counter: 253,
    recoveryRun: 0,
    lastTime: 102,
    independentState: false,
    continuity: "counter",
  });
  report.images = JSON.parse(
    await docker(["image", "inspect", recoveryImage, migrationImage]),
  ).map((i: any) => ({ id: i.Id, os: i.Os, architecture: i.Architecture }));
  for (const region of ["INTL", "CN"]) {
    const name = `${prefix}-${region.toLowerCase()}`,
      network = `${name}-private`,
      pg = `${name}-pg`,
      op = `${name}-operator`,
      volumes = ["db", "snapshots", "journal", "keys"].map(
        (s) => `${name}-${s}`,
      );
    const mounts = volumes
      .slice(1)
      .flatMap((v, i) => [
        "-v",
        `${v}:/${["snapshots", "journal", "keys"][i]}`,
      ]);
    const env = {
      NODE_ENV: "test",
      REGION: region,
      DATABASE_URL: `postgresql://fixture:synthetic_only@${pg}/source?sslmode=disable`,
      REDIS_URL: "redis://unavailable:6379",
      AI_MODE: "disabled",
      AI_API_KEY: "",
      OPENAI_API_KEY: "",
      QWEN_API_KEY: "",
      SMTP_URL: "",
      S3_ENDPOINT: "http://unavailable:9000",
      S3_BUCKET: "synthetic-only",
      S3_ACCESS_KEY: "synthetic-only",
      S3_SECRET_KEY: "synthetic-only",
      DELETION_JOURNAL_MODE: "file",
      DELETION_JOURNAL_DIRECTORY: "/journal",
      DELETION_JOURNAL_KEY_FILE: "/keys/journal.json",
    };
    const envArgs = Object.entries(env).flatMap(([k, v]) => [
      "-e",
      `${k}=${v}`,
    ]);
    const checks: string[] = [];
    async function js(code: string) {
      return JSON.parse(
        (await docker([
          "exec",
          op,
          "node",
          "-e",
          `(async()=>{${code}})().catch(()=>{console.error('Private drill operation failed');process.exitCode=1})`,
        ])) || "null",
      );
    }
    const base = `const assert=require('node:assert/strict'),fs=require('node:fs/promises'),{PrismaClient}=require('@prisma/client'),{readConfig}=require('./apps/api/dist/config'),{FileDeletionJournal}=require('./apps/api/dist/deletion-journal'),snapshot=require('./apps/api/dist/database-snapshot'); const source=new PrismaClient(), target=new PrismaClient({datasourceUrl:process.env.DATABASE_URL.replace('/source?','/target?')}), journal=await FileDeletionJournal.load('/journal','/keys/journal.json',process.env.REGION);`;
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
        recoveryImage,
        "node",
        "-e",
        "const fs=require('node:fs');for(const p of ['/snapshots','/journal','/keys']){fs.chownSync(p,1000,1000);fs.chmodSync(p,0o700)}",
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
          if (n > 60) throw Error("Isolated database unavailable");
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
        const mounted = JSON.parse(
          await docker(["inspect", op, "--format", "{{json .Mounts}}"]),
        );
        for (const m of mounted)
          if (m.Type === "volume" && !volumes.includes(m.Name)) {
            assert.equal(m.Destination, "/var/lib/postgresql/data");
            anonymousVolumes.add(m.Name);
          }
      };
      await start();
      await js(
        `const {FileDeletionJournal}=require('./apps/api/dist/deletion-journal'),{bindJournal}=require('./apps/api/dist/recovery'),{PrismaClient}=require('@prisma/client');const db=new PrismaClient(),j=await FileDeletionJournal.initialize('/journal','/keys/journal.json',process.env.REGION);await bindJournal(db,j,process.env.DATABASE_URL);await db.user.createMany({data:[{email:'deleted@synthetic.invalid',displayName:'Synthetic deleted',birthDate:'1990-01-01',passwordHash:'!not-a-password',region:process.env.REGION,emailVerified:true},{email:'preserved@synthetic.invalid',displayName:'Synthetic preserved',birthDate:'1990-01-01',passwordHash:'!not-a-password',region:process.env.REGION,emailVerified:true}]});const owner=await db.user.findUniqueOrThrow({where:{email:'preserved@synthetic.invalid'}});
      for(const type of ['image/png','image/jpeg']){const id=crypto.randomUUID();await db.media.create({data:{id,userId:owner.id,key:process.env.REGION+'/'+owner.id+'/'+id+'/clean',type,purpose:'post',size:1,status:'READY',aiDeclared:type==='image/png',...(type==='image/jpeg'?{aiLabel:'1',aiMetadata:{Label:'1',ContentProducer:'synthetic-source',ProduceID:'source-001',ReservedCode1:'',ContentPropagator:'Cubers',PropagateID:id,ReservedCode2:''}}:{})}});if(type==='image/jpeg')await db.post.create({data:{authorId:owner.id,body:'Synthetic image claim recovery fixture',mediaIds:[id],aiGenerated:true,aiSourceLabel:'1'}});}
      const videoId=crypto.randomUUID();await db.media.create({data:{id:videoId,userId:owner.id,key:process.env.REGION+'/'+owner.id+'/'+videoId+'/clean',type:'video/mp4',purpose:'post',size:1,status:'READY',aiLabel:'3',aiMetadata:{Label:'3',ContentProducer:'synthetic-video-source',ProduceID:'source-video-001',ReservedCode1:'unverified',ContentPropagator:'Cubers',PropagateID:videoId,ReservedCode2:''}}});await db.post.create({data:{authorId:owner.id,body:'Synthetic video claim recovery fixture',mediaIds:[videoId],aiGenerated:true,aiSourceLabel:'3'}});
      const room=await db.room.create({data:{code:crypto.randomUUID(),ownerId:owner.id,puzzle:'3x3',input:'scan',mode:'race',ranked:true,private:true}}),attempt=await db.attempt.create({data:{userId:owner.id,roomId:room.id,nonce:crypto.randomUUID(),scramble:[],status:'PROVISIONAL',createdAt:new Date(Date.now()-10*86400000),evidenceDeleteAt:new Date(Date.now()+20*86400000)}}),evidenceId=crypto.randomUUID();
      await db.media.create({data:{id:evidenceId,userId:owner.id,key:process.env.REGION+'/'+owner.id+'/'+evidenceId+'/clean',type:'video/mp4',purpose:'evidence',size:1,status:'READY',attemptId:attempt.id}});await db.attempt.update({where:{id:attempt.id},data:{evidenceId}});
      const child=await db.user.create({data:{email:'child@synthetic.invalid',displayName:'Synthetic child',birthDate:'2020-01-01',passwordHash:'!not-a-password',region:process.env.REGION,emailVerified:true}});await db.consent.create({data:{childId:child.id,guardianId:owner.id,documentId:crypto.randomUUID(),status:'APPROVED',recording:true,publicPosting:true}});
      const ad=await db.campaign.create({data:{title:'Archived sponsor',destination:'https://example.org/archive',content:{title:{en:'Archived sponsor',zh:'已归档赞助'},summary:{en:'Synthetic backup metadata',zh:'用于备份验收的元数据'},category:'cubing-equipment',destination:'https://example.org/archive',startsAt:new Date().toISOString(),endsAt:new Date(Date.now()+86400000).toISOString()},startsAt:new Date(),endsAt:new Date(Date.now()+86400000),reviewed:true,reviewedAt:new Date(),archiveReference:'REGISTER/2026/BACKUP'}});const retain=new Date(ad.endsAt);retain.setUTCFullYear(retain.getUTCFullYear()+3);await db.campaignRevision.create({data:{campaignId:ad.id,version:1,snapshot:{content:ad.content,archiveReference:ad.archiveReference},reason:'Synthetic legal archive recovery fixture',retainUntil:retain}});
      const noticeStart=new Date(),noticeEnd=new Date(noticeStart.getTime()+86400000);const notice=await db.announcement.create({data:{kind:'service',content:{kind:'service',title:{en:'Archived service update',zh:'归档服务公告'},summary:{en:'Synthetic editorial metadata',zh:'合成编辑元数据'},body:{en:'Synthetic offline recovery record.',zh:'合成离线恢复记录。'},startsAt:noticeStart.toISOString(),endsAt:noticeEnd.toISOString()},startsAt:noticeStart,endsAt:noticeEnd}});await db.announcementRevision.create({data:{announcementId:notice.id,version:1,snapshot:{content:notice.content,published:false},reason:'Synthetic editorial recovery fixture'}});
      const deviceContent=${JSON.stringify(deviceTestFixture())},deviceExpiry=new Date(Date.parse(deviceContent.testedAt)+365*86400000);const deviceReport=await db.deviceTestReport.create({data:{model:'gan-356-i3',content:deviceContent,expiresAt:deviceExpiry,contributors:{create:{userId:owner.id}}}});await db.deviceTestRevision.create({data:{reportId:deviceReport.id,version:1,snapshot:{content:deviceReport.content,status:'DRAFT',version:1,expiresAt:deviceExpiry.toISOString(),reviewedAt:null,reviewedVersion:null},reason:'Synthetic device workflow recovery fixture'}});
      await db.$disconnect();console.log('null');`,
      );
      await js(`${base}
        const {facelets,applyMoves,solvedCube}=require('@cubers/core'),owner=await source.user.findUniqueOrThrow({where:{email:'preserved@synthetic.invalid'}}),moves=${JSON.stringify(wcaMoves)},origin=${JSON.stringify(wcaSource)},faces=facelets(applyMoves(solvedCube(),moves));
        const room=await source.room.create({data:{code:'wca-'+crypto.randomUUID(),ownerId:owner.id,puzzle:'3x3',input:'virtual',mode:'race',ranked:false,private:true,status:'FINISHED'}});
        await source.attempt.create({data:{userId:owner.id,roomId:room.id,nonce:crypto.randomUUID(),scramble:moves,scrambleSource:origin}});
        const now=new Date();await source.competition.create({data:{creatorId:owner.id,title:{en:'WCA backup fixture',zh:'WCA备份测试'},description:{en:'Synthetic private metadata',zh:'合成私密元数据'},puzzle:'3x3',input:'virtual',ranked:false,capacity:1,registrationOpensAt:now,registrationClosesAt:new Date(Date.now()+60000),startsAt:new Date(Date.now()+120000),endsAt:new Date(Date.now()+180000),expiresAt:new Date(Date.now()+86400000),rounds:{create:[{ordinal:0,title:{en:'Fixture round',zh:'测试轮次'},format:'BEST1',opensAt:new Date(Date.now()+120000),closesAt:new Date(Date.now()+180000),scrambles:[moves],scrambleSource:origin}]}}});
        await source.guidedSolve.create({data:{userId:owner.id,input:'virtual',puzzle:'3x3',courseVersion:1,initialFaces:faces,currentFaces:faces,checkpointFaces:faces,plan:{startingFaces:faces,steps:[]},status:'EXPIRED',expiresAt:new Date(Date.now()-86400000),scrambleSource:origin}});
        const course=${JSON.stringify(alternateLesson)},option=course.alternatives[0];
        await source.course.create({data:{id:course.id,puzzle:course.puzzle,level:course.level,content:course,version:2,published:false}});
        await source.lessonSession.create({data:{userId:owner.id,lessonId:course.id,puzzle:course.puzzle,input:'virtual',algorithm:course.algorithm,guideId:option.id,guideAlgorithm:option.algorithm,courseVersion:2,moves:option.algorithm.split(' '),status:'COMPLETED',finishedAt:now}});
        await source.lessonSession.create({data:{userId:owner.id,lessonId:course.id,puzzle:course.puzzle,input:'scan',algorithm:course.algorithm,courseVersion:1,moves:course.algorithm.split(' '),status:'COMPLETED',finishedAt:now}});
        await source.$disconnect();await target.$disconnect();console.log('null');`);
      await js(`${base}
        const course=${JSON.stringify(smartLesson)},context=${JSON.stringify(smartContext)},owner=await source.user.findUniqueOrThrow({where:{email:'preserved@synthetic.invalid'}}),option=course.alternatives[0];
        await source.course.create({data:{id:course.id,puzzle:course.puzzle,level:course.level,content:course,version:1,published:false}});
        await source.lessonSession.create({data:{userId:owner.id,lessonId:course.id,puzzle:'3x3',input:'smart',algorithm:course.algorithm,guideId:option.id,guideAlgorithm:option.algorithm,courseVersion:1,moves:option.algorithm.split(' ').slice(0,3),smart:context,smartSeenAt:new Date('2026-10-20T00:00:00.000Z'),status:'INTERRUPTED',version:3,finishedAt:new Date('2026-10-20T00:00:01.000Z')}});
        await source.$disconnect();await target.$disconnect();console.log('null');`);
      await js(`${base}
        const core=require('@cubers/core'),{FirstSolveSolver}=require('./apps/api/dist/first-solve-solver'),solver=new FirstSolveSolver(),owner=await source.user.findUniqueOrThrow({where:{email:'preserved@synthetic.invalid'}}),frame=new core.SmartCubeFrame(core.SMART_FIRST_SOLVE_REFERENCE),initial=frame.toTeachingState(core.applyMoves(core.solvedCube(),'R U F2'));
        try {
          const plan=await solver.solve(initial),moves=plan.steps[0].moves,current=core.practiceApply(initial,moves),context={...${JSON.stringify(smartContext)},reference:core.SMART_FIRST_SOLVE_REFERENCE,nextSequence:moves.length,counter:(250+moves.length)&255,lastTime:moves.length?99+moves.length:null,independentState:true};
          await source.guidedSolve.create({data:{userId:owner.id,input:'smart',puzzle:'3x3',courseId:'3-first-solve',courseVersion:1,initialFaces:core.guidedFacelets(initial),currentFaces:core.guidedFacelets(current),checkpointFaces:core.guidedFacelets(current),plan,stage:1,moves,stageMoves:[],checkpoints:[{kind:'CHECKPOINT',goal:plan.steps[0].goal,target:plan.steps[0].target,at:'2026-10-20T00:00:00.000Z',faces:core.guidedFacelets(current)}],smart:context,smartSeenAt:new Date('2026-10-20T00:00:00.000Z'),status:'INTERRUPTED',version:3,finishedAt:new Date('2026-10-20T00:00:01.000Z'),expiresAt:new Date('2026-10-27T00:00:00.000Z')}});
          const scopedInitial=core.lessonStageSetup('3-corners').state,scopedPlan=core.scopedLessonPlan(await solver.solve(scopedInitial),'3-corners'),scopedContext={...context,nextSequence:0,counter:250,lastTime:null};
          await source.guidedSolve.create({data:{userId:owner.id,input:'smart',puzzle:'3x3',courseId:'3-corners',courseVersion:1,initialFaces:core.guidedFacelets(scopedInitial),currentFaces:core.guidedFacelets(scopedInitial),checkpointFaces:core.guidedFacelets(scopedInitial),plan:scopedPlan,stage:core.scopedLessonStart(scopedInitial,scopedPlan,'3-corners'),smart:scopedContext,smartSeenAt:new Date('2026-10-20T00:00:00.000Z'),status:'INTERRUPTED',version:2,finishedAt:new Date('2026-10-20T00:00:01.000Z'),expiresAt:new Date('2026-10-27T00:00:00.000Z')}});
        }finally{await solver.onModuleDestroy();await source.$disconnect();await target.$disconnect();}console.log('null');`);
      await js(`${base}
        const core=require('@cubers/core'),owner=await source.user.findUniqueOrThrow({where:{email:'preserved@synthetic.invalid'}}),at=new Date('2026-10-20T06:00:00.000Z'),event=await source.competition.create({data:{creatorId:owner.id,title:{en:'Archived smart competition',zh:'已归档智能魔方比赛'},description:{en:'Synthetic private recovery fixture',zh:'合成私密恢复记录'},puzzle:'3x3',input:'smart',ranked:false,capacity:1,status:'CANCELLED',version:3,registrationOpensAt:at,registrationClosesAt:new Date(at.getTime()+60000),startsAt:new Date(at.getTime()+120000),endsAt:new Date(at.getTime()+180000),expiresAt:new Date(at.getTime()+180*86400000),rounds:{create:[{ordinal:0,title:{en:'Archived round',zh:'已归档轮次'},format:'BEST1',opensAt:new Date(at.getTime()+120000),closesAt:new Date(at.getTime()+180000),scrambles:[${JSON.stringify(wcaMoves)}],scrambleSource:${JSON.stringify(wcaSource)}}]}},include:{rounds:true}}),entry=await source.competitionEntry.create({data:{competitionId:event.id,userId:owner.id,number:1,status:'WITHDRAWN'}}),room=await source.room.create({data:{code:'smart-'+crypto.randomUUID(),ownerId:owner.id,puzzle:'3x3',input:'smart',mode:'race',ranked:false,private:true,status:'CLOSED',competitionAttempt:true,competitionEntryId:entry.id,competitionRoundId:event.rounds[0].id,competitionIndex:0}}),context={...${JSON.stringify(smartContext)},reference:{up:'U',front:'F'}},moves=['R','U',"R'"].map((move,sequence)=>({move,sequence,elapsedMs:100+sequence}));
        await source.competitionPublication.create({data:{entryId:entry.id,scope:'overall',status:'CANCELLED',revision:2,resultDigest:'0'.repeat(64),reason:'Synthetic archived sharing withdrawal',snapshot:{puzzle:'3x3',input:'smart',score:{status:'DNF',units:null,bestMs:null}}}});
        await source.attempt.create({data:{userId:owner.id,roomId:room.id,nonce:crypto.randomUUID(),scramble:${JSON.stringify(wcaMoves)},scrambleSource:${JSON.stringify(wcaSource)},moves,smart:context,smartSeenAt:new Date('2026-10-20T06:00:00.000Z'),status:'INTERRUPTED',version:4}});
        await source.$disconnect();await target.$disconnect();console.log('null');`);
      await js(`${base}
        const owner=await source.user.findUniqueOrThrow({where:{email:'preserved@synthetic.invalid'}}),room=await source.room.create({data:{code:'mixed-'+crypto.randomUUID(),ownerId:owner.id,puzzle:'3x3',input:'virtual',mode:'race',mixed:true,ranked:false,private:true,status:'OPEN',mixedScramble:${JSON.stringify(wcaMoves)},mixedScrambleSource:${JSON.stringify(wcaSource)},mixedChallengeDate:'2026-10-20'}});
        await source.roomMember.create({data:{roomId:room.id,userId:owner.id,input:'scan'}});await source.room.update({where:{id:room.id},data:{status:'ACTIVE'}});await source.attempt.create({data:{roomId:room.id,userId:owner.id,input:'scan',nonce:'mixed-'+crypto.randomUUID(),scramble:${JSON.stringify(wcaMoves)},scrambleSource:${JSON.stringify(wcaSource)},status:'INTERRUPTED',version:2,reason:'Synthetic recovery interruption'}});await source.room.update({where:{id:room.id},data:{status:'CLOSED'}});await source.$disconnect();await target.$disconnect();console.log('null');`);
      await js(`${base}
        const core=require('@cubers/core'),owner=await source.user.findUniqueOrThrow({where:{email:'preserved@synthetic.invalid'}}),room=await source.room.create({data:{code:'smart-replay-'+crypto.randomUUID(),ownerId:owner.id,puzzle:'3x3',input:'smart',mode:'race',ranked:false,private:true,status:'FINISHED'}}),turns=core.inverse(${JSON.stringify(wcaMoves)}).flatMap(move=>move.endsWith('2')?[move[0],move[0]]:[move]),at=new Date('2026-10-20T06:00:00.000Z'),context={...${JSON.stringify(smartContext)},reference:{up:'U',front:'F'},nextSequence:turns.length,counter:(250+turns.length)&255,lastTime:100+turns.length,independentState:true};
        await source.attempt.create({data:{roomId:room.id,userId:owner.id,nonce:'smart-replay-'+crypto.randomUUID(),scramble:${JSON.stringify(wcaMoves)},scrambleSource:${JSON.stringify(wcaSource)},moves:turns.map((move,sequence)=>({move,sequence,elapsedMs:100+sequence})),smart:context,smartSeenAt:new Date(at.getTime()+990),scrambleVerifiedAt:new Date(at.getTime()-1000),inspectionAt:new Date(at.getTime()-500),startedAt:at,finishedAt:new Date(at.getTime()+1000),durationMs:1000,status:'APPROVED',version:4}});await source.$disconnect();await target.$disconnect();console.log('null');`);
      await js(`${base}
        const core=require('@cubers/core'),{createHash,randomUUID}=require('node:crypto'),hash=value=>createHash('sha256').update(value).digest('hex'),owner=await source.user.findUniqueOrThrow({where:{email:'preserved@synthetic.invalid'}}),attempt=await source.attempt.findFirstOrThrow({where:{userId:owner.id,status:'APPROVED',room:{input:'smart'}},include:{room:true}});await source.user.update({where:{id:owner.id},data:{adultVerified:true,identityVerified:true}});
        const input=core.ReplaySource.parse({attemptId:attempt.id,puzzle:attempt.room.puzzle,input:'smart',mode:attempt.room.mode,durationMs:attempt.durationMs,createdAt:attempt.createdAt.toISOString(),scramble:attempt.scramble,events:attempt.moves,smart:attempt.smart}),validated=core.validatedReplay(input),sourceDigest=hash(JSON.stringify({source:input,version:attempt.version,smartSeenAt:attempt.smartSeenAt,scrambleVerifiedAt:attempt.scrambleVerifiedAt,startedAt:attempt.startedAt,finishedAt:attempt.finishedAt}));
        for(const tag of ['restored-ready','withdraw-after-snapshot']){const id=randomUUID(),createdAt=new Date(),packet=core.ReplayPacket.parse({...validated,attemptId:id,createdAt:createdAt.toISOString()});await source.replayShare.create({data:{id,userId:owner.id,attemptId:attempt.id,guardianRequired:false,reviewRequired:false,packet,packetDigest:hash(JSON.stringify(packet)),sourceDigest,status:'READY',tokenHash:hash(randomUUID()),createdAt,expiresAt:new Date(createdAt.getTime()+7*86400000),reason:tag}});}await source.$disconnect();await target.$disconnect();console.log('null');`);
      await js(`${base}
        const {createHash,randomUUID,randomBytes,generateKeyPairSync}=require('node:crypto'),{writeFile,rm}=require('node:fs/promises'),{ReceiptStorage}=require('./apps/api/dist/attestation/receipt-storage'),hash=v=>createHash('sha256').update(v).digest('hex'),owner=await source.user.findUniqueOrThrow({where:{email:'preserved@synthetic.invalid'}}),attempt=await source.attempt.findFirstOrThrow({where:{userId:owner.id,status:'APPROVED'}}),path='/work/receipt-fixture-key.json';
        await writeFile(path,JSON.stringify({version:1,id:randomUUID(),key:randomBytes(32).toString('base64')}),{mode:0o600});const storage=await ReceiptStorage.load(path),pem=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).publicKey.export({format:'pem',type:'spki'}).toString();
        try{for(const status of ['ACTIVE','REVOKED']){const id=randomUUID(),keyIdHash=hash(randomUUID()),now=new Date(),key=await source.appAttestationKey.create({data:{id,userId:owner.id,provider:'apple-app-attest',keyIdHash,publicKeyHash:hash(randomUUID()),publicKeyPem:pem,appId:'ABCDE12345.app.cubers.mobile',distribution:'app-store',enrolledBundleVersion:'1',bundleVersion:'1',policyDigest:hash('synthetic-scope'),receiptCiphertext:storage.seal({region:process.env.REGION,userId:owner.id,id,keyIdHash},{receiptBase64:'synthetic-private-restoration-receipt'}),receiptExpiresAt:new Date(now.getTime()+86400000),lastVerifiedAt:now}});await source.appAttestationKey.update({where:{id},data:{counter:7n,version:{increment:1},...(status==='REVOKED'?{status,publicKeyPem:null,receiptCiphertext:null}:{receiptAutoRefresh:true,receiptRefreshAt:new Date(now.getTime()+60000),receiptRefreshLease:randomUUID(),receiptRefreshLeaseUntil:new Date(now.getTime()+30000),receiptRefreshFailures:2})}});if(status==='ACTIVE'){const session=await source.session.create({data:{userId:owner.id,tokenHash:hash(randomUUID()),expiresAt:new Date(now.getTime()+3600000)}}),c=await source.appAttestationChallenge.create({data:{userId:owner.id,sessionId:session.id,keyId:id,attemptId:attempt.id,provider:'apple-app-attest',region:process.env.REGION,purpose:'ACTION',operation:'inspect',policyDigest:hash('synthetic-policy'),contextDigest:hash(randomUUID()),payloadDigest:hash('synthetic-payload'),attemptVersion:attempt.version,attemptDigest:hash('synthetic-attempt'),challengeHash:hash(randomUUID()),createdAt:now,expiresAt:new Date(now.getTime()+120000)}});await source.appAttestationChallenge.update({where:{id:c.id},data:{status:'VERIFYING',claimedAt:now}});await source.appAttestationChallenge.update({where:{id:c.id},data:{status:'USED',finishedAt:now}});await source.appAttestationGrant.create({data:{userId:owner.id,sessionId:session.id,keyId:id,challengeId:c.id,attemptId:attempt.id,operation:'inspect',policyDigest:c.policyDigest,payloadDigest:c.payloadDigest,attemptDigest:c.attemptDigest,attemptVersion:attempt.version,keyVersion:1,createdAt:now,expiresAt:new Date(now.getTime()+30000)}});}}}finally{storage.destroy();await rm(path,{force:true});await source.$disconnect();await target.$disconnect();}console.log('null');`);
      await js(`${base}
        const {createHash,randomUUID}=require('node:crypto'),hash=v=>createHash('sha256').update(v).digest('hex'),owner=await source.user.findUniqueOrThrow({where:{email:'preserved@synthetic.invalid'}}),attempt=await source.attempt.findFirstOrThrow({where:{userId:owner.id,status:'APPROVED'}}),now=new Date(),session=await source.session.create({data:{userId:owner.id,tokenHash:hash(randomUUID()),expiresAt:new Date(now.getTime()+3600000)}});
        try{const challenge=await source.appAttestationChallenge.create({data:{userId:owner.id,sessionId:session.id,attemptId:attempt.id,provider:'google-play',region:process.env.REGION,purpose:'ACTION',operation:'inspect',policyDigest:hash('synthetic-google-policy'),contextDigest:hash(randomUUID()),payloadDigest:hash('synthetic-google-payload'),attemptVersion:attempt.version,attemptDigest:hash('synthetic-google-attempt'),challengeHash:hash(randomUUID()),createdAt:now,expiresAt:new Date(now.getTime()+120000)}});await source.appAttestationChallenge.update({where:{id:challenge.id},data:{status:'VERIFYING',claimedAt:now}});await source.appAttestationChallenge.update({where:{id:challenge.id},data:{status:'USED',finishedAt:now}});await source.appAttestationGrant.create({data:{provider:'google-play',userId:owner.id,sessionId:session.id,challengeId:challenge.id,attemptId:attempt.id,operation:'inspect',policyDigest:challenge.policyDigest,payloadDigest:challenge.payloadDigest,attemptDigest:challenge.attemptDigest,attemptVersion:attempt.version,createdAt:now,expiresAt:new Date(now.getTime()+30000)}});}finally{await source.$disconnect();await target.$disconnect();}console.log('null');`);
      async function request(
        operation: string,
        directory: string,
        confirmation: string,
        databaseName = "source",
      ) {
        await js(
          `await require('node:fs/promises').writeFile('/work/request.json',JSON.stringify(${JSON.stringify({ operation, region, directory, keyFile: "/keys/backup.json", confirmation, databaseHost: pg, databaseName, ...(operation === "restore-sealed" ? { temporaryDirectory: "/recovery-tmp", isolatedTarget: true } : {}) })}),{mode:0o600});console.log('null');`,
        );
        return JSON.parse(
          await docker([
            "exec",
            ...(databaseName === "target"
              ? [
                  "-e",
                  `DATABASE_URL=${env.DATABASE_URL.replace("/source?", "/target?")}`,
                ]
              : []),
            op,
            "node",
            "-e",
            "require('./apps/api/dist/snapshot-cli').runSnapshotRequest('/work/request.json').catch(e=>{console.error(e.stack);if(e.privateDiagnostic)console.error(e.privateDiagnostic);process.exitCode=1})",
          ]),
        );
      }
      await request("initialize-key", "/snapshots", "INITIALIZE SNAPSHOT KEY");
      const capture = await request(
          "capture",
          "/snapshots",
          "CAPTURE DATABASE ONLY",
        ),
        folder = `/snapshots/${capture.snapshotId}`;
      assert.equal(capture.status, "database-only-captured");
      await js(
        `${base}const row=await source.replayShare.findFirstOrThrow({where:{reason:'withdraw-after-snapshot'}});await journal.appendMedia(row.userId,{kind:'REPLAY_SHARE_WITHDRAWAL',shareId:row.id,decision:'CANCELLED'});assert.equal((await source.replayShare.findUniqueOrThrow({where:{id:row.id}})).status,'READY');await source.$disconnect();await target.$disconnect();console.log('null');`,
      );

      checks.push(
        "Real PostgreSQL 17 custom dump encrypted before persistent storage; protected compiled CLI capture",
      );
      await js(
        `${base}const {Readable}=require('node:stream'),before=(await fs.readdir('/snapshots')).sort(),keyBefore=await fs.readFile('/keys/backup.json');
        await assert.rejects(snapshot.captureSnapshot(Readable.from([Buffer.from('synthetic interrupted capture')]),'/snapshots','/keys/backup.json',journal,process.env.DATABASE_URL,undefined,async()=>{throw Error('producer exited with warnings')}),/producer exited with warnings/);
        await assert.rejects(snapshot.captureSnapshot(Readable.from((async function*(){yield Buffer.from('partial dump');await new Promise(r=>setImmediate(r));throw Error('source stream interrupted')})()),'/snapshots','/keys/backup.json',journal,process.env.DATABASE_URL),/source stream interrupted/);
        assert.deepEqual((await fs.readdir('/snapshots')).sort(),before);assert.deepEqual(await fs.readFile('/keys/backup.json'),keyBefore);assert.equal((await snapshot.verifySnapshot('${folder}','/keys/backup.json',journal)).manifest.id,'${capture.snapshotId}');await source.$disconnect();await target.$disconnect();console.log('null');`,
      );
      checks.push(
        "Compiled producer/stream failure removes only the incomplete capture; prior encrypted archive and independent keys remain intact",
      );
      await js(
        `${base}const {sweepSnapshotExpiry}=require('./apps/api/dist/snapshot-expiry'),cfg=readConfig(),directory='/snapshots/expiry-case',keyFile='/keys/expiry-case.json';await fs.mkdir(directory,{mode:0o700});await snapshot.initializeSnapshotKey(keyFile,journal);const archived=await snapshot.captureDatabase(cfg,directory,keyFile,journal),keyBefore=await fs.readFile(keyFile),mainBefore=await fs.readFile('${folder}/database.enc');assert.equal((await sweepSnapshotExpiry({directory,keyFile,journal,databaseUrl:cfg.DATABASE_URL})).purged,0);const expired=await sweepSnapshotExpiry({directory,keyFile,journal,databaseUrl:cfg.DATABASE_URL,now:Date.parse(archived.expiresAt)});assert.deepEqual(expired,{failures:0,bundles:1,targets:0,purged:1});assert.deepEqual(await fs.readdir(directory),[]);assert.deepEqual(await fs.readFile(keyFile),keyBefore);assert.deepEqual(await fs.readFile('${folder}/database.enc'),mainBefore);await source.$disconnect();await target.$disconnect();console.log('null');`,
      );
      checks.push(
        "Real encrypted PostgreSQL dump expires through the compiled standalone sweep at a test-only deadline; live archive bytes and shared keys stay unchanged",
      );
      await js(
        `${base}const u=await source.user.findUniqueOrThrow({where:{email:'deleted@synthetic.invalid'}});await journal.append([u.id]);await source.user.delete({where:{id:u.id}});
        const owner=await source.user.findUniqueOrThrow({where:{email:'preserved@synthetic.invalid'}}),media=await source.media.findFirstOrThrow({where:{userId:owner.id,type:'image/png'}}),evidence=await source.media.findFirstOrThrow({where:{userId:owner.id,purpose:'evidence'}}),attempt=await source.attempt.findUniqueOrThrow({where:{id:evidence.attemptId}}),child=await source.user.findUniqueOrThrow({where:{email:'child@synthetic.invalid'}});
        await journal.appendMedia(owner.id,{kind:'MEDIA_ERASE',mediaId:media.id,key:media.key});await journal.appendMedia(owner.id,{kind:'EVIDENCE_DEADLINE',mediaId:evidence.id,attemptId:attempt.id,attemptCreatedAt:attempt.createdAt.toISOString(),deadline:new Date(Date.now()+7*86400000).toISOString()});await journal.appendMedia(child.id,{kind:'CONSENT_WITHDRAWAL',cutoff:new Date().toISOString()});
        await source.$disconnect();await target.$disconnect();console.log('null');`,
      );
      await docker(["rm", "-f", "-v", op]);
      await start();
      assert.equal(
        (await request("verify", folder, "VERIFY DATABASE SNAPSHOT")).status,
        "database-only-verified",
      );
      checks.push(
        "Independent journal, distinct keys and encrypted snapshots survive operator-container recreation on separate named volumes",
      );
      // Failed targets remain empty: wrong target, tampered ciphertext and a
      // cryptographically valid but invalid PostgreSQL archive cannot commit SQL.
      await assert.rejects(
        request(
          "restore-sealed",
          folder,
          "RESTORE SEALED ISOLATED DATABASE",
          "source",
        ),
      );
      await js(
        `${base}const path='${folder}/database.enc',raw=await fs.readFile(path);await fs.writeFile('/work/original',raw,{mode:0o600});raw[30]^=1;await fs.writeFile(path,raw);await source.$disconnect();await target.$disconnect();console.log('null');`,
      );
      await assert.rejects(
        request(
          "restore-sealed",
          folder,
          "RESTORE SEALED ISOLATED DATABASE",
          "target",
        ),
      );
      await js(
        `${base}const rows=await target.$queryRawUnsafe("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'");assert.equal(rows[0].n,0);await fs.writeFile('${folder}/database.enc',await fs.readFile('/work/original'));await source.$disconnect();await target.$disconnect();console.log('null');`,
      );
      checks.push(
        "Source/nonempty target and tampered ciphertext refused before any target schema or data is restored",
      );
      const invalid = await js(
        `${base}const {Readable}=require('node:stream'),{createDecipheriv}=require('node:crypto');const checked=await snapshot.verifySnapshot('${folder}','/keys/backup.json',journal),v=checked.manifest,d=createDecipheriv('aes-256-gcm',checked.key,Buffer.from(v.iv,'base64'));d.setAAD(Buffer.from(JSON.stringify({format:'cubers-database-snapshot-v1',id:v.id,region:v.region,installationId:v.installationId,journalKeyId:v.journalKeyId})));d.setAuthTag(Buffer.from(v.tag,'base64'));const raw=Buffer.concat([d.update(await fs.readFile('${folder}/database.enc')),d.final()]);assert.ok(raw.length>512);const m=await snapshot.captureSnapshot(Readable.from([raw.subarray(0,raw.length-256)]),'/snapshots','/keys/backup.json',journal,process.env.DATABASE_URL);await source.$disconnect();await target.$disconnect();console.log(JSON.stringify({id:m.id}));`,
      );
      await assert.rejects(
        request(
          "restore-sealed",
          `/snapshots/${invalid.id}`,
          "RESTORE SEALED ISOLATED DATABASE",
          "target",
        ),
      );
      await js(
        `${base}const rows=await target.$queryRawUnsafe("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'");assert.equal(rows[0].n,0);await source.$disconnect();await target.$disconnect();console.log('null');`,
      );
      checks.push(
        "An authenticated truncated PostgreSQL archive rolls back the restore and never commits a partial schema",
      );
      const started = Date.now();
      assert.equal(
        (
          await request(
            "restore-sealed",
            folder,
            "RESTORE SEALED ISOLATED DATABASE",
            "target",
          )
        ).status,
        "restored-sealed",
      );
      const metrics = await js(
        `${base}const binding=await target.recoveryBinding.findUniqueOrThrow({where:{id:'installation'}});assert.equal(binding.state,'SEALED');assert.equal(await target.session.count(),0);assert.equal(await target.authToken.count(),0);const removed=await target.user.findUniqueOrThrow({where:{email:'deleted@synthetic.invalid'}});assert.ok(removed.deletedAt);assert.equal(await target.accountRemoval.count({where:{id:removed.id}}),1);const preserved=await target.user.findUniqueOrThrow({where:{email:'preserved@synthetic.invalid'}});assert.equal(preserved.deletedAt,null);const erased=await target.media.findFirstOrThrow({where:{userId:preserved.id,type:'image/png'}}),kept=await target.media.findFirstOrThrow({where:{userId:preserved.id,type:'image/jpeg'}}),evidence=await target.media.findFirstOrThrow({where:{userId:preserved.id,purpose:'evidence'}});assert.equal(erased.status,'DELETING');assert.equal(kept.status,'READY');assert.ok((await target.mediaRecoveryState.findUniqueOrThrow({where:{id:erased.id}})).erasedAt);assert.equal((await target.objectRemoval.findUniqueOrThrow({where:{id:erased.id}})).keys.length,2);const evidenceState=await target.mediaRecoveryState.findUniqueOrThrow({where:{id:evidence.id}}),attempt=await target.attempt.findUniqueOrThrow({where:{id:evidence.attemptId}});assert.equal(attempt.evidenceDeleteAt.getTime(),evidenceState.deadline.getTime());assert.ok(evidenceState.deadline.getTime()<Date.now()+7*86400000);const child=await target.user.findUniqueOrThrow({where:{email:'child@synthetic.invalid'}});assert.equal((await target.consent.findUniqueOrThrow({where:{childId:child.id}})).status,'REVOKED');assert.ok(await target.consentWithdrawalRecovery.findUnique({where:{id:child.id}}));const cfg=readConfig({...process.env,DATABASE_URL:process.env.DATABASE_URL.replace('/source?','/target?')});const {reconcileDeletionJournal}=require('./apps/api/dist/recovery');await assert.rejects(reconcileDeletionJournal(target,cfg),/sealed/);await assert.rejects(reconcileDeletionJournal(target,{...cfg,DELETION_JOURNAL_MODE:'disabled'}),/sealed/);assert.equal((await fs.readdir('/recovery-tmp')).length,0);const migrations=await target.$queryRawUnsafe('SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL');await source.$disconnect();await target.$disconnect();console.log(JSON.stringify({migrations:migrations[0].n}));`,
      );
      checks.push(
        "Real pg_restore restores all current migrations and the synthetic accounts; newer independent deletion replay disables the removed account and queues owned-object erasure",
      );
      checks.push(
        "Newer individual-media erasure, exact object variants, evidence-retention deadline and child consent withdrawal replay into a real restored database while unrelated media stays ready",
      );
      checks.push(
        "Restored sessions/tokens are absent; SEALED target refuses normal startup replay even if development journal mode is disabled; tmpfs staging is empty",
      );
      await assert.rejects(
        request(
          "restore-sealed",
          folder,
          "RESTORE SEALED ISOLATED DATABASE",
          "target",
        ),
      );
      checks.push(
        "A populated restored target cannot be overwritten by running restore again",
      );
      const restoreVerificationMs = Date.now() - started;
      await js(
        `${base}const ad=await target.campaign.findFirstOrThrow({where:{title:'Archived sponsor'}});assert.equal(ad.enabled,false);assert.equal(ad.archiveReference,'REGISTER/2026/BACKUP');assert.equal(ad.content.title.zh,'已归档赞助');const revision=await target.campaignRevision.findUniqueOrThrow({where:{campaignId_version:{campaignId:ad.id,version:1}}});assert.ok(revision.retainUntil.getTime()>Date.now()+1000*86400000);assert.equal(revision.snapshot.archiveReference,ad.archiveReference);assert.deepEqual((await target.setting.findUniqueOrThrow({where:{key:'sponsors-enabled'}})).value,{enabled:false,version:1});assert.equal((await target.recoveryBinding.findUniqueOrThrow({where:{id:'installation'}})).state,'SEALED');await source.$disconnect();await target.$disconnect();console.log('null');`,
      );
      checks.push(
        "Bilingual campaign metadata and retained review archives survive real dump/restore while sponsor settings stay off and the target stays sealed",
      );
      await js(
        `${base}const notice=await target.announcement.findFirstOrThrow({where:{kind:'service'}});assert.equal(notice.content.title.en,'Archived service update');assert.equal(notice.content.body.zh,'合成离线恢复记录。');assert.equal(notice.published,false);const revision=await target.announcementRevision.findUniqueOrThrow({where:{announcementId_version:{announcementId:notice.id,version:1}}});assert.equal(revision.snapshot.content.title.zh,'归档服务公告');assert.equal((await target.recoveryBinding.findUniqueOrThrow({where:{id:'installation'}})).state,'SEALED');await source.$disconnect();await target.$disconnect();console.log('null');`,
      );
      checks.push(
        "Bilingual editorial drafts and retained revision metadata survive real encrypted dump/restore without publishing from a sealed target",
      );
      await js(
        `${base}const report=await target.deviceTestReport.findFirstOrThrow({where:{model:'gan-356-i3'},include:{contributors:true,revisions:true}});assert.equal(report.status,'DRAFT');assert.equal(report.content.provenance,'synthetic');assert.ok(report.content.summary.zh.includes('模拟'));assert.equal(report.reviewedAt,null);assert.equal(report.revisions.length,1);assert.equal(report.contributors.length,1);const owner=await target.user.findUniqueOrThrow({where:{email:'preserved@synthetic.invalid'}});assert.equal(report.contributors[0].userId,owner.id);assert.equal((await target.recoveryBinding.findUniqueOrThrow({where:{id:'installation'}})).state,'SEALED');await source.$disconnect();await target.$disconnect();console.log('null');`,
      );
      checks.push(
        "Scoped synthetic device reports, bounded revision data and current contributor relations survive encrypted restore without hardware activation or unsealing",
      );
      await js(
        `${base}const owner=await target.user.findUniqueOrThrow({where:{email:'preserved@synthetic.invalid'}}),media=await target.media.findFirstOrThrow({where:{userId:owner.id,type:'image/png',purpose:'post'}});assert.equal(media.aiDeclared,true);assert.equal(media.aiLabel,null);assert.equal(media.aiMetadata,null);await assert.rejects(target.media.update({where:{id:media.id},data:{aiDeclared:false}}));assert.equal((await target.recoveryBinding.findUniqueOrThrow({where:{id:'installation'}})).state,'SEALED');await source.$disconnect();await target.$disconnect();console.log('null');`,
      );
      checks.push(
        "Immutable author attachment declarations survive encrypted restoration without being changed into source claims or unsealing the target",
      );
      await js(
        `${base}const owner=await target.user.findUniqueOrThrow({where:{email:'preserved@synthetic.invalid'}}),media=await target.media.findFirstOrThrow({where:{userId:owner.id,type:'image/jpeg'}}),post=await target.post.findFirstOrThrow({where:{authorId:owner.id,body:'Synthetic image claim recovery fixture'}});assert.equal(media.aiLabel,'1');assert.equal(media.aiMetadata.Label,'1');assert.equal(media.aiMetadata.ContentProducer,'synthetic-source');assert.equal(media.aiMetadata.PropagateID,media.id);assert.equal(post.aiGenerated,true);assert.equal(post.aiSourceLabel,'1');assert.deepEqual(post.mediaIds,[media.id]);assert.equal(post.status,'PENDING');assert.equal((await target.recoveryBinding.findUniqueOrThrow({where:{id:'installation'}})).state,'SEALED');await source.$disconnect();await target.$disconnect();console.log('null');`,
      );
      checks.push(
        "Image source-claim metadata and forced pending post labels survive real encrypted database restore without publishing or unsealing",
      );

      await js(
        `${base}const owner=await target.user.findUniqueOrThrow({where:{email:'preserved@synthetic.invalid'}}),media=await target.media.findFirstOrThrow({where:{userId:owner.id,type:'video/mp4',purpose:'post'}}),post=await target.post.findFirstOrThrow({where:{authorId:owner.id,body:'Synthetic video claim recovery fixture'}});assert.equal(media.aiLabel,'3');assert.equal(media.aiMetadata.Label,'3');assert.equal(media.aiMetadata.ContentProducer,'synthetic-video-source');assert.equal(media.aiMetadata.PropagateID,media.id);assert.equal(post.aiGenerated,true);assert.equal(post.aiSourceLabel,'3');assert.deepEqual(post.mediaIds,[media.id]);assert.equal(post.status,'PENDING');assert.equal((await target.recoveryBinding.findUniqueOrThrow({where:{id:'installation'}})).state,'SEALED');await source.$disconnect();await target.$disconnect();console.log('null');`,
      );
      checks.push(
        "Video source-claim metadata and forced pending post labels survive encrypted database restore without publication or unsealing",
      );
      await js(
        `${base}const owner=await target.user.findUniqueOrThrow({where:{email:'preserved@synthetic.invalid'}}),attempt=await target.attempt.findFirstOrThrow({where:{userId:owner.id,room:{input:'virtual',mixed:false}}}),event=await target.competition.findFirstOrThrow({where:{title:{path:['en'],equals:'WCA backup fixture'}},include:{rounds:true}}),lesson=await target.guidedSolve.findFirstOrThrow({where:{userId:owner.id,input:'virtual'}});for(const source of[attempt.scrambleSource,event.rounds[0].scrambleSource,lesson.scrambleSource])assert.deepEqual(source,${JSON.stringify(wcaSource)});assert.deepEqual(attempt.scramble,${JSON.stringify(wcaMoves)});assert.deepEqual(event.rounds[0].scrambles,[${JSON.stringify(wcaMoves)}]);assert.equal(event.status,'DRAFT');assert.equal(lesson.status,'EXPIRED');const legacy=await target.attempt.findFirstOrThrow({where:{userId:owner.id,room:{input:'scan'}}});assert.equal(legacy.scrambleSource,null);assert.equal((await target.recoveryBinding.findUniqueOrThrow({where:{id:'installation'}})).state,'SEALED');await source.$disconnect();await target.$disconnect();console.log('null');`,
      );
      checks.push(
        "Community-generator scramble provenance and issued sequences survive encrypted restore across attempts, rounds and learning; legacy provenance stays null and targets remain sealed",
      );

      await js(
        `${base}const expected=${JSON.stringify(alternateLesson)},option=expected.alternatives[0],course=await target.course.findUniqueOrThrow({where:{id:expected.id}}),owner=await target.user.findUniqueOrThrow({where:{email:'preserved@synthetic.invalid'}}),guide=await target.lessonSession.findFirstOrThrow({where:{userId:owner.id,lessonId:expected.id,guideId:option.id}}),legacy=await target.lessonSession.findFirstOrThrow({where:{userId:owner.id,lessonId:expected.id,guideId:null}});assert.equal(course.version,2);assert.equal(course.published,false);assert.deepEqual(course.content.alternatives,expected.alternatives);assert.equal(guide.algorithm,expected.algorithm);assert.equal(guide.guideAlgorithm,option.algorithm);assert.equal(guide.courseVersion,2);assert.deepEqual(guide.moves,option.algorithm.split(' '));assert.equal(legacy.guideAlgorithm,null);assert.equal(legacy.courseVersion,1);assert.deepEqual(legacy.moves,expected.algorithm.split(' '));assert.equal((await target.recoveryBinding.findUniqueOrThrow({where:{id:'installation'}})).state,'SEALED');await source.$disconnect();await target.$disconnect();console.log('null');`,
      );
      checks.push(
        "Versioned bilingual shorter guides, exact original setups, selected-guide metadata and actual moves restore together; historical null guides and sealed targets remain intact",
      );

      await js(`${base}
        const owner=await target.user.findUniqueOrThrow({where:{email:'preserved@synthetic.invalid'}}),where={userId:owner.id,input:'smart',courseId:'3-corners'},original=await source.guidedSolve.findFirstOrThrow({where}),restored=await target.guidedSolve.findFirstOrThrow({where});
        assert.deepEqual(restored,original);assert.equal(restored.plan.lessonId,'3-corners');assert.ok(restored.plan.steps.every(step=>step.goal==='corner'));assert.equal(restored.status,'INTERRUPTED');assert.equal(restored.smart.counter,250);assert.equal(restored.smart.nextSequence,0);assert.equal((await target.recoveryBinding.findUniqueOrThrow({where:{id:'installation'}})).state,'SEALED');await source.$disconnect();await target.$disconnect();console.log('null');`);
      checks.push(
        "Stage-scoped smart plan, actual face colors, target-only checkpoints and archived connection restore exactly under migration47 without whole-solve credit or unsealing",
      );

      await js(`${base}
        const expected=${JSON.stringify(smartLesson)},context=${JSON.stringify(smartContext)},owner=await target.user.findUniqueOrThrow({where:{email:'preserved@synthetic.invalid'}}),row=await target.lessonSession.findFirstOrThrow({where:{userId:owner.id,lessonId:expected.id,input:'smart'}}),option=expected.alternatives[0],legacy=await target.lessonSession.findFirstOrThrow({where:{userId:owner.id,input:'scan'}});
        assert.deepEqual(row.smart,context);assert.equal(row.status,'INTERRUPTED');assert.equal(row.version,3);assert.equal(row.algorithm,expected.algorithm);assert.equal(row.guideId,option.id);assert.equal(row.guideAlgorithm,option.algorithm);assert.deepEqual(row.moves,option.algorithm.split(' ').slice(0,3));assert.equal(row.smartSeenAt.toISOString(),'2026-10-20T00:00:00.000Z');assert.equal(legacy.smart,null);assert.equal(legacy.smartSeenAt,null);assert.equal((await target.recoveryBinding.findUniqueOrThrow({where:{id:'installation'}})).state,'SEALED');await source.$disconnect();await target.$disconnect();console.log('null');`);
      checks.push(
        "Synthetic private smart-learning frame, epoch, counters, observed turns, guide and interrupted state survive encrypted restore; legacy smart fields remain null and target stays sealed",
      );
      await js(`${base}
        const core=require('@cubers/core'),owner=await target.user.findUniqueOrThrow({where:{email:'preserved@synthetic.invalid'}}),row=await target.guidedSolve.findFirstOrThrow({where:{userId:owner.id,input:'smart',courseId:'3-first-solve'}}),original=await source.guidedSolve.findUniqueOrThrow({where:{id:row.id}}),legacy=await target.guidedSolve.findFirstOrThrow({where:{userId:owner.id,input:'virtual'}});
        assert.deepEqual(row,original);assert.equal(row.status,'INTERRUPTED');assert.equal(row.version,3);assert.equal(row.stage,1);assert.equal(row.plan.steps.length,13);assert.deepEqual(row.smart.reference,core.SMART_FIRST_SOLVE_REFERENCE);assert.equal(row.smart.nextSequence,row.moves.length);assert.equal(row.smart.counter,(250+row.moves.length)&255);assert.equal(row.smart.epoch,${JSON.stringify(smartContext.epoch)});assert.equal(row.checkpoints.length,1);assert.equal(row.scrambleSource,null);assert.equal(row.smartSeenAt.toISOString(),'2026-10-20T00:00:00.000Z');assert.equal(legacy.smart,null);assert.equal(legacy.smartSeenAt,null);assert.equal((await target.recoveryBinding.findUniqueOrThrow({where:{id:'installation'}})).state,'SEALED');await source.$disconnect();await target.$disconnect();console.log('null');`);
      checks.push(
        "Smart first-solve plans, verified stage, actual moves, fixed teaching frame, epoch and counters survive encrypted restore exactly; legacy fields stay null and targets stay sealed",
      );
      await js(`${base}
        const owner=await target.user.findUniqueOrThrow({where:{email:'preserved@synthetic.invalid'}}),row=await target.attempt.findFirstOrThrow({where:{userId:owner.id,status:'INTERRUPTED',room:{input:'smart'}}}),original=await source.attempt.findUniqueOrThrow({where:{id:row.id}}),legacy=await target.attempt.findFirstOrThrow({where:{userId:owner.id,room:{input:'virtual'}}});
        assert.deepEqual(row,original);assert.equal(row.status,'INTERRUPTED');assert.equal(row.version,4);assert.equal(row.smart.nextSequence,3);assert.equal(row.smart.counter,253);assert.deepEqual(row.smart.reference,{up:'U',front:'F'});assert.equal(row.smart.epoch,${JSON.stringify(smartContext.epoch)});assert.equal(row.moves.length,3);assert.equal(row.smartSeenAt.toISOString(),'2026-10-20T06:00:00.000Z');assert.equal(legacy.smart,null);assert.equal(legacy.smartSeenAt,null);assert.equal((await target.recoveryBinding.findUniqueOrThrow({where:{id:'installation'}})).state,'SEALED');await source.$disconnect();await target.$disconnect();console.log('null');`);
      checks.push(
        "Private smart game context, epoch, counters, actual turn receipts and interrupted attempt survive encrypted restore exactly; legacy fields stay null and targets remain sealed",
      );
      await js(`${base}
        const event=await target.competition.findFirstOrThrow({where:{input:'smart'},include:{rounds:{orderBy:{ordinal:'asc'}},entries:{include:{publications:true,rooms:{include:{attempts:true}}}}}}),original=await source.competition.findUniqueOrThrow({where:{id:event.id},include:{rounds:{orderBy:{ordinal:'asc'}},entries:{include:{publications:true,rooms:{include:{attempts:true}}}}}});
        assert.deepEqual(event,original);assert.equal(event.input,'smart');assert.equal(event.puzzle,'3x3');assert.equal(event.status,'CANCELLED');assert.deepEqual(event.rounds[0].scrambles,[${JSON.stringify(wcaMoves)}]);assert.deepEqual(event.rounds[0].scrambleSource,${JSON.stringify(wcaSource)});const entry=event.entries[0],room=entry.rooms[0];assert.equal(entry.status,'WITHDRAWN');assert.equal(entry.publications[0].status,'CANCELLED');assert.equal(entry.publications[0].snapshot.input,'smart');assert.equal(room.competitionAttempt,true);assert.equal(room.competitionIndex,0);assert.equal(room.input,'smart');assert.equal(room.attempts[0].smart.epoch,${JSON.stringify(smartContext.epoch)});assert.equal(room.attempts[0].status,'INTERRUPTED');assert.equal((await target.recoveryBinding.findUniqueOrThrow({where:{id:'installation'}})).state,'SEALED');await source.$disconnect();await target.$disconnect();console.log('null');`);
      checks.push(
        "Scheduled smart category, shared WCA slot, permanent room marker, private connection context and withdrawn sharing snapshot restore exactly without reopening the event or unsealing targets",
      );
      await js(`${base}
        const room=await target.room.findFirstOrThrow({where:{mixed:true},include:{attempts:true}}),original=await source.room.findUniqueOrThrow({where:{id:room.id},include:{attempts:true}}),members=await target.roomMember.findMany({where:{roomId:room.id}}),legacy=await target.room.findFirstOrThrow({where:{mixed:false}});
        assert.deepEqual(room,original);assert.deepEqual(members,await source.roomMember.findMany({where:{roomId:room.id}}));assert.equal(room.status,'CLOSED');assert.equal(room.ranked,false);assert.equal(room.input,'virtual');assert.equal(members[0].input,'scan');assert.equal(room.attempts[0].input,'scan');assert.deepEqual(room.mixedScramble,${JSON.stringify(wcaMoves)});assert.deepEqual(room.mixedScrambleSource,${JSON.stringify(wcaSource)});assert.equal(legacy.mixed,false);assert.equal(legacy.mixedScramble,null);await assert.rejects(target.room.update({where:{id:room.id},data:{ranked:true}}));await assert.rejects(target.attempt.update({where:{id:room.attempts[0].id},data:{input:'virtual'}}));assert.equal((await target.recoveryBinding.findUniqueOrThrow({where:{id:'installation'}})).state,'SEALED');await source.$disconnect();await target.$disconnect();console.log('null');`);
      checks.push(
        "Mixed-room marker, shared WCA source, actual per-member and frozen attempt inputs survive encrypted restore; casual-only and immutable-input guards remain enforced with targets sealed",
      );
      await js(`${base}
        const core=require('@cubers/core'),{archivedReplayInput}=require('./apps/api/dist/attempt-input'),row=await target.attempt.findFirstOrThrow({where:{status:'APPROVED',room:{input:'smart'}},include:{room:true}}),original=await source.attempt.findUniqueOrThrow({where:{id:row.id},include:{room:true}});assert.deepEqual(row,original);assert.equal(archivedReplayInput(row),'smart');const packet=core.validatedReplay({attemptId:row.id,puzzle:row.room.puzzle,input:'smart',mode:row.room.mode,durationMs:row.durationMs,createdAt:row.createdAt.toISOString(),scramble:row.scramble,events:row.moves,smart:row.smart});assert.equal(packet.input,'smart');assert.equal(packet.telemetry.model,'gan-356-i3');assert.equal(packet.telemetry.continuity,'counter');assert.equal(Object.hasOwn(packet,'smart'),false);assert.equal(Object.hasOwn(packet,'epoch'),false);assert.equal(core.practiceSolved(core.practiceApply(core.practiceApply(core.solvedPuzzle('3x3'),packet.scramble),packet.moves)),true);assert.equal(core.smartDeviceCatalogue().every(device=>!device.enabled&&!device.playEnabled),true);assert.equal((await target.recoveryBinding.findUniqueOrThrow({where:{id:'installation'}})).state,'SEALED');await source.$disconnect();await target.$disconnect();console.log('null');`);
      checks.push(
        "Approved private smart replay archive restores exactly and reconstructs a solved scramble with model/continuity only; no connection identifiers, hardware activation or target unsealing",
      );
      await js(`${base}
        const core=require('@cubers/core'),rows=await target.replayShare.findMany({orderBy:{reason:'asc'}});assert.equal(rows.length,2);for(const row of rows){const original=await source.replayShare.findUniqueOrThrow({where:{id:row.id}});assert.deepEqual(row.packet,original.packet);assert.equal(row.sourceDigest,original.sourceDigest);assert.equal(row.packetDigest,original.packetDigest);assert.equal(row.tokenHash,null);assert.ok(row.revision>original.revision);assert.equal(row.status,row.reason==='withdraw-after-snapshot'?'CANCELLED':'READY');const packet=core.ReplayPacket.parse(row.packet);assert.equal(packet.attemptId,row.id);assert.notEqual(packet.attemptId,row.attemptId);assert.equal(Object.hasOwn(packet,'smart'),false);assert.equal(core.practiceSolved(core.practiceApply(core.practiceApply(core.solvedPuzzle('3x3'),packet.scramble),packet.moves)),true);}assert.equal((await target.recoveryBinding.findUniqueOrThrow({where:{id:'installation'}})).state,'SEALED');await source.$disconnect();await target.$disconnect();console.log('null');`);
      checks.push(
        "Immutable anonymous replay snapshots restore exactly; all old link hashes are cleared, and an independently journaled post-snapshot withdrawal cancels its restored grant while targets remain sealed",
      );
      await js(`${base}
        const originals=await source.appAttestationKey.findMany({orderBy:{id:'asc'}}),rows=await target.appAttestationKey.findMany({orderBy:{id:'asc'}});assert.equal(rows.length,2);assert.equal(originals.filter(r=>r.status==='ACTIVE'&&r.receiptCiphertext&&r.publicKeyPem).length,1);assert.equal(await source.appAttestationGrant.count(),2);assert.equal(await source.appAttestationGrant.count({where:{provider:'google-play',keyId:null,keyVersion:null}}),1);for(let i=0;i<rows.length;i++){const row=rows[i],original=originals[i];assert.equal(row.status,'REVOKED');assert.equal(row.publicKeyPem,null);assert.equal(row.receiptCiphertext,null);assert.equal(row.receiptAutoRefresh,false);assert.equal(row.receiptRefreshAt,null);assert.equal(row.receiptRefreshLease,null);assert.equal(row.receiptRefreshLeaseUntil,null);assert.equal(row.receiptRefreshFailures,0);assert.equal(row.counter,7n);assert.equal(row.keyIdHash,original.keyIdHash);assert.equal(row.publicKeyHash,original.publicKeyHash);assert.equal(row.version,original.version+(original.status==='ACTIVE'?1:0));await assert.rejects(target.appAttestationKey.update({where:{id:row.id},data:{status:'ACTIVE',version:{increment:1}}}));}assert.equal(await target.appAttestationChallenge.count(),0);assert.equal(await target.appAttestationGrant.count(),0);assert.equal((await target.recoveryBinding.findUniqueOrThrow({where:{id:'installation'}})).state,'SEALED');await source.$disconnect();await target.$disconnect();console.log('null');`);
      checks.push(
        "Sealed restoration clears Apple and keyless Google challenges/grants, revokes Apple keys, clears periodic opt-in/schedules/leases/failures, erases public keys and receipts, retains counters and terminal metadata, and invalidates all session-bound challenges and grants",
      );
      for (const name of ["floor-source", "floor-stale", "floor-fresh"])
        await docker(["exec", pg, "createdb", "-U", "fixture", name]);
      await docker([
        "run",
        "--rm",
        "--network",
        network,
        ...envArgs,
        "-e",
        "DATABASE_URL=" +
          env.DATABASE_URL.replace("/source?", "/floor-source?"),
        migrationImage,
      ]);
      const floorBase = `const assert=require('node:assert/strict'),fs=require('node:fs/promises'),crypto=require('node:crypto'),{PrismaClient}=require('@prisma/client'),{readConfig}=require('./apps/api/dist/config'),{FileDeletionJournal}=require('./apps/api/dist/deletion-journal'),snapshot=require('./apps/api/dist/database-snapshot'),recovery=require('./apps/api/dist/recovery'),{retireDeletionHistory}=require('./apps/api/dist/journal-retention'),cfg=readConfig({...process.env,DATABASE_URL:process.env.DATABASE_URL.replace('/source?','/floor-source?'),DELETION_JOURNAL_DIRECTORY:'/keys/floor-journal',DELETION_JOURNAL_KEY_FILE:'/keys/floor-journal-key.json'}),db=new PrismaClient({datasourceUrl:cfg.DATABASE_URL});`;
      await js(
        `${floorBase}for(const p of ['/keys/floor-journal','/snapshots/floor'])await fs.mkdir(p,{mode:0o700});const j=await FileDeletionJournal.initialize('/keys/floor-journal','/keys/floor-journal-key.json',cfg.REGION,()=>Date.now()-32*86400000);await recovery.bindJournal(db,j,cfg.DATABASE_URL);const user=await db.user.create({data:{email:'floor@synthetic.invalid',displayName:'Synthetic retired account',birthDate:'1990-01-01',createdAt:new Date(Date.now()-40*86400000),region:cfg.REGION,passwordHash:'!disabled',emailVerified:true}});await j.append([user.id]);await snapshot.initializeSnapshotKey('/keys/floor-snapshot.json',j);const stale=await snapshot.captureDatabase(cfg,'/snapshots/floor','/keys/floor-snapshot.json',j);assert.equal(stale.applied.count,0);await recovery.reconcileDeletionJournal(db,cfg);const fresh=await snapshot.captureDatabase(cfg,'/snapshots/floor','/keys/floor-snapshot.json',j);assert.equal(fresh.applied.count,1);assert.equal((await retireDeletionHistory(db,cfg)).floor,0);await db.user.delete({where:{id:user.id}});await db.accountRemoval.deleteMany({where:{id:user.id}});assert.equal((await retireDeletionHistory(db,cfg)).floor,1);assert.equal(await db.deletionReceipt.count(),0);assert.equal((await j.view()).records.length,0);await fs.writeFile('/keys/floor-case.json',JSON.stringify({stale:stale.id,fresh:fresh.id,user:user.id}),{mode:0o600});await db.$disconnect();console.log('null');`,
      );
      await docker(["rm", "-f", "-v", op]);
      await start();
      checks.push(
        "A real source database and two current encrypted dumps cross a 31-day retirement boundary only after applied deletion and completed erasure; the compact independent floor survives operator recreation and removes old record identifiers",
      );
      await js(
        `${floorBase}const j=await FileDeletionJournal.load('/keys/floor-journal','/keys/floor-journal-key.json',cfg.REGION),test=JSON.parse(await fs.readFile('/keys/floor-case.json','utf8'));assert.equal((await j.floor()).count,1);const event=await j.appendMedia(crypto.randomUUID(),{kind:'CONSENT_WITHDRAWAL',cutoff:new Date().toISOString()});assert.equal(event.sequence,2);const request={operation:'replay',region:cfg.REGION,databaseHost:new URL(cfg.DATABASE_URL).hostname,databaseName:'floor-source',confirmation:'REPLAY DELETIONS'};await fs.writeFile('/work/floor-request.json',JSON.stringify(request),{mode:0o600});const child=require('node:child_process'),operatorEnv={...process.env,DATABASE_URL:cfg.DATABASE_URL,DELETION_JOURNAL_DIRECTORY:cfg.DELETION_JOURNAL_DIRECTORY,DELETION_JOURNAL_KEY_FILE:cfg.DELETION_JOURNAL_KEY_FILE};child.execFileSync(process.execPath,['apps/api/dist/recovery-cli.js','/work/floor-request.json'],{env:operatorEnv});request.operation='retire';request.confirmation='RETIRE COMPLETED PRIVACY HISTORY';await fs.writeFile('/work/floor-request.json',JSON.stringify(request));assert.equal(JSON.parse(child.execFileSync(process.execPath,['apps/api/dist/recovery-cli.js','/work/floor-request.json'],{env:operatorEnv,encoding:'utf8'})).floor,1);request.operation='check';request.confirmation='CHECK RECOVERY';await fs.writeFile('/work/floor-request.json',JSON.stringify(request));const checked=JSON.parse(child.execFileSync(process.execPath,['apps/api/dist/recovery-cli.js','/work/floor-request.json'],{env:operatorEnv,encoding:'utf8'}));assert.equal(checked.pending,0);assert.equal(checked.floor,1);await assert.rejects(snapshot.restoreSealedDatabase({...cfg,DATABASE_URL:cfg.DATABASE_URL.replace('/floor-source?','/floor-stale?')},'/snapshots/floor/'+test.stale,'/keys/floor-snapshot.json',j,'/recovery-tmp'));const denied=new PrismaClient({datasourceUrl:cfg.DATABASE_URL.replace('/floor-source?','/floor-stale?')});assert.equal((await denied.$queryRawUnsafe("SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname='public' AND c.relkind='r'"))[0].n,0);await denied.$disconnect();await snapshot.restoreSealedDatabase({...cfg,DATABASE_URL:cfg.DATABASE_URL.replace('/floor-source?','/floor-fresh?')},'/snapshots/floor/'+test.fresh,'/keys/floor-snapshot.json',j,'/recovery-tmp');const restored=new PrismaClient({datasourceUrl:cfg.DATABASE_URL.replace('/floor-source?','/floor-fresh?')}),b=await restored.recoveryBinding.findUniqueOrThrow({where:{id:'installation'}});assert.equal(b.state,'SEALED');assert.equal(b.journalFloor,1);assert.equal(b.journalCount,2);assert.equal(await restored.deletionReceipt.count(),1);assert.ok((await restored.user.findUniqueOrThrow({where:{id:test.user}})).deletedAt);assert.equal(await restored.accountRemoval.count({where:{id:test.user}}),1);await restored.$disconnect();await db.$disconnect();console.log('null');`,
      );
      checks.push(
        "An authenticated dump below the retired applied-history floor is refused before any target schema is written; the fully applied dump still performs real pg_restore, replays newer absolute events and remains sealed with the deleted account disabled",
      );
      checks.push(
        "Compiled protected operator replay/retirement commands accept the bound source after retirement, preserve the floor and continue event numbering without retaining old receipt rows",
      );
      report.regions.push({
        region,
        checks,
        migrations: metrics.migrations,
        encryptedBytes: capture.bytes,
        restoreVerificationMs,
      });
      console.log(
        `${region}: ${checks.length} recovery groups passed; target remains sealed`,
      );
    } finally {
      for (const c of [op, pg])
        await docker(["rm", "-f", "-v", c]).catch(() => {});
      for (const v of volumes)
        await docker(["volume", "rm", v]).catch(() => {});
      await docker(["network", "rm", network]).catch(() => {});
    }
  }
  const leftovers = {
    containers: await docker(["ps", "-aq", "--filter", `name=${prefix}`]),
    volumes: await docker(["volume", "ls", "-q", "--filter", `name=${prefix}`]),
    networks: await docker([
      "network",
      "ls",
      "-q",
      "--filter",
      `name=${prefix}`,
    ]),
  };
  assert.ok(Object.values(leftovers).every((v) => !v));
  for (const volume of anonymousVolumes)
    await assert.rejects(docker(["volume", "inspect", volume]));
  report.anonymousVolumesRemoved = anonymousVolumes.size;
  report.remainingResources = { containers: 0, volumes: 0, networks: 0 };
  report.completedAt = new Date().toISOString();
  await writeFile(`${root}/report.json`, JSON.stringify(report, null, 2), {
    mode: 0o600,
  });
  console.log(`Recovery drill ${id} complete; no disposable resources remain`);
}
void main().catch(async (e) => {
  report.failed = true;
  await writeFile(
    `${root}/failure.log`,
    String(e.stack || e) + "\n" + String(e.stderr || ""),
    { mode: 0o600 },
  ).catch(() => {});
  await writeFile(`${root}/report.json`, JSON.stringify(report, null, 2), {
    mode: 0o600,
  }).catch(() => {});
  console.error(
    "Isolated recovery drill failed; inspect private diagnostics without publishing credentials.",
  );
  process.exitCode = 1;
});
