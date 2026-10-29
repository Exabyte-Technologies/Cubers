import { test } from "node:test";
import assert from "node:assert/strict";
import { createCipheriv } from "node:crypto";
import {
  GanGen2Codec,
  GoCubeCodec,
  GiikerCodec,
  SmartCubeSession,
  SmartCubeFrame,
  SMART_FIRST_SOLVE_REFERENCE,
  GAN_CORNERS,
  GAN_EDGES,
  GIIKER_CORNERS,
  GIIKER_EDGES,
  solvedCube,
  applyMoves,
  facelets,
  stateKey,
  FACES,
  ganSalt,
  smartBase64,
  smartBytes,
  smartCandidate,
  ganAdvertisementAddress,
  smartDeviceCatalogue,
  type CubeState,
  type SmartTransport,
  type GattChannel,
  type SmartSessionEvent,
} from "@cubers/core";

// All addresses and packets below are synthetic. No device capture or user key.
test("bounded native wire conversion matches platform base64 and rejects noncanonical values", () => {
  for (let length = 1; length <= 260; length++) {
    const bytes = Uint8Array.from(
      { length },
      (_, i) => (i * 31 + length) & 255,
    );
    assert.equal(smartBase64(bytes), Buffer.from(bytes).toString("base64"));
    assert.deepEqual(smartBytes(smartBase64(bytes)), bytes);
  }
  for (const value of [
    "",
    "A",
    "AAA",
    "AA?=",
    "AB==",
    "AAB=",
    "AA==AAAA",
    "A".repeat(352),
  ])
    assert.throws(() => smartBytes(value));
  assert.throws(() => smartBase64(new Uint8Array(261)));
});
test("candidate names and GAN advertisements cannot enable unsupported hardware", () => {
  assert.equal(smartCandidate("gan-356-i3", "GAN356i3"), true);
  assert.equal(smartCandidate("giiker-i3s", "GiS-i3S"), true);
  assert.equal(smartCandidate("giiker-i3s", "GiC"), false);
  assert.equal(smartCandidate("gocube-edge", "GoCube"), true);
  assert.equal(smartCandidate("gocube-edge", "GoCube X"), false);
  assert.equal(smartCandidate("gocube-edge", "Rubiks"), false);
  assert.equal(smartCandidate("gan-356-i3", "GAN\n"), false);
  assert.equal(
    ganAdvertisementAddress(
      Uint8Array.of(1, 2, 0, 0, 0, 188, 154, 120, 86, 52, 18),
    ),
    ADDRESS,
  );
  assert.equal(ganAdvertisementAddress(new Uint8Array(11)), undefined);
  assert.equal(ganAdvertisementAddress(new Uint8Array(9)), undefined);
  const catalogue = smartDeviceCatalogue();
  catalogue.splice(0);
  assert.equal(smartDeviceCatalogue().length, 3);
  assert.ok(
    smartDeviceCatalogue().every((d) => !d.enabled && !d.physicallyTested),
  );
});
const ADDRESS = "12:34:56:78:9a:bc";
const delay = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
function bits(
  bytes: Uint8Array,
  offset: number,
  length: number,
  value: number,
) {
  for (let i = 0; i < length; i++) {
    const at = offset + i,
      mask = 1 << (7 - (at % 8));
    bytes[at >> 3] =
      (bytes[at >> 3] & ~mask) | ((value >> (length - i - 1)) & 1 ? mask : 0);
  }
}
// Encode independent geometric facelets by searching piece identities/orientations.
function coordinates(state: CubeState, slots: number[][]) {
  const colors = FACES.flatMap((f) => facelets(state)[f]);
  return slots.map((slot) => {
    for (let piece = 0; piece < slots.length; piece++)
      for (let twist = 0; twist < slot.length; twist++)
        if (
          slot.every(
            (_, side) =>
              colors[slot[(side + twist) % slot.length]] ===
              FACES[Math.floor(slots[piece][side] / 9)],
          )
        )
          return [piece, twist];
    throw new Error("No geometric piece match");
  });
}
function ganState(codec: GanGen2Codec, state = solvedCube(), serial = 0) {
  const raw = new Uint8Array(20),
    corners = coordinates(state, GAN_CORNERS),
    edges = coordinates(state, GAN_EDGES);
  bits(raw, 0, 4, 4);
  bits(raw, 4, 8, serial);
  corners.slice(0, 7).forEach(([p, o], i) => {
    bits(raw, 12 + i * 3, 3, p);
    bits(raw, 33 + i * 2, 2, o);
  });
  edges.slice(0, 11).forEach(([p, o], i) => {
    bits(raw, 47 + i * 4, 4, p);
    bits(raw, 91 + i, 1, o);
  });
  return codec.encrypt(raw);
}
function ganMoves(codec: GanGen2Codec, serial: number, newest: string[]) {
  const raw = new Uint8Array(20);
  bits(raw, 0, 4, 2);
  bits(raw, 4, 8, serial);
  for (let i = 0; i < 7; i++) {
    const move = newest[i] || "U";
    bits(raw, 12 + 5 * i, 4, FACES.indexOf(move[0] as any));
    bits(raw, 16 + 5 * i, 1, move.endsWith("'") ? 1 : 0);
    bits(raw, 47 + 16 * i, 16, 50 + i);
  }
  return codec.encrypt(raw);
}
const GKEY = [
  176, 81, 104, 224, 86, 137, 237, 119, 38, 26, 193, 161, 210, 126, 150, 81, 93,
  13, 236, 249, 89, 235, 88, 24, 113, 81, 214, 131, 130, 199, 2, 169, 39, 165,
  171, 41,
];
function giikerState(state = solvedCube(), move = "U", encrypted = false) {
  const coMask = [-1, 1, -1, 1, 1, -1, 1, -1];
  const corners = coordinates(state, GIIKER_CORNERS),
    edges = coordinates(state, GIIKER_EDGES);
  const n = Array(40).fill(0);
  corners.forEach(([p, o], i) => {
    n[i] = p + 1;
    n[8 + i] = (3 + o * coMask[i]) % 3;
  });
  edges.forEach(([p, o], i) => {
    n[16 + i] = p + 1;
    n[28 + (i >> 2)] |= o << (3 - (i % 4));
  });
  n[32] = "?BDLURF".indexOf(move[0]);
  n[33] = move.endsWith("'") ? 3 : move.endsWith("2") ? 2 : 1;
  const raw = Uint8Array.from(
    { length: 20 },
    (_, i) => n[2 * i] * 16 + n[2 * i + 1],
  );
  if (encrypted) {
    raw[18] = 0xa7;
    raw[19] = 0x3c;
    for (let i = 0; i < 18; i++)
      raw[i] = (raw[i] - GKEY[i + 3] - GKEY[i + 12]) & 255;
  }
  return raw;
}
function frame(type: number, payload: number[] | Uint8Array) {
  const raw = Uint8Array.from([
    42,
    payload.length + 4,
    type,
    ...payload,
    0,
    13,
    10,
  ]);
  raw[raw.length - 3] = raw.slice(0, -3).reduce((a, b) => a + b, 0) & 255;
  return raw;
}
function goState(state = solvedCube()) {
  const values = FACES.flatMap((f) => facelets(state)[f]),
    wire: number[] = [];
  const axis = [5, 2, 0, 3, 1, 4],
    ring = [0, 1, 2, 5, 8, 7, 6, 3],
    offsets = [0, 0, 6, 2, 0, 0];
  for (let f = 0; f < 6; f++) {
    wire.push("BFUDRL".indexOf(values[axis[f] * 9 + 4]));
    for (let i = 0; i < 8; i++)
      wire.push(
        "BFUDRL".indexOf(values[axis[f] * 9 + ring[(i + offsets[f]) % 8]]),
      );
  }
  return frame(2, wire);
}
function decodedState(codec: any, packet: Uint8Array) {
  const result = codec.feed(packet, 10);
  assert.equal(result.length, 1);
  assert.equal(result[0].type, "state");
  return result[0].state as CubeState;
}
test("GAN overlap AES matches independent OpenSSL CBC and rejects invalid salts/lengths", () => {
  const codec = new GanGen2Codec(ADDRESS),
    salt = [188, 154, 120, 86, 52, 18];
  assert.deepEqual([...ganSalt(ADDRESS)], salt);
  const key = [1, 2, 66, 40, 49, 145, 22, 7, 32, 5, 24, 84, 66, 17, 18, 83],
    iv = [17, 3, 50, 40, 33, 1, 118, 39, 32, 149, 120, 20, 50, 18, 2, 67];
  for (let i = 0; i < 6; i++) {
    key[i] = (key[i] + salt[i]) % 255;
    iv[i] = (iv[i] + salt[i]) % 255;
  }
  const input = Uint8Array.from({ length: 20 }, (_, i) => i * 11),
    expected = input.slice();
  for (const at of [0, 4]) {
    const cipher = createCipheriv(
      "aes-128-cbc",
      Uint8Array.from(key),
      Uint8Array.from(iv),
    );
    cipher.setAutoPadding(false);
    expected.set(
      Buffer.concat([
        cipher.update(expected.slice(at, at + 16)),
        cipher.final(),
      ]),
      at,
    );
  }
  assert.deepEqual(codec.encrypt(input), expected);
  assert.deepEqual(codec.decrypt(expected), input);
  assert.deepEqual(
    input,
    Uint8Array.from({ length: 20 }, (_, i) => i * 11),
  );
  for (const address of [
    "",
    "12:34:56",
    "gg:34:56:78:9a:bc",
    "12-34-56-78-9a-bc",
  ])
    assert.throws(() => new GanGen2Codec(address));
  assert.throws(() => codec.feed(new Uint8Array(19)));
  codec.close();
  assert.throws(() => codec.encrypt(input));
});
test("three wire protocols reconstruct 100 independent legal geometric positions", () => {
  const gan = new GanGen2Codec(ADDRESS),
    giiker = new GiikerCodec(),
    go = new GoCubeCodec();
  let state = solvedCube();
  let seed = 91821;
  for (let i = 0; i < 100; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    state = applyMoves(state, [
      FACES[seed % 6] + ["", "'", "2"][(seed >>> 5) % 3],
    ]);
    for (const [codec, data] of [
      [gan, ganState(gan, state, i)],
      [giiker, giikerState(state, "R", i % 2 === 0)],
      [go, goState(state)],
    ] as const)
      assert.equal(
        stateKey(decodedState(codec, data)),
        stateKey(state),
        `${codec.profile.model} ${i}`,
      );
  }
});
test("wire validators reject corrupt pieces, twists, CRC, colors and truncated moves", () => {
  const gan = new GanGen2Codec(ADDRESS),
    raw = gan.decrypt(ganState(gan));
  bits(raw, 12, 3, 1);
  assert.throws(() => gan.feed(gan.encrypt(raw)));
  const g = giikerState();
  g[0] = 0x11;
  assert.throws(() => new GiikerCodec().feed(g));
  const twist = giikerState();
  twist[4] = 0x10;
  assert.throws(() => new GiikerCodec().feed(twist));
  assert.throws(() => new GiikerCodec().feed(new Uint8Array(19)));
  assert.throws(() => new GiikerCodec().battery(Uint8Array.of(0xb5, 101)));
  const crc = goState();
  crc[12] ^= 1;
  assert.throws(() => new GoCubeCodec().feed(crc, 0));
  assert.throws(() => new GoCubeCodec().feed(frame(1, [0]), 0));
  assert.throws(() => new GoCubeCodec().feed(frame(1, [12, 0]), 0));
  assert.throws(() => new GoCubeCodec().feed(frame(2, Array(54).fill(6)), 0));
  assert.throws(() => new GoCubeCodec().feed(Uint8Array.of(42, 0), 0));
});
test("GoCube buffers bounded split/coalesced frames and expires incomplete data", () => {
  const go = new GoCubeCodec(),
    state = goState();
  assert.deepEqual(go.feed(state.slice(0, 13), 0), []);
  assert.equal(go.partial, true);
  const rest = Uint8Array.from([...state.slice(13), ...frame(5, [67])]);
  const events = go.feed(rest, 12);
  assert.equal(events.length, 2);
  assert.deepEqual(events[1], { type: "battery", percent: 67 });
  assert.equal(go.partial, false);
  go.feed(state.slice(0, 4), 20);
  assert.throws(() => go.feed(state.slice(4), 1021));
  go.reset();
  assert.equal(go.partial, false);
  go.close();
  assert.throws(() => go.feed(state, 22));
});

