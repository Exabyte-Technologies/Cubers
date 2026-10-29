import test from "node:test";
import assert from "node:assert/strict";
import {
  invitationFromParams,
  invitationLink,
  invitationSignIn,
  authContinuation,
} from "../apps/mobile/src/invitations";
const club = {
  kind: "club" as const,
  code: "b8162bae-398b-4439-9d18-7e6891aa0ea2",
  community: "CN" as const,
};
test("invitation continuation only accepts bounded app actions and scalar query values", () => {
  assert.deepEqual(invitationFromParams(club), club);
  assert.deepEqual(invitationFromParams({ kind: "room", code: "abc_12-Xyz" }), {
    kind: "room",
    code: "abc_12-Xyz",
  });
  for (const value of [
    { ...club, kind: "https://evil.invalid" },
    { ...club, code: [club.code] },
    { ...club, community: ["CN"] },
    { ...club, community: "EU" },
    { ...club, code: "../admin" },
    { kind: "room", code: "abc123?redirect=x" },
    { kind: "room", code: "a".repeat(31) },
    { kind: "room", code: "12345" },
  ])
    assert.equal(invitationFromParams(value), null);
});
test("sign-in preserves only the validated invitation and cannot select a foreign URL", () => {
  const href = invitationSignIn(club);
  assert.equal(href.pathname, "/");
  assert.deepEqual(
    authContinuation({
      ...href.params,
      redirect: "https://evil.invalid",
      token: "ignored",
    }),
    { pathname: "/invitation", params: club },
  );
  assert.equal(
    authContinuation({ continuation: "https://evil.invalid", ...club }),
    "/(tabs)",
  );
  assert.equal(
    authContinuation({
      continuation: "invitation",
      ...club,
      code: "%2f%2fevil.invalid",
    }),
    "/(tabs)",
  );
  assert.equal(
    invitationLink(club),
    `cubers://invitation?kind=club&code=${club.code}&community=CN`,
  );
  assert.throws(() => invitationLink({ ...club, code: "x&community=INTL" }));
});
test("development invitations target the separately registered app without changing production links", () => {
  const invitations = [
    club,
    {
      kind: "room" as const,
      code: "synthetic-room",
      community: "INTL" as const,
    },
    {
      kind: "replay" as const,
      code: club.code,
      key: "a".repeat(43),
      community: "INTL" as const,
    },
  ];
  for (const invite of invitations) {
    const production = invitationLink(invite);
    assert.equal(invitationLink(invite, false), production);
    assert.ok(production.startsWith("cubers://invitation?"));
    assert.equal(
      invitationLink(invite, true),
      production.replace(/^cubers:/, "cubers-dev:"),
    );
    const generated = new URL(invitationLink(invite, true));
    assert.deepEqual(
      invitationFromParams(Object.fromEntries(generated.searchParams)),
      invite,
    );
  }
  assert.throws(() =>
    invitationLink({ ...club, code: "x&community=INTL" }, true),
  );
});
