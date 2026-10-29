import test from "node:test";
import assert from "node:assert/strict";
import { authenticator } from "otplib";
import {
  mkdtemp,
  chmod,
  symlink,
  link,
  rm,
  readFile,
  writeFile,
  stat,
  realpath,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkedMfaStep } from "../apps/api/src/staff-access";
import {
  readStaffFile,
  writeStaffFile,
  consumeStaffFile,
} from "../apps/api/src/staff-files";
test("staff factor verification accepts one current step and refuses reused, stale or malformed codes", () => {
  const now = 1800000010000,
    secret = authenticator.generateSecret(),
    otp = authenticator.clone({ epoch: now }).generate(secret),
    step = Math.floor(now / 30000);
  assert.equal(
    checkedMfaStep({ mfaSecret: secret, mfaLastStep: -1 }, otp, now),
    step,
  );
  assert.throws(() =>
    checkedMfaStep({ mfaSecret: secret, mfaLastStep: step }, otp, now),
  );
  assert.throws(() =>
    checkedMfaStep({ mfaSecret: secret, mfaLastStep: -1 }, otp, now + 60000),
  );
  assert.throws(() =>
    checkedMfaStep({ mfaSecret: null, mfaLastStep: -1 }, otp, now),
  );
  for (const code of [123456, "12345", "<123456>", "0".repeat(1000)])
    assert.throws(() =>
      checkedMfaStep({ mfaSecret: secret, mfaLastStep: -1 }, code, now),
    );
});
test("operator files are exclusive, private, bounded, unlinked only when unchanged and reject links", async () => {
  const dir = await realpath(
    await mkdtemp(join(tmpdir(), "cubers-staff-files-")),
  );
  await chmod(dir, 0o700);
  try {
    const path = join(dir, "plan.json"),
      second = join(dir, "second.json");
    await writeStaffFile(path, { private: "synthetic" });
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    const input = await readStaffFile(path);
    assert.deepEqual(input.value, { private: "synthetic" });
    await assert.rejects(writeStaffFile(path, {}));
    await chmod(path, 0o644);
    await assert.rejects(readStaffFile(path));
    await chmod(path, 0o600);
    await symlink(path, second);
    await assert.rejects(readStaffFile(second));
    await rm(second);
    await link(path, second);
    await assert.rejects(readStaffFile(path));
    await rm(second);
    await assert.rejects(writeStaffFile(second, { large: "x".repeat(16000) }));
    await chmod(dir, 0o755);
    await assert.rejects(readStaffFile(path));
    await chmod(dir, 0o700);
    await writeStaffFile(second, { replacement: true });
    const other = await readStaffFile(second);
    await assert.rejects(consumeStaffFile(path, other.identity));
    assert.deepEqual(JSON.parse(await readFile(path, "utf8")), {
      private: "synthetic",
    });
    await consumeStaffFile(path, input.identity);
    await assert.rejects(readFile(path));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