class FakeTransport implements SmartTransport {
  listeners = new Map<
    string,
    { bytes: (b: Uint8Array) => void; error: () => void }
  >();
  disconnectListener?: () => void;
  writes: Uint8Array[] = [];
  removed = 0;
  disconnected = 0;
  subscriptions = 0;
  readValue = giikerState();
  readTask?: Promise<Uint8Array>;
  subscribeTask?: Promise<void>;
  failWrite = false;
  async has() {
    return true;
  }
  async read() {
    return this.readTask || this.readValue;
  }
  async write(_channel: GattChannel, bytes: Uint8Array) {
    if (this.failWrite) throw new Error("write failed");
    this.writes.push(bytes);
  }
  async subscribe(
    channel: GattChannel,
    bytes: (b: Uint8Array) => void,
    error: () => void,
  ) {
    this.subscriptions++;
    await this.subscribeTask;
    this.listeners.set(channel.characteristic, { bytes, error });
    return () => {
      this.removed++;
      this.listeners.delete(channel.characteristic);
    };
  }
  onDisconnect(callback: () => void) {
    this.disconnectListener = callback;
    return () => {
      this.disconnectListener = undefined;
    };
  }
  async disconnect() {
    this.disconnected++;
  }
  send(codec: any, value: Uint8Array) {
    this.listeners.get(codec.profile.state.characteristic)!.bytes(value);
  }
}
async function ganSession(
  serial = 0,
  listener: (e: SmartSessionEvent) => void = () => {},
) {
  const transport = new FakeTransport(),
    codec = new GanGen2Codec(ADDRESS),
    events: SmartSessionEvent[] = [];
  const session = new SmartCubeSession(transport, codec, (e) => {
    events.push(e);
    listener(e);
  });
  await session.start();
  transport.send(codec, ganState(codec, solvedCube(), serial));
  return { transport, codec, events, session };
}
test("session needs a real snapshot and explicit confirmation; returned states cannot mutate trust", async () => {
  const { transport, codec, session } = await ganSession(0, (e) => {
    if (e.type === "state") e.state.stickers.splice(0);
  });
  try {
    assert.equal(session.status, "confirm");
    assert.throws(() => session.confirm(applyMoves(solvedCube(), "R")));
    assert.equal(stateKey(session.snapshot!), stateKey(solvedCube()));
    session.snapshot!.stickers.splice(0);
    session.confirm();
    transport.send(codec, ganMoves(codec, 1, ["R"]));
    assert.equal(
      stateKey(session.snapshot!),
      stateKey(applyMoves(solvedCube(), "R")),
    );
  } finally {
    await session.close();
  }
  assert.equal(transport.listeners.size, 0);
  assert.equal(transport.disconnected, 1);
});
test("GAN counters handle wrap, recover seven turns, ignore duplicates and pause larger gaps", async () => {
  const { transport, codec, events, session } = await ganSession(254);
  try {
    session.confirm();
    transport.send(codec, ganMoves(codec, 0, ["U", "R"]));
    assert.equal(
      stateKey(session.snapshot!),
      stateKey(applyMoves(solvedCube(), "R U")),
    );
    let moves = events.filter((e) => e.type === "move");
    assert.deepEqual(
      moves.map((e) => e.move.deviceCounter),
      [255, 0],
    );
    assert.equal(moves[0].move.recovered, true);
    transport.send(codec, ganMoves(codec, 0, ["U", "R"]));
    assert.equal(events.filter((e) => e.type === "move").length, 2);
    transport.send(
      codec,
      ganMoves(codec, 7, ["F", "B", "L", "D", "U", "R", "F"]),
    );
    assert.equal(events.filter((e) => e.type === "move").length, 9);
    transport.send(codec, ganMoves(codec, 15, ["R"]));
    assert.equal(session.status, "resync");
    assert.equal(session.snapshot, null);
    await session.resync();
    assert.equal(session.status, "syncing");
    assert.throws(() => session.confirm());
    transport.send(codec, ganState(codec, solvedCube(), 15));
    assert.equal(session.status, "confirm");
    session.confirm();
  } finally {
    await session.close();
  }
});
test("GiiKER verifies every changed state; missed history pauses instead of guessing", async () => {
  const transport = new FakeTransport(),
    codec = new GiikerCodec(),
    events: SmartSessionEvent[] = [];
  const session = new SmartCubeSession(transport, codec, (e) => events.push(e));
  try {
    await session.start();
    session.confirm();
    transport.send(
      codec,
      giikerState(applyMoves(solvedCube(), "R"), "R", true),
    );
    assert.equal(session.status, "ready");
    assert.equal(events.filter((e) => e.type === "move").length, 1);
    transport.send(codec, giikerState(applyMoves(solvedCube(), "R"), "R"));
    assert.equal(events.filter((e) => e.type === "move").length, 1);
    transport.send(codec, giikerState(applyMoves(solvedCube(), "R U F"), "F"));
    assert.equal(session.status, "resync");
  } finally {
    await session.close();
  }
});
test("GoCube requests independent state verification and pauses mismatches", async () => {
  const transport = new FakeTransport(),
    codec = new GoCubeCodec(),
    events: SmartSessionEvent[] = [];
  const session = new SmartCubeSession(transport, codec, (e) => events.push(e));
  try {
    await session.start();
    transport.send(codec, goState());
    session.confirm();
    transport.send(codec, frame(1, [8, 0])); // R
    await delay();
    assert.equal(
      events.find((e) => e.type === "move")?.integrity,
      "pending-state",
    );
    transport.send(codec, goState(applyMoves(solvedCube(), "R")));
    assert.equal(session.status, "ready");
    transport.send(codec, frame(1, [4, 0]));
    transport.send(codec, goState());
    assert.equal(session.status, "resync");
  } finally {
    await session.close();
  }
});
test("no initial snapshot never falls back to solved", async () => {
  const transport = new FakeTransport(),
    codec = new GanGen2Codec(ADDRESS),
    session = new SmartCubeSession(transport, codec, () => {}, undefined, 20);
  try {
    await session.start();
    await delay(35);
    assert.equal(session.status, "resync");
    assert.equal(session.snapshot, null);
    assert.throws(() => session.confirm());
  } finally {
    await session.close();
  }
});
test("late state reads cannot overwrite a new synchronization epoch", async () => {
  const transport = new FakeTransport(),
    codec = new GiikerCodec();
  let resolve!: (value: Uint8Array) => void;
  transport.readTask = new Promise((r) => {
    resolve = r;
  });
  const session = new SmartCubeSession(
    transport,
    codec,
    () => {},
    undefined,
    20,
    100,
  );
  const started = session.start();
  await delay(35);
  assert.equal(session.status, "resync");
  transport.readTask = undefined;
  transport.readValue = giikerState(applyMoves(solvedCube(), "R"));
  await session.resync();
  resolve(giikerState());
  await started;
  assert.equal(
    stateKey(session.snapshot!),
    stateKey(applyMoves(solvedCube(), "R")),
  );
  await session.close();
});
test("late subscription completion is cancelled after operation timeout", async () => {
  const transport = new FakeTransport(),
    codec = new GiikerCodec();
  let resolve!: () => void;
  transport.subscribeTask = new Promise((r) => {
    resolve = r;
  });
  const session = new SmartCubeSession(
    transport,
    codec,
    () => {},
    undefined,
    50,
    15,
  );
  await assert.rejects(session.start(), /timed out/);
  resolve();
  await delay();
  assert.equal(session.status, "disconnected");
  assert.equal(transport.listeners.size, 0);
  assert.equal(transport.removed, 1);
});
test("concurrent GiiKER battery refreshes subscribe once and expose unknown battery safely", async () => {
  const transport = new FakeTransport(),
    codec = new GiikerCodec(),
    events: SmartSessionEvent[] = [];
  const session = new SmartCubeSession(transport, codec, (e) => events.push(e));
  try {
    await session.start();
    await Promise.all([session.requestBattery(), session.requestBattery()]);
    assert.equal(transport.subscriptions, 2);
    transport.listeners
      .get(codec.profile.battery!.notify.characteristic)!
      .bytes(Uint8Array.of(0xb5, 72));
    transport.listeners
      .get(codec.profile.battery!.notify.characteristic)!
      .bytes(Uint8Array.of(0xb5, 200));
    assert.deepEqual(
      events.filter((e) => e.type === "battery").map((e) => e.percent),
      [72, null],
    );
  } finally {
    await session.close();
  }
});
test("malformed data and disconnect clear the baseline and all subscriptions", async () => {
  const { transport, codec, session } = await ganSession();
  session.confirm();
  transport.send(codec, new Uint8Array(3));
  assert.equal(session.status, "resync");
  assert.equal(session.snapshot, null);
  transport.disconnectListener!();
  await delay();
  assert.equal(session.status, "disconnected");
  assert.equal(transport.listeners.size, 0);
  await session.close();
  assert.equal(transport.disconnected, 1);
});
test("GoCube continued turns cannot extend the verification deadline", async () => {
  const transport = new FakeTransport(),
    codec = new GoCubeCodec();
  const session = new SmartCubeSession(transport, codec, () => {});
  try {
    await session.start();
    transport.send(codec, goState());
    session.confirm();
    transport.send(codec, frame(1, [8, 0]));
    await delay(850);
    transport.send(codec, frame(1, [4, 0]));
    await delay(800);
    assert.equal(session.status, "resync");
    assert.equal(session.snapshot, null);
    assert.equal(transport.writes.filter((b) => b[0] === 51).length, 2);
  } finally {
    await session.close();
  }
});
test("explicit GAN verification retains its hardware counter and rejects a stale final position", async () => {
  const f = await ganSession(254);
  try {
    const initial = f.events.find((e) => e.type === "state");
    assert.equal(initial?.type === "state" && initial.deviceCounter, 254);
    f.session.confirm();
    await f.session.verifyState();
    f.transport.send(f.codec, ganState(f.codec, solvedCube(), 254));
    assert.equal(
      f.events.at(-1)?.type === "state" && (f.events.at(-1) as any).verified,
      true,
    );
    f.transport.send(f.codec, ganMoves(f.codec, 255, ["R"]));
    assert.equal((f.events.at(-1) as any).verified, false);
    await f.session.verifyState();
    f.transport.send(f.codec, ganState(f.codec, solvedCube(), 254));
    assert.equal(f.session.status, "resync");
    assert.equal(f.session.snapshot, null);
  } finally {
    await f.session.close();
  }
});
test("explicit GiiKER verification never applies a read overtaken by a notification", async () => {
  const transport = new FakeTransport(),
    codec = new GiikerCodec(),
    events: SmartSessionEvent[] = [];
  const session = new SmartCubeSession(transport, codec, (event) =>
    events.push(event),
  );
  try {
    await session.start();
    session.confirm();
    let release!: (value: Uint8Array) => void;
    transport.readTask = new Promise((resolve) => {
      release = resolve;
    });
    const verify = session.verifyState(),
      turned = applyMoves(solvedCube(), ["R"]);
    transport.send(codec, giikerState(turned, "R"));
    release(giikerState(solvedCube()));
    await verify;
    assert.equal(session.status, "ready");
    assert.equal(stateKey(session.snapshot!), stateKey(turned));
    assert.equal((events.at(-1) as any).verified, true);
  } finally {
    await session.close();
  }
});
test("transport failure and notification flooding cannot retain a trusted baseline", async () => {
  const transport = new FakeTransport();
  transport.failWrite = true;
  const session = new SmartCubeSession(
    transport,
    new GanGen2Codec(ADDRESS),
    () => {},
  );
  await assert.rejects(session.start(), /write failed/);
  assert.equal(transport.listeners.size, 0);
  assert.equal(session.status, "disconnected");
  const fixture = await ganSession();
  fixture.session.confirm();
  const gyro = new Uint8Array(20);
  bits(gyro, 0, 4, 1);
  const notification = fixture.codec.encrypt(gyro);
  for (let i = 0; i < 301; i++)
    fixture.transport.send(fixture.codec, notification);
  assert.equal(fixture.session.status, "resync");
  await fixture.session.close();
});

