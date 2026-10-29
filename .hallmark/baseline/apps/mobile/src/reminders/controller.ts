import type { Locale, Region } from "@cubers/core";
export type ReminderOwner = { id: string; region: Region };
export type ReminderPreference = ReminderOwner & {
  hour: number;
  minute: number;
  locale: Locale;
};
export interface ReminderDriver {
  read(): Promise<ReminderPreference | null>;
  save(value: ReminderPreference | null): Promise<void>;
  allowed(prompt: boolean): Promise<boolean>;
  clearOwned(): Promise<void>;
  schedule(date: Date, locale: Locale, index: number): Promise<void>;
}
export function reminderDates(hour: number, minute: number, now = Date.now()) {
  if (
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 23 ||
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute > 59 ||
    !Number.isFinite(now)
  )
    throw Error("Invalid reminder time");
  const first = new Date(now);
  first.setHours(hour, minute, 0, 0);
  if (first.getTime() <= now) first.setDate(first.getDate() + 1);
  return Array.from({ length: 7 }, (_, day) => {
    const next = new Date(first);
    next.setDate(first.getDate() + day);
    return next;
  });
}
export class PracticeReminders {
  private owner: ReminderOwner | null = null;
  private epoch = 0;
  private queue = Promise.resolve();
  constructor(
    private driver: ReminderDriver,
    private clock = () => Date.now(),
  ) {}
  private valid(pref: ReminderPreference | null) {
    return (
      pref &&
      typeof pref.id === "string" &&
      pref.id.length > 0 &&
      pref.id.length <= 64 &&
      ["CN", "INTL"].includes(pref.region) &&
      ["en", "zh"].includes(pref.locale) &&
      Number.isInteger(pref.hour) &&
      pref.hour >= 0 &&
      pref.hour <= 23 &&
      Number.isInteger(pref.minute) &&
      pref.minute >= 0 &&
      pref.minute <= 59
    );
  }
  private serial<T>(job: () => Promise<T>) {
    const task = this.queue.then(job);
    this.queue = task.then(
      () => {},
      () => {},
    );
    return task;
  }
  setContext(owner: ReminderOwner | null) {
    if (this.epoch && JSON.stringify(owner) === JSON.stringify(this.owner))
      return;
    this.owner = owner;
    this.epoch++;
    void this.refresh().catch(() => {});
  }
  async status() {
    return this.serial(async () => {
      const pref = await this.driver.read();
      return this.valid(pref) &&
        pref &&
        this.owner &&
        pref.id === this.owner.id &&
        pref.region === this.owner.region
        ? pref
        : null;
    });
  }
  private async apply(pref: ReminderPreference, epoch: number) {
    const dates = reminderDates(pref.hour, pref.minute, this.clock());
    await this.driver.clearOwned();
    try {
      for (let i = 0; i < dates.length; i++) {
        if (epoch !== this.epoch) throw Error("Account changed");
        await this.driver.schedule(dates[i], pref.locale, i);
      }
      if (epoch !== this.epoch) throw Error("Account changed");
    } catch (error) {
      await this.driver.clearOwned();
      throw error;
    }
  }
  async refresh() {
    const owner = this.owner,
      epoch = this.epoch;
    await this.serial(async () => {
      if (epoch !== this.epoch) return;
      const pref = await this.driver.read();
      if (!owner) {
        await this.driver.clearOwned();
        return;
      }
      if (
        !this.valid(pref) ||
        !pref ||
        pref.id !== owner.id ||
        pref.region !== owner.region
      ) {
        await this.driver.clearOwned();
        await this.driver.save(null);
        return;
      }
      if (!(await this.driver.allowed(false))) {
        await this.driver.clearOwned();
        await this.driver.save(null);
        return;
      }
      if (epoch === this.epoch) await this.apply(pref, epoch);
    });
  }
  async enable(hour: number, minute: number, locale: Locale) {
    reminderDates(hour, minute, this.clock());
    const owner = this.owner,
      epoch = this.epoch;
    if (!owner) throw Error("Connect to your account first");
    await this.serial(async () => {
      if (epoch !== this.epoch) throw Error("Account changed");
      if (!(await this.driver.allowed(true))) {
        await this.driver.clearOwned();
        await this.driver.save(null);
        throw Error("Notification permission was denied");
      }
      const pref = { ...owner, hour, minute, locale };
      try {
        await this.apply(pref, epoch);
        await this.driver.save(pref);
        if (epoch !== this.epoch) throw Error("Account changed");
      } catch (error) {
        await this.driver.clearOwned();
        await this.driver.save(null);
        throw error;
      }
    });
  }
  async reset() {
    this.epoch++;
    await this.serial(async () => {
      await this.driver.clearOwned();
      await this.driver.save(null);
    });
  }
}
