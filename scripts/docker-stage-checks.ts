import assert from "node:assert/strict";
import {
  guidedFacelets,
  guidedState,
  lessonStageSetup,
  lessonStageComplete,
  practiceApply,
  DownloadedLesson,
  openOfflineGuidance,
  type GuidedSolveView,
} from "@cubers/core";

type Result = { status: number; body: any };
export async function checkStageLessons(h: {
  request: (path: string, body?: unknown, method?: string) => Promise<Result>;
  compiled: (code: string) => Promise<string>;
}) {
  const call = h.request;
  const course = await call("courses/3-corners");
  assert.equal(course.status, 200);
  const mismatch = await call("first-solves", {
    input: "scan",
    puzzle: "3x3",
    lessonId: "3-corners",
    courseVersion: course.body.version,
    faces: guidedFacelets(lessonStageSetup("3-cross").state),
  });
  assert.equal(mismatch.status, 409);
  assert.equal(mismatch.body.code, "LESSON_STAGE_MISMATCH");
  assert.equal(mismatch.body.lessonStage.actualLessonId, "3-cross");
  const before = (await call("progress")).body;
  for (const [id, input] of [
    ["3-corners", "virtual"],
    ["3-middle", "scan"],
    ["2-beginner", "virtual"],
    ["4-reduction", "virtual"],
    ["pyr-intuitive", "virtual"],
  ] as const) {
    const definition = lessonStageSetup(id),
      content = await call(`courses/${id}`);
    assert.equal(content.status, 200);
    const start = await call("first-solves", {
      input,
      puzzle: content.body.content.puzzle,
      lessonId: id,
      courseVersion: content.body.version,
      ...(input === "scan" ? { faces: guidedFacelets(definition.state) } : {}),
    });
    assert.equal(start.status, 201, `${id} lesson could not start`);
    let view = start.body as GuidedSolveView;
    assert.equal(view.lessonId, id);
    assert.deepEqual(view.currentFaces, guidedFacelets(definition.state));
    const download = await call(`first-solves/${view.id}/download`, {
      version: view.version,
    });
    assert.equal(download.status, 201);
    const packet = DownloadedLesson.parse(download.body);
    assert.equal(packet.guidedPractice!.lessonId, id);
    const offline = await openOfflineGuidance(packet);
    if (input === "scan")
      offline.resumePhysical(packet.guidedPractice!.startingFaces);
    let offlineChecks = 0;
    while (!offline.view().completed) {
      assert.ok(++offlineChecks <= 32);
      const step = offline.view().step!;
      const target = practiceApply(
        guidedState(view.puzzle!, offline.view().faces),
        step.moves,
      );
      for (const move of step.moves) offline.turn(move);
      offline.checkpoint(input === "scan" ? guidedFacelets(target) : undefined);
    }
    assert.equal(offline.view().completed, true);
    let count = 0;
    while (view.status === "ACTIVE") {
      assert.ok(++count <= 32, id);
      const moves = view.step!.moves,
        target = practiceApply(
          guidedState(view.puzzle!, view.currentFaces),
          moves,
        );
      if (input === "scan")
        assert.equal(
          (
            await call(`first-solves/${view.id}/checkpoint`, {
              version: view.version,
            })
          ).status,
          400,
        );
      else
        for (let index = 0; index < moves.length; index += 100) {
          const moved = await call(`first-solves/${view.id}/moves`, {
            version: view.version,
            moves: moves.slice(index, index + 100),
          });
          assert.equal(moved.status, 201);
          view = moved.body;
        }
      const checked = await call(`first-solves/${view.id}/checkpoint`, {
        version: view.version,
        ...(input === "scan" ? { faces: guidedFacelets(target) } : {}),
      });
      assert.equal(checked.status, 201, `${id} checkpoint did not verify`);
      view = checked.body;
    }
    assert.equal(view.status, "COMPLETED");
    assert.equal(
      lessonStageComplete(guidedState(view.puzzle!, view.currentFaces), id),
      true,
    );
    assert.equal(
      (
        await call(`first-solves/${view.id}/checkpoint`, {
          version: view.version,
          ...(input === "scan" ? { faces: view.currentFaces } : {}),
        })
      ).status,
      409,
    );
    const history = await call(
      `first-solves?puzzle=${view.puzzle}&lessonId=${id}`,
    );
    assert.ok(history.body.items.some((row: any) => row.id === view.id));
    const full = await call(`first-solves?puzzle=${view.puzzle}`);
    assert.ok(!full.body.items.some((row: any) => row.id === view.id));
  }
  const after = (await call("progress")).body;
  for (const row of before.filter((row: any) =>
    row.lessonId.endsWith("first-solve"),
  ))
    assert.deepEqual(
      after.find((now: any) => now.lessonId === row.lessonId),
      row,
    );
  const smart = JSON.parse(
    await h.compiled(`
    require('reflect-metadata');const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{PrismaClient}=require('@prisma/client'),core=require('@cubers/core'),{Infrastructure}=require('./apps/api/dist/services'),{readConfig}=require('./apps/api/dist/config'),{accountPolicy}=require('./apps/api/dist/security'),{SmartLessonAccess}=require('./apps/api/dist/smart-learning.controller'),{SmartFirstSolveController}=require('./apps/api/dist/smart-first-solve.controller'),{FirstSolveSolver}=require('./apps/api/dist/first-solve-solver');
    const db=new PrismaClient(),infra=new Infrastructure(readConfig()),solver=new FirstSolveSolver();
    class SyntheticAcceptance extends SmartLessonAccess{require(){}}
    try {
      const user=await db.user.create({data:{email:randomUUID()+'@cubers.invalid',displayName:'Synthetic stage-device stream',passwordHash:'unused',birthDate:'1990-01-01',region:process.env.REGION,emailVerified:true,adultVerified:true}}),session=await db.session.create({data:{userId:user.id,tokenHash:randomUUID(),expiresAt:new Date(Date.now()+60000)}}),actor={user,sessionId:session.id,policy:await accountPolicy(db,user)},course=await db.course.findUniqueOrThrow({where:{id:'3-corners'}}),frame=new core.SmartCubeFrame(core.SMART_FIRST_SOLVE_REFERENCE),service=new SmartFirstSolveController(db,infra,new SyntheticAcceptance(),solver);
      await assert.rejects(service.create(actor,{lessonId:course.id,model:'gan-356-i3',platform:'ios',courseVersion:course.version,faces:core.facelets(frame.toHardwareState(core.lessonStageSetup('3-cross').state)),counter:250}),e=>e.getStatus?.()===409);
      let hardware=frame.toHardwareState(core.lessonStageSetup(course.id).state),row=await service.create(actor,{lessonId:course.id,model:'gan-356-i3',platform:'ios',courseVersion:course.version,faces:core.facelets(hardware),counter:250}),sequence=0;
      while(row.status==='PRACTICING'){
        assert.equal(row.guidance.step.goal,'corner');
        for(const turn of row.guidance.step.moves){const raw=frame.toHardwareMove(turn),moves=raw.endsWith('2')?[raw[0],raw[0]]:[raw];for(const move of moves){hardware=core.applyMoves(hardware,[move]);const n=sequence++;row=await service.action(actor,row.id,{action:'turns',version:row.version,epoch:row.smart.epoch,turns:[{sequence:n,move,receivedAt:100+n,counter:(251+n)&255,recovered:false}],faces:core.facelets(hardware),counter:(250+sequence)&255,independentState:true});}}
        row=await service.action(actor,row.id,{action:'checkpoint',version:row.version,epoch:row.smart.epoch,faces:core.facelets(hardware),counter:(250+sequence)&255});
      }
      assert.equal(row.status,'COMPLETED');assert.equal(core.lessonStageComplete(frame.toTeachingState(hardware),course.id),true);
      assert.equal(await db.progress.count({where:{userId:user.id,lessonId:'3-first-solve'}}),0);
      assert.equal((await db.progress.findUniqueOrThrow({where:{userId_lessonId:{userId:user.id,lessonId:course.id}}})).completed,true);
      await assert.rejects(db.guidedSolve.update({where:{id:row.id},data:{courseId:'3-notation'}}));
      assert.throws(()=>new SmartLessonAccess().require('gan-356-i3','ios'),e=>e.getStatus?.()===403);
      console.log(JSON.stringify({stage:'3-corners',completed:true,unrelatedSmartCoursesRejected:true,hardwareEnabled:false}));
    }finally{await solver.onModuleDestroy();await db.$disconnect();await infra.close();}
  `),
  );
  assert.deepEqual(smart, {
    stage: "3-corners",
    completed: true,
    unrelatedSmartCoursesRejected: true,
    hardwareEnabled: false,
  });
}
