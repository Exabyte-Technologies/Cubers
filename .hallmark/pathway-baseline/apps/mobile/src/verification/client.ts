import { z } from "zod";
import {
  AppAttestationCatalogue,
  AppAttestationKeyView,
  appAttestationActionBody,
  type AppAttestationOperation,
  type Region,
} from "@cubers/core";
import { orderedWriter } from "../ordered-storage";
type KeyView = z.infer<typeof AppAttestationKeyView>;
type Operation = z.infer<typeof AppAttestationOperation>;
export type VerificationApi = <T = any>(
  path: string,
  body?: unknown,
  method?: string,
) => Promise<T>;
export type VerificationContext = {
  ownerId: string;
  region: Region;
  token: string;
  canLearn: boolean;
  api: VerificationApi;
};
export type VerificationNative = {
  supported: () => boolean;
  generate: () => Promise<string>;
  attest: (key: string, clientData: string) => Promise<string>;
  assert: (key: string, clientData: string) => Promise<string>;
};
export type VerificationStore = {
  read: (key: string) => Promise<string | null>;
  write: (key: string, value: string | null) => Promise<void>;
};
export class VerificationError extends Error {
  constructor(
    readonly code:
      | "UNAVAILABLE"
      | "SETUP"
      | "RECOVERY"
      | "CANCELLED"
      | "EXPIRED"
      | "CONSENT",
  ) {
    super("Device verification could not finish");
  }
}
const Id = z.string().uuid();
const NativeKey = z.string().regex(/^[A-Za-z0-9+/]{43}=$/);
const Stored = z
  .object({
    v: z.literal(1),
    key: NativeKey,
    started: z.boolean(),
    serverId: Id.optional(),
  })
  .strict();
type StoredKey = z.infer<typeof Stored>;
const Challenge = z
  .object({
    id: Id,
    clientData: z.string().regex(/^[A-Za-z0-9_-]{43}\.[a-f0-9]{64}$/),
    encoding: z.literal("utf8"),
    expiresAt: z.string().datetime(),
  })
  .passthrough();
type Ticket = {
  epoch: number;
  context: VerificationContext;
  cancelled: boolean;
};
type Pending = {
  scope: string;
  token: string;
  key: string;
  proof: unknown;
  expiresAt: number;
};
/** Hardware operations serialize across accounts. A timed-out native call retains
 * its slot until it actually settles; stale callbacks cannot submit an action. */
