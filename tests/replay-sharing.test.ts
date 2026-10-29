import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PrepareReplayShare,
  ReplaySharePublish,
  ReplayShareApproval,
  OpenReplayShare,
} from "@cubers/core";
import {
  invitationFromParams,
  invitationLink,
  authContinuation,
  invitationSignIn,
} from "../apps/mobile/src/invitations";
const id = "433b3679-9ba4-484f-821f-7f5cb183308b",
  key = "a".repeat(43),
  digest = "b".repeat(64);
test("replay sharing contracts require specific source, exact approval and explicit disclosure", () => {
  assert.equal(
    PrepareReplayShare.safeParse({ attemptId: id, disclosureConfirmed: true })
      .success,
    true,
  );
  for (const body of [
    { attemptId: id },
    { attemptId: id, disclosureConfirmed: false },
    { attemptId: id, disclosureConfirmed: true, packet: { moves: [] } },
  ])
    assert.equal(PrepareReplayShare.safeParse(body).success, false);
  const approval = {
    revision: 1,
    packetDigest: digest,
    receipt: key,
    approve: true,
    packetChecked: true,
  };
  assert.equal(ReplayShareApproval.safeParse(approval).success, true);
  assert.equal(
    ReplayShareApproval.safeParse({ ...approval, packetChecked: false })
      .success,
    false,
  );
  assert.equal(
    ReplayShareApproval.safeParse({ ...approval, approve: false, reason: "" })
      .success,
    false,
  );
  assert.equal(
    ReplayShareApproval.safeParse({
      ...approval,
      approve: false,
      reason: "Unsafe disclosure",
    }).success,
    true,
  );
  assert.equal(
    ReplaySharePublish.safeParse({
      revision: 1,
      packetDigest: digest,
      disclosureConfirmed: true,
    }).success,
    true,
  );
  assert.equal(OpenReplayShare.safeParse({ id, key }).success, true);
  assert.equal(
    OpenReplayShare.safeParse({ id, key: key + "a" }).success,
    false,
  );
});
test("shared replay invitations bind region, bounded secret and sign-in continuation without arbitrary destinations", () => {
  const invite = {
    kind: "replay" as const,
    code: id,
    key,
    community: "INTL" as const,
  };
  assert.deepEqual(invitationFromParams(invite), invite);
  const url = new URL(invitationLink(invite));
  assert.equal(url.hostname, "invitation");
  assert.equal(url.searchParams.get("key"), key);
  assert.deepEqual(
    authContinuation(invitationSignIn(invite).params).params,
    invite,
  );
  for (const patch of [
    { key: undefined },
    { key: [key] },
    { key: "a".repeat(44) },
    { community: undefined },
    { community: "CN?redirect=https://evil.invalid" },
    { code: "../admin" },
    { code: [id] },
    { kind: "https://evil.invalid" },
  ])
    assert.equal(invitationFromParams({ ...invite, ...patch }), null);
  assert.equal(
    Object.hasOwn(
      invitationFromParams({ kind: "room", code: "abc123", key })!,
      "key",
    ),
    false,
  );
});
test("replay withdrawal journal events remain distinct from media backup policy", async () => {
  const { DeletionRecord, validateMediaEvent } =
      await import("../apps/api/src/deletion-journal"),
    { backupPrivacy } = await import("../apps/api/src/media-vault-policy"),
    { randomUUID } = await import("node:crypto");
  const record = DeletionRecord.parse({
    version: 2,
    id: randomUUID(),
    region: "INTL",
    installationId: randomUUID(),
    requestedAt: new Date().toISOString(),
    ids: [randomUUID()],
    sequence: 1,
    kind: "REPLAY_SHARE_WITHDRAWAL",
    shareId: randomUUID(),
    decision: "REJECTED",
  });
  validateMediaEvent(record);
  const policy = backupPrivacy([record]);
  assert.equal(policy.deadlines.size, 0);
  assert.equal(policy.erasedMedia.size, 0);
  assert.equal(policy.withdrawals.size, 0);
  assert.equal(
    DeletionRecord.safeParse({ ...record, decision: "READY" }).success,
    false,
  );
  assert.equal(
    DeletionRecord.safeParse({ ...record, key: "secret-link" }).success,
    false,
  );
});
