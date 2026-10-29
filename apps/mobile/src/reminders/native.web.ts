import { PracticeReminders } from "./controller";
export const practiceReminders = new PracticeReminders({
  async read() {
    return null;
  },
  async save() {},
  async allowed() {
    return false;
  },
  async clearOwned() {},
  async schedule() {
    throw Error("Use the native app for reminders");
  },
});