export class AppVerificationClient {
  private context: VerificationContext | null = null;
  private active = true;
  private epoch = 0;
  private tail: Promise<void> = Promise.resolve();
  private pending?: Pending;
  private write: VerificationStore["write"];
  constructor(
    private native: VerificationNative,
    private store: VerificationStore,
    private timeoutMs = 20000,
  ) {
    this.write = orderedWriter(store.write);
  }
  setContext(next: VerificationContext | null) {
    const key = (c: VerificationContext | null) =>
      c ? JSON.stringify([c.ownerId, c.region, c.token, c.canLearn]) : null;
    if (key(next) !== key(this.context)) {
      this.epoch++;
      this.pending = undefined;
    }
    this.context = next;
  }
  setActive(active: boolean) {
    if (this.active !== active) {
      this.epoch++;
      this.pending = undefined;
    }
    this.active = active;
  }
  cancel() {
    this.epoch++;
    this.pending = undefined;
  }
  private scope(c: VerificationContext) {
    return `cubers.app-verification.v1.${c.region}.${Id.parse(c.ownerId)}`;
  }
  private ticket(): Ticket {
    if (!this.context || !this.active) throw new VerificationError("CANCELLED");
    return { epoch: this.epoch, context: this.context, cancelled: false };
  }
  private check(t: Ticket) {
    if (t.cancelled || t.epoch !== this.epoch || !this.active || !this.context)
      throw new VerificationError("CANCELLED");
  }
  private async step<T>(t: Ticket, task: () => Promise<T>): Promise<T> {
    this.check(t);
    const result = await task();
    this.check(t);
    return result;
  }
  private async bounded<T>(t: Ticket, job: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        job,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            t.cancelled = true;
            reject(new VerificationError("CANCELLED"));
          }, this.timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  private run<T>(work: (t: Ticket) => Promise<T>): Promise<T> {
    const t = this.ticket(),
      job = this.tail
        .then(() => {
          this.check(t);
          return work(t);
        })
        .catch((error) => {
          if (
            typeof error?.code === "string" &&
            error.code.startsWith("ERR_APP_INTEGRITY")
          )
            throw new VerificationError(
              error.code === "ERR_APP_INTEGRITY_SERVER_UNAVAILABLE"
                ? "UNAVAILABLE"
                : "RECOVERY",
            );
          throw error;
        });
    this.tail = job.then(
      () => {},
      () => {},
    );
    return this.bounded(t, job);
  }
  private async request(
    t: Ticket,
    path: string,
    body?: unknown,
    method?: string,
  ) {
    return this.step(t, () =>
      t.context.api(`me/app-attestation${path}`, body, method),
    );
  }
  private async catalogueFor(t: Ticket) {
    return AppAttestationCatalogue.parse(await this.request(t, ""));
  }
  async catalogue() {
    const t = this.ticket();
    return this.bounded(t, this.catalogueFor(t));
  }
  supported() {
    return this.native.supported();
  }
  private async load(t: Ticket): Promise<StoredKey | null> {
    const raw = await this.step(t, () =>
      this.store.read(this.scope(t.context)),
    );
    if (raw === null) return null;
    try {
      return Stored.parse(JSON.parse(raw));
    } catch {
      throw new VerificationError("RECOVERY");
    }
  }
  private async save(t: Ticket, key: StoredKey) {
    await this.step(t, () =>
      this.write(this.scope(t.context), JSON.stringify(Stored.parse(key))),
    );
  }
  private currentChallenge(raw: unknown) {
    const c = Challenge.parse(raw);
    if (Date.parse(c.expiresAt) <= Date.now())
      throw new VerificationError("EXPIRED");
    return c;
  }
  private async accept(t: Ticket, key: StoredKey, result: unknown) {
    const view = AppAttestationKeyView.parse(result);
    if (view.status !== "ACTIVE") throw new VerificationError("RECOVERY");
    const saved = { ...key, started: true, serverId: view.id };
    await this.save(t, saved);
    this.pending = undefined;
    return saved;
  }
  private async ensure(
    t: Ticket,
    create: boolean,
  ): Promise<StoredKey & { serverId: string }> {
    if (!t.context.canLearn) throw new VerificationError("CONSENT");
    const catalogue = await this.catalogueFor(t);
    if (
      !catalogue.providers.some(
        (p) => p.provider === "apple-app-attest" && p.available,
      ) ||
      !this.native.supported()
    )
      throw new VerificationError("UNAVAILABLE");
    let key = await this.load(t);
    if (!key) {
      if (!create) throw new VerificationError("SETUP");
      key = {
        v: 1,
        key: NativeKey.parse(await this.step(t, () => this.native.generate())),
        started: false,
      };
      await this.save(t, key);
    }
    if (key.serverId) {
      const row = catalogue.keys.find((k) => k.id === key!.serverId);
      if (
        row?.status !== "ACTIVE" ||
        Date.parse(row.receiptExpiresAt) <= Date.now()
      )
        throw new VerificationError("RECOVERY");
      return key as StoredKey & { serverId: string };
    }
    const pending = this.pending;
    if (
      pending &&
      pending.scope === this.scope(t.context) &&
      pending.token === t.context.token &&
      pending.key === key.key &&
      pending.expiresAt > Date.now()
    ) {
      try {
        const verified = await this.request(t, "/verify", pending.proof);
        key = await this.accept(t, key, verified.key);
        return key as StoredKey & { serverId: string };
      } catch (error) {
        if ((error as any).status !== 409) throw error;
        // A lost successful reply is recovered by the server's ownership check.
      }
    }
    const raw = await this.request(t, "/challenges", {
      kind: "enroll",
      provider: "apple-app-attest",
      keyId: key.key,
    });
    if (raw.alreadyEnrolled) {
      key = await this.accept(t, key, raw.alreadyEnrolled);
      return key as StoredKey & { serverId: string };
    }
    if (key.started) throw new VerificationError("RECOVERY");
    const c = this.currentChallenge(raw);
    key = { ...key, started: true };
    await this.save(t, key);
    let attestation: string;
    try {
      attestation = await this.step(t, () =>
        this.native.attest(key!.key, c.clientData),
      );
    } catch (error) {
      if ((error as any).code === "ERR_APP_INTEGRITY_SERVER_UNAVAILABLE")
        await this.save(t, { ...key, started: false });
      throw error;
    }
    const proof = {
      kind: "enroll",
      challengeId: c.id,
      clientData: c.clientData,
      keyId: key.key,
      attestation,
    };
    this.pending = {
      scope: this.scope(t.context),
      token: t.context.token,
      key: key.key,
      proof,
      expiresAt: Date.parse(c.expiresAt),
    };
    const verified = await this.request(t, "/verify", proof);
    key = await this.accept(t, key, verified.key);
    return key as StoredKey & { serverId: string };
  }
  enroll() {
    return this.run(async (t) => {
      const key = await this.ensure(t, true);
      return key.serverId;
    });
  }
  perform<T = any>(
    attemptId: string,
    operation: Operation,
    body: unknown,
  ): Promise<T> {
    const id = Id.parse(attemptId),
      normalized = appAttestationActionBody(operation, body);
    return this.run(async (t) => {
      const key = await this.ensure(t, false);
      const c = this.currentChallenge(
        await this.request(t, "/challenges", {
          kind: "action",
          provider: "apple-app-attest",
          keyId: key.serverId,
          attemptId: id,
          operation,
          body: normalized,
        }),
      );
      const assertion = await this.step(t, () =>
        this.native.assert(key.key, c.clientData),
      );
      const grant = await this.request(t, "/verify", {
        kind: "action",
        challengeId: c.id,
        clientData: c.clientData,
        assertion,
      });
      const g = z
        .object({
          grantId: Id,
          operation: z.literal(operation),
          attemptId: z.literal(id),
          expiresAt: z.string().datetime(),
          rankingEligible: z.literal(false),
        })
        .strict()
        .parse(grant);
      if (Date.parse(g.expiresAt) <= Date.now())
        throw new VerificationError("EXPIRED");
      return this.step(t, () =>
        t.context.api<T>(`attempts/${id}/${operation}`, {
          ...normalized,
          appProofId: g.grantId,
        }),
      );
    });
  }
  async revoke(id: string, expectedVersion: number) {
    // Revocation must remain possible even if an uncancellable SDK call stalls.
    this.epoch++;
    this.pending = undefined;
    const t = this.ticket();
    return this.bounded(
      t,
      (async () => {
        await this.request(
          t,
          `/keys/${Id.parse(id)}`,
          { expectedVersion },
          "DELETE",
        );
        const key = await this.load(t);
        if (key?.serverId === id)
          await this.step(t, () => this.write(this.scope(t.context), null));
      })(),
    );
  }
  /** Erase the captured deleted account's device cache, even after sign-out. */
  async eraseLocal(ownerId: string, region: Region) {
    const scope = `cubers.app-verification.v1.${region}.${Id.parse(ownerId)}`;
    if (this.context && this.scope(this.context) === scope) this.cancel();
    await this.write(scope, null);
  }
  reset() {
    return this.run(async (t) => {
      const key = await this.load(t);
      if (!key) return;
      let id = key.serverId;
      if (!id)
        try {
          const c = await this.request(t, "/challenges", {
            kind: "enroll",
            provider: "apple-app-attest",
            keyId: key.key,
          });
          id = c.alreadyEnrolled
            ? AppAttestationKeyView.parse(c.alreadyEnrolled).id
            : undefined;
        } catch (error) {
          if ((error as any).status !== 409) throw error;
        }
      if (id) {
        const row = (await this.catalogueFor(t)).keys.find((k) => k.id === id);
        if (row?.status === "ACTIVE")
          await this.request(
            t,
            `/keys/${id}`,
            { expectedVersion: row.version },
            "DELETE",
          );
      }
      await this.step(t, () => this.write(this.scope(t.context), null));
      this.pending = undefined;
    });
  }
}
