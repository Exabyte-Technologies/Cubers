import { test } from "node:test";
import assert from "node:assert/strict";
import { NotificationPreferences, NotificationCategory } from "@cubers/core";
import {
  notificationPreferences,
  notificationCategories,
} from "../apps/api/src/notifications";
test("notification preferences accept only optional boolean categories", () => {
  assert.deepEqual(
    NotificationPreferences.parse({ connections: false, clubs: true }),
    { connections: false, clubs: true },
  );
  for (const value of [
    { connections: false, clubs: false, review: false },
    { connections: "false", clubs: true },
    { connections: false },
  ])
    assert.equal(NotificationPreferences.safeParse(value).success, false);
  assert.equal(NotificationCategory.safeParse("ADVERTISEMENT").success, false);
});
test("legacy defaults keep required notices while malformed optional settings fail closed", () => {
  assert.deepEqual(notificationPreferences({ notificationSettings: {} }), {
    connections: true,
    clubs: true,
  });
  assert.deepEqual(
    notificationCategories({
      notificationSettings: { connections: false, clubs: false },
    }),
    ["SYSTEM", "REVIEW"],
  );
  for (const raw of [null, [], "bad", { connections: "true" }])
    assert.deepEqual(
      notificationPreferences({ notificationSettings: raw as any }),
      { connections: false, clubs: false },
    );
});
test("muting a category never mutes account safety or review status", () => {
  assert.deepEqual(
    notificationCategories({ notificationSettings: {} }, false),
    ["SYSTEM", "REVIEW"],
  );
  for (const connections of [true, false])
    for (const clubs of [true, false]) {
      const categories = notificationCategories({
        notificationSettings: { connections, clubs },
      });
      assert.ok(categories.includes("SYSTEM") && categories.includes("REVIEW"));
      assert.equal(categories.includes("CONNECTION"), connections);
      assert.equal(categories.includes("CLUB"), clubs);
    }
});
