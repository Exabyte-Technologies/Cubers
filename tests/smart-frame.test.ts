import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SmartCubeFrame,
  SmartReference,
  SMART_FIRST_SOLVE_REFERENCE,
  SMART_HARDWARE_REFERENCE,
  FACES,
  applyMoves,
  facelets,
  solvedCube,
  stateKey,
  whiteDownFrame,
  type CubeState,
  type Face,
  type SmartSessionEvent,
} from "@cubers/core";

type Vector = [number, number, number];
const normal: Record<Face, Vector> = {
  U: [0, 1, 0],
  D: [0, -1, 0],
  R: [1, 0, 0],
  L: [-1, 0, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
};
const dot = (a: Vector, b: Vector) => a.reduce((n, v, i) => n + v * b[i], 0);
const cross = (a: Vector, b: Vector): Vector => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
function axes(reference: SmartReference): Vector[] {
  const up = normal[reference.up],
    front = normal[reference.front];
  return [cross(up, front), up, front];
}
// Independent basis projection: no rotation enumeration, frame mapper, or cube
// turn routine is used to compute expected sticker positions/normals.
function expected(state: CubeState, reference: SmartReference): CubeState {
  const basis = axes(reference);
  return {
    size: 3,
    stickers: state.stickers.map((s) => ({
      color: s.color,
      p: basis.map(
        (axis) => dot(s.p.map((v) => v - 1) as Vector, axis) + 1,
      ) as Vector,
      normal: basis.map((axis) => dot(s.normal, axis)) as Vector,
    })),
  };
}
const references = FACES.flatMap((up) =>
  FACES.map((front) => ({ up, front })),
).filter((ref) => dot(normal[ref.up], normal[ref.front]) === 0);
const turns = FACES.flatMap((f) => [f, f + "'", f + "2"]);
const ordered = (state: CubeState) =>
  [...state.stickers].sort((a, b) =>
    JSON.stringify([a.p, a.normal]).localeCompare(
      JSON.stringify([b.p, b.normal]),
    ),
  );

test("smart references admit exactly 24 proper holds and reject malformed or opposite centers", () => {
  assert.equal(references.length, 24);
  for (const up of FACES)
    for (const front of FACES) {
      const valid = dot(normal[up], normal[front]) === 0;
      assert.equal(SmartReference.safeParse({ up, front }).success, valid);
      if (!valid) assert.throws(() => new SmartCubeFrame({ up, front }));
    }
  for (const value of [
    null,
    [],
    {},
    { up: "white", front: "F" },
    { up: "U", front: "F", guessed: true },
    { up: "U" },
  ])
    assert.equal(SmartReference.safeParse(value).success, false);
});
test("all 24 frames preserve every sticker and match an independent coordinate basis on scrambled states", () => {
  let state = solvedCube();
  for (let i = 0; i < 24; i++) {
    state = applyMoves(state, turns[(i * 7 + 3) % turns.length]);
    const original = structuredClone(state);
    for (const reference of references) {
      const mapper = new SmartCubeFrame(reference),
        mapped = mapper.toTeachingState(state);
      assert.deepEqual(ordered(mapped), ordered(expected(state, reference)));
      assert.equal(stateKey(mapper.toHardwareState(mapped)), stateKey(state));
      const centers = facelets(mapped);
      assert.equal(centers.U[4], reference.up);
      assert.equal(centers.F[4], reference.front);
    }
    assert.deepEqual(state, original);
  }
});
test("all face, prime and half turns conjugate correctly in every teaching reference", () => {
  const hardware = applyMoves(solvedCube(), "R U2 F' L D B2 R'");
  for (const reference of references) {
    const mapper = new SmartCubeFrame(reference),
      basis = axes(reference);
    for (const move of turns) {
      const projectedNormal = basis.map((axis) =>
          dot(normal[move[0] as Face], axis),
        ),
        face = FACES.find((f) =>
          normal[f].every((v, i) => v === projectedNormal[i]),
        )!,
        mapped = mapper.toTeachingMove(move);
      assert.equal(mapped, face + move.slice(1));
      assert.equal(mapper.toHardwareMove(mapped), move);
      assert.equal(
        stateKey(mapper.toTeachingState(applyMoves(hardware, move))),
        stateKey(applyMoves(mapper.toTeachingState(hardware), mapped)),
      );
    }
  }
});
test("beginner reference exactly matches existing teaching and preserves clockwise direction", () => {
  const frame = new SmartCubeFrame(SMART_FIRST_SOLVE_REFERENCE),
    cube = applyMoves(solvedCube(), "F R U' L2 B D R2");
  assert.equal(
    stateKey(frame.toTeachingState(cube)),
    stateKey(whiteDownFrame(cube).cube),
  );
  const faces: Record<Face, Face> = {
    U: "D",
    D: "U",
    R: "L",
    L: "R",
    F: "F",
    B: "B",
  };
  for (const f of FACES)
    for (const suffix of ["", "'", "2"])
      assert.equal(frame.toTeachingMove(f + suffix), faces[f] + suffix);
  const identity = new SmartCubeFrame(SMART_HARDWARE_REFERENCE);
  assert.deepEqual(ordered(identity.toTeachingState(cube)), ordered(cube));
  for (const move of turns) assert.equal(identity.toTeachingMove(move), move);
});
test("projection preserves provisional/counter/timing metadata and cannot mutate the source event", () => {
  const frame = new SmartCubeFrame(SMART_FIRST_SOLVE_REFERENCE);
  for (const integrity of ["counter", "state", "pending-state"] as const) {
    const event: SmartSessionEvent = {
        type: "move",
        sequence: 71,
        receivedAt: 123.5,
        integrity,
        move: {
          move: "R'",
          deviceCounter: 255,
          deviceElapsedMs: null,
          recovered: true,
        },
      },
      before = structuredClone(event),
      projected = frame.project(event);
    assert.deepEqual(projected, {
      ...before,
      move: { ...before.move, move: "L'" },
    });
    assert.equal(projected.type, "move");
    if (projected.type === "move") projected.move.move = "B";
    assert.deepEqual(event, before);
  }
  for (const verified of [false, true]) {
    const event: SmartSessionEvent = {
        type: "state",
        state: solvedCube(),
        verified,
      },
      mapped = frame.project(event);
    assert.ok(mapped.type === "state");
    assert.equal(mapped.verified, verified);
    mapped.state.stickers.splice(0);
    assert.equal(event.state.stickers.length, 54);
  }
  for (const event of [
    { type: "status", phase: "resync", reason: "move-gap" },
    { type: "status", phase: "disconnected" },
    { type: "battery", percent: null },
  ] as SmartSessionEvent[])
    assert.deepEqual(frame.project(event), event);
});
test("invalid turns, changed hardware centers and impossible states cannot enter frame projection", () => {
  const frame = new SmartCubeFrame(SMART_FIRST_SOLVE_REFERENCE);
  for (const move of ["x", "R3", "Rw", "M", "r", "U2'", "R U", "", " R", "R\n"])
    for (const method of ["toTeachingMove", "toHardwareMove"] as const)
      assert.throws(() => frame[method](move));
  assert.throws(() => frame.toTeachingState(solvedCube(2)));
  assert.throws(() => frame.toTeachingState(solvedCube(4)));
  assert.throws(() => frame.toTeachingState(applyMoves(solvedCube(), "x")));
  assert.throws(() => frame.toHardwareState(solvedCube()));
  const flipped = solvedCube(),
    edge = flipped.stickers.filter((s) => s.p.join() === "2,2,1");
  [edge[0].color, edge[1].color] = [edge[1].color, edge[0].color];
  assert.throws(() => frame.toTeachingState(flipped));
  const broken = solvedCube();
  broken.stickers.pop();
  assert.throws(() => frame.toTeachingState(broken));
});
test("references, output snapshots and returned instructions cannot change a mapper's connection reference", () => {
  const reference: SmartReference = { up: "D", front: "F" },
    mapper = new SmartCubeFrame(reference);
  reference.up = "U";
  assert.equal(mapper.toTeachingMove("R"), "L");
  assert.equal(Object.isFrozen(mapper.reference), true);
  assert.equal(Object.isFrozen(mapper), true);
  assert.equal(Reflect.set(mapper.reference, "up", "U"), false);
  assert.equal(
    Reflect.set(mapper, "reference", SMART_HARDWARE_REFERENCE),
    false,
  );
  const before = stateKey(mapper.toTeachingState(solvedCube()));
  mapper.toTeachingState(solvedCube()).stickers.splice(0);
  assert.equal(stateKey(mapper.toTeachingState(solvedCube())), before);
});
