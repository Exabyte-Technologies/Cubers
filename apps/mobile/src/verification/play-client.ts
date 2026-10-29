import { z } from "zod";
import {
  AppAttestationCatalogue,
  appAttestationActionBody,
  type AppAttestationOperation,
  type Region,
} from "@cubers/core";
import { VerificationError, type VerificationContext } from "./client";
export type PlayVerificationNative = {
  supported: () => boolean;
  prepare: (project: string) => Promise<void>;
  request: (hash: string) => Promise<string>;
  hash: (input: string) => Promise<string>;
};
type Ticket = {
  epoch: number;
  context: VerificationContext;
  cancelled: boolean;
};
const Id = z.string().uuid();
const Challenge = z
  .object({
    kind: z.literal("play-action"),
    id: Id,
    clientData: z.string().regex(/^[A-Za-z0-9_-]{43}\.[a-f0-9]{64}$/),
    encoding: z.literal("utf8"),
    expiresAt: z.string().datetime(),
    requestHash: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    cloudProjectNumber: z.string().regex(/^[1-9][0-9]{5,18}$/),
  })
  .passthrough();

/** Standard tokens are one action, not a persistent installation key. Only the
 * explicit warmup choice and prepared project are retained, in session memory. */
export class PlayVerificationClient {
  private context: VerificationContext | null = null;
  private active = true;
  private epoch = 0;
  private tail: Promise<void> = Promise.resolve();
  private prepared?: string;
  constructor(
    private native: PlayVerificationNative,
    private timeoutMs = 20000,
  ) {}
  setContext(next: VerificationContext | null) {
    const scope = (c: VerificationContext | null) =>
      c ? JSON.stringify([c.ownerId, c.region, c.token, c.canLearn]) : null;
    if (scope(next) !== scope(this.context)) {
      this.epoch++;
      this.prepared = undefined;
    }
    this.context = next;
  }
  setActive(value: boolean) {
    if (this.active !== value) this.epoch++;
    this.active = value;
  }
  cancel() {
    this.epoch++;
  }
  supported() {
    return this.native.supported();
  }
  private ticket(): Ticket {
    if (!this.context || !this.active) throw new VerificationError("CANCELLED");
    return { epoch: this.epoch, context: this.context, cancelled: false };
  }
  private check(t: Ticket) {
    if (t.cancelled || !this.active || t.epoch !== this.epoch || !this.context)
      throw new VerificationError("CANCELLED");
  }
  private async step<T>(t: Ticket, work: () => Promise<T>) {
    this.check(t);
    const result = await work();
    this.check(t);
    return result;
  }
  private async bounded<T>(t: Ticket, job: Promise<T>) {
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
    const t = this.ticket();
    const job = this.tail
      .then(() => {
        this.check(t);
        return work(t);
      })
      .catch((error) => {
        if (
          typeof error?.code === "string" &&
          error.code.startsWith("ERR_APP_INTEGRITY")
        ) {
          this.prepared = undefined;
          throw new VerificationError(
            error.code === "ERR_APP_INTEGRITY_PROVIDER_INVALID"
              ? "SETUP"
              : "UNAVAILABLE",
          );
        }
        throw error;
      });
    // A caller timeout never releases the underlying native operation's slot.
    this.tail = job.then(
      () => {},
      () => {},
    );
    return this.bounded(t, job);
  }
  private request(t: Ticket, path: string, body?: unknown, method?: string) {
    return this.step(t, () =>
      t.context.api(`me/app-attestation${path}`, body, method),
    );
  }
  async catalogue() {
    const t = this.ticket();
    return this.bounded(
      t,
      this.request(t, "").then((value) => AppAttestationCatalogue.parse(value)),
    );
  }
  private async project(t: Ticket) {
    if (!this.supported()) throw new VerificationError("UNAVAILABLE");
    if (!t.context.canLearn) throw new VerificationError("CONSENT");
    const catalogue = AppAttestationCatalogue.parse(await this.request(t, ""));
    const provider = catalogue.providers.find(
      (p) => p.provider === "google-play" && p.available,
    );
    if (!provider?.cloudProjectNumber)
      throw new VerificationError("UNAVAILABLE");
    return provider.cloudProjectNumber;
  }
  enroll() {
    return this.run(async (t) => {
      const project = await this.project(t);
      await this.step(t, () => this.native.prepare(project));
      this.prepared = project;
    });
  }
  perform<T = any>(
    attemptId: string,
    operation: AppAttestationOperation,
    body: unknown,
  ): Promise<T> {
    const id = Id.parse(attemptId),
      normalized = appAttestationActionBody(operation, body);
    return this.run(async (t) => {
      if (!this.prepared) throw new VerificationError("SETUP");
      const project = await this.project(t);
      if (project !== this.prepared) {
        this.prepared = undefined;
        throw new VerificationError("SETUP");
      }
      const challenge = Challenge.parse(
        await this.request(t, "/challenges", {
          kind: "play-action",
          provider: "google-play",
          attemptId: id,
          operation,
          body: normalized,
        }),
      );
      if (
        challenge.cloudProjectNumber !== project ||
        Date.parse(challenge.expiresAt) <= Date.now()
      )
        throw new VerificationError("EXPIRED");
      const hash = await this.step(t, () =>
        this.native.hash(challenge.clientData),
      );
      if (hash !== challenge.requestHash)
        throw new VerificationError("UNAVAILABLE");
      const token = z
        .string()
        .min(16)
        .max(32768)
        .regex(/^[\x21-\x7e]+$/)
        .parse(await this.step(t, () => this.native.request(hash)));
      this.check(t);
      if (Date.parse(challenge.expiresAt) <= Date.now())
        throw new VerificationError("EXPIRED");
      const raw = await this.request(t, "/verify", {
        kind: "play-action",
        challengeId: challenge.id,
        clientData: challenge.clientData,
        integrityToken: token,
      });
      const grant = z
        .object({
          grantId: Id,
          attemptId: z.literal(id),
          operation: z.literal(operation),
          expiresAt: z.string().datetime(),
          rankingEligible: z.literal(false),
        })
        .strict()
        .parse(raw);
      if (Date.parse(grant.expiresAt) <= Date.now())
        throw new VerificationError("EXPIRED");
      return this.step(t, () =>
        t.context.api<T>(`attempts/${id}/${operation}`, {
          ...normalized,
          appProofId: grant.grantId,
        }),
      );
    });
  }
  async revoke(id: string, expectedVersion: number) {
    this.cancel();
    const t = this.ticket();
    return this.bounded(
      t,
      this.request(t, `/keys/${Id.parse(id)}`, { expectedVersion }, "DELETE"),
    );
  }
  async reset() {
    this.cancel();
    this.prepared = undefined;
    const t = this.ticket();
    // Account cancellation stays available after consent withdrawal or a stalled SDK call.
    return this.bounded(t, this.request(t, "/play", {}, "DELETE"));
  }
  async eraseLocal(ownerId: string, region: Region) {
    if (
      this.context?.ownerId === Id.parse(ownerId) &&
      this.context.region === region
    ) {
      this.cancel();
      this.prepared = undefined;
    }
  }
}
