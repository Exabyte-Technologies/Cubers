import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PracticeReminders,
  reminderDates,
  type ReminderDriver,
  type ReminderPreference,
} from "../apps/mobile/src/reminders/controller";
class Driver implements ReminderDriver {
  preference: ReminderPreference | null = null;
  dates: Date[] = [];
  prompts: boolean[] = [];
  granted = true;
  permissionWait?: Promise<boolean>;
  failAt = -1;
  async read() {
    return this.preference;
  }
  async save(p: ReminderPreference | null) {
    this.preference = p;
  }
  async allowed(prompt: boolean) {
    this.prompts.push(prompt);
    return this.permissionWait || this.granted;
  }
  async clearOwned() {
    this.dates = [];
  }
  async schedule(date: Date, _locale: any, index: number) {
    if (index === this.failAt) throw Error("OS failure");
    this.dates.push(date);
  }
}
const owner = { id: "owner", region: "INTL" as const };
test("local reminder dates follow the chosen calendar time for seven future days", () => {
  const now = new Date(2026, 9, 16, 20, 0).getTime(),
    dates = reminderDates(19, 15, now);
  assert.equal(dates.length, 7);
  assert.equal(dates[0].getDate(), 17);
  assert.ok(
    dates.every(
      (d) => d.getTime() > now && d.getHours() === 19 && d.getMinutes() === 15,
    ),
  );
  assert.equal(dates[6].getDate(), 23);
  for (const [h, m] of [
    [24, 0],
    [-1, 0],
    [12, 60],
    [1.5, 0],
    [12, -1],
  ])
    assert.throws(() => reminderDates(h, m));
});
test("reminders default off and only explicit enable requests notification permission", async () => {
  const driver = new Driver(),
    reminders = new PracticeReminders(driver, () =>
      new Date(2026, 9, 16, 12).getTime(),
    );
  reminders.setContext(owner);
  assert.equal(await reminders.status(), null);
  assert.deepEqual(driver.prompts, []);
  await reminders.enable(19, 0, "zh");
  assert.deepEqual(driver.prompts, [true]);
  assert.equal(driver.dates.length, 7);
  await reminders.refresh();
  assert.deepEqual(driver.prompts, [true, false]);
  assert.equal(driver.dates.length, 7);
  await reminders.reset();
  assert.equal(driver.preference, null);
  assert.equal(driver.dates.length, 0);
});
test("permission denial, OS partial scheduling and corrupted preferences fail closed", async () => {
  const driver = new Driver(),
    reminders = new PracticeReminders(driver);
  reminders.setContext(owner);
  await reminders.status();
  driver.granted = false;
  await assert.rejects(reminders.enable(19, 0, "en"), /permission/);
  assert.equal(driver.dates.length, 0);
  driver.granted = true;
  driver.failAt = 3;
  await assert.rejects(reminders.enable(19, 0, "en"), /OS failure/);
  assert.equal(driver.dates.length, 0);
  assert.equal(driver.preference, null);
  driver.preference = { ...owner, hour: 999, minute: 0, locale: "en" };
  await reminders.refresh();
  assert.equal(driver.preference, null);
});
test("pending permission approval after account change cannot schedule old reminders", async () => {
  const driver = new Driver(),
    reminders = new PracticeReminders(driver);
  reminders.setContext(owner);
  await reminders.status();
  let release!: (value: boolean) => void;
  driver.permissionWait = new Promise((r) => {
    release = r;
  });
  const enabling = reminders.enable(19, 0, "en");
  await new Promise((r) => setTimeout(r, 0));
  reminders.setContext({ id: "other", region: "CN" });
  release(true);
  await assert.rejects(enabling, /Account changed/);
  assert.equal(await reminders.status(), null);
  assert.equal(driver.dates.length, 0);
});
test("cold-start suspension cancels scheduled alerts until account verification without prompting", async () => {
  const driver = new Driver();
  driver.preference = { ...owner, hour: 19, minute: 0, locale: "en" };
  driver.dates = [new Date()];
  const reminders = new PracticeReminders(driver);
  reminders.setContext(null);
  assert.equal(await reminders.status(), null);
  assert.equal(driver.dates.length, 0);
  assert.ok(driver.preference);
  reminders.setContext(owner);
  assert.ok(await reminders.status());
  assert.equal(driver.dates.length, 7);
  assert.deepEqual(driver.prompts, [false]);
});