test("all three synthetic device sessions project confirmed states and turns into the beginner reference without upgrading trust", async () => {
  const reference = new SmartCubeFrame(SMART_FIRST_SOLVE_REFERENCE);
  for (const brand of ["gan", "go", "giiker"] as const) {
    const transport = new FakeTransport(),
      codec =
        brand === "gan"
          ? new GanGen2Codec(ADDRESS)
          : brand === "go"
            ? new GoCubeCodec()
            : new GiikerCodec(),
      events: SmartSessionEvent[] = [],
      errors: unknown[] = [];
    let hardware = applyMoves(solvedCube(), "R U' F2 L"),
      serial = 250;
    transport.readValue = giikerState(hardware);
    const session = new SmartCubeSession(transport, codec, (event) => {
      try {
        events.push(reference.project(event));
      } catch (error) {
        errors.push(error);
      }
    });
    const states = () =>
      events.filter(
        (e): e is Extract<SmartSessionEvent, { type: "state" }> =>
          e.type === "state",
      );
    const moves = () =>
      events.filter(
        (e): e is Extract<SmartSessionEvent, { type: "move" }> =>
          e.type === "move",
      );
    try {
      await session.start();
      if (brand === "gan")
        transport.send(
          codec,
          ganState(codec as GanGen2Codec, hardware, serial),
        );
      else if (brand === "go") transport.send(codec, goState(hardware));
      assert.equal(session.status, "confirm", brand);
      assert.equal(states().at(-1)!.verified, false);
      assert.equal(moves().length, 0);
      session.confirm();
      assert.equal(states().at(-1)!.verified, true);
      for (const move of FACES.flatMap((f) => [f, f + "'"])) {
        hardware = applyMoves(hardware, move);
        if (brand === "gan") {
          serial = (serial + 1) & 255;
          transport.send(
            codec,
            ganMoves(codec as GanGen2Codec, serial, [move]),
          );
        } else if (brand === "go") {
          const axis = [5, 2, 0, 3, 1, 4],
            code =
              axis.indexOf(FACES.indexOf(move[0] as any)) * 2 +
              (move.endsWith("'") ? 1 : 0);
          transport.send(codec, frame(1, [code, 0]));
          assert.equal(moves().at(-1)!.integrity, "pending-state");
          assert.equal(states().at(-1)!.verified, false);
        } else transport.send(codec, giikerState(hardware, move));
        const mapped = moves().at(-1)!;
        assert.equal(mapped.move.move, reference.toTeachingMove(move));
        assert.equal(
          mapped.integrity,
          brand === "gan"
            ? "counter"
            : brand === "go"
              ? "pending-state"
              : "state",
        );
        assert.equal(
          stateKey(states().at(-1)!.state),
          stateKey(applyMoves(hardware, "z2")),
        );
        if (brand === "gan")
          transport.send(
            codec,
            ganState(codec as GanGen2Codec, hardware, serial),
          );
        else if (brand === "go") transport.send(codec, goState(hardware));
        assert.equal(states().at(-1)!.verified, true);
      }
      assert.equal(moves().length, 12);
      if (brand === "gan")
        transport.send(
          codec,
          ganMoves(codec as GanGen2Codec, (serial + 8) & 255, ["R"]),
        );
      else if (brand === "go")
        transport.send(codec, goState(applyMoves(hardware, "R U")));
      else transport.send(codec, giikerState(applyMoves(hardware, "R U"), "U"));
      assert.equal(session.status, "resync");
      assert.equal(session.snapshot, null);
      assert.equal(events.at(-1)!.type, "status");
      assert.equal(errors.length, 0);
      assert.ok(
        smartDeviceCatalogue().every((d) => !d.enabled && !d.physicallyTested),
      );
    } finally {
      await session.close();
    }
    assert.equal(transport.listeners.size, 0);
    assert.deepEqual(events.at(-1), { type: "status", phase: "disconnected" });
  }
});
