import { z } from "zod";
export const Region = z.enum(["CN", "INTL"]);
export type Region = z.infer<typeof Region>;
export const Puzzle = z.enum(["2x2", "3x3", "4x4", "pyraminx"]);
export type Puzzle = z.infer<typeof Puzzle>;
export const Input = z.enum(["virtual", "scan", "smart"]);
export type Input = z.infer<typeof Input>;
export const Locale = z.enum(["en", "zh"]);
export type Locale = z.infer<typeof Locale>;
export const Modes = ["race", "pattern", "relay", "sprint", "daily"] as const;
export const Register = z
  .object({
    email: z.string().email().max(254),
    password: z.string().min(12).max(128),
    displayName: z.string().trim().min(2).max(40),
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    region: Region,
    terms: z.literal(true),
    privacy: z.literal(true),
  })
  .strict();
export const Login = z
  .object({
    email: z.string().email(),
    password: z.string().max(128),
    otp: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
  })
  .strict();
export const CreatePost = z
  .object({
    body: z.string().trim().min(1).max(4000),
    tags: z
      .array(z.string().regex(/^[\p{L}\p{N}_-]{1,30}$/u))
      .max(5)
      .default([])
      .transform((tags) => [
        ...new Set(tags.map((tag) => tag.normalize("NFC").toLowerCase())),
      ]),
    mediaIds: z.array(z.string().uuid()).max(4).default([]),
    clubId: z.string().uuid().optional(),
    aiGenerated: z.boolean().default(false),
    kind: z.enum(["DISCUSSION", "ANNOUNCEMENT"]).default("DISCUSSION"),
  })
  .strict();
export const CreateRoom = z
  .object({
    puzzle: Puzzle,
    input: Input,
    mode: z.enum(Modes),
    ranked: z.boolean(),
    mixed: z.boolean().default(false),
    private: z.boolean().default(false),
  })
  .strict()
  .refine((room) => !room.mixed || !room.ranked, {
    path: ["ranked"],
    message: "Mixed-input rooms are casual only",
  });
/** Resolve an immutable attempt category, never a mixed-room host's default. */
export function playInput(
  room: { input: string; mixed?: boolean },
  choice?: string | null,
): Input {
  return Input.parse(room.mixed ? choice : room.input);
}
export const MoveEvent = z
  .object({
    sequence: z.number().int().nonnegative(),
    move: z.string().max(8),
    elapsedMs: z.number().int().min(0).max(3600000),
  })
  .strict();
export const CreateGoal = z
  .object({
    puzzle: Puzzle,
    input: Input,
    kind: z.enum(["solves", "time", "lessons"]),
    target: z.number().int().positive().max(3600000),
  })
  .strict()
  .superRefine((goal, context) => {
    if (goal.kind === "time" ? goal.target < 300 : goal.target > 1000)
      context.addIssue({
        code: "custom",
        path: ["target"],
        message:
          "Use a solve time of at least 300 ms or a count from 1 to 1000",
      });
  });
export const TutorRequest = z
  .object({
    lessonId: z.string().max(100),
    courseVersion: z.number().int().positive(),
    alternativeId: z
      .string()
      .regex(/^[a-z0-9-]{1,40}$/)
      .optional(),
    locale: Locale,
    moves: z.array(z.string().max(8)).max(500),
    question: z.string().trim().max(600).default(""),
  })
  .strict();
export type AccountPolicy = {
  region: Region;
  age: number;
  guardianVerified: boolean;
  postingConsent: boolean;
  recordingConsent: boolean;
  adultVerified: boolean;
  identityVerified: boolean;
};
export function isYoungChild(p: Pick<AccountPolicy, "region" | "age">) {
  return p.age < (p.region === "CN" ? 14 : 13);
}
export function permissions(p: AccountPolicy) {
  const child = isYoungChild(p);
  return {
    canLearn: !child || p.guardianVerified,
    canPost:
      (!child || (p.guardianVerified && p.postingConsent)) &&
      (p.region !== "CN" || p.identityVerified),
    needsPostApproval: child,
    canRecord: !child || (p.guardianVerified && p.recordingConsent),
    canChat: p.age >= 18 && p.adultVerified,
    canMessage: p.age >= 18 && p.adultVerified,
    canSeeSponsors: p.age >= 18 && p.adultVerified,
    defaultPrivate: p.age < 18,
  };
}
export function ageOn(birthDate: string, now = new Date()) {
  const d = new Date(`${birthDate}T00:00:00Z`);
  if (
    !Number.isFinite(d.getTime()) ||
    d.toISOString().slice(0, 10) !== birthDate ||
    d > now
  )
    throw new Error("Invalid birth date");
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  if (
    now.getUTCMonth() < d.getUTCMonth() ||
    (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate())
  )
    age--;
  if (age > 120) throw new Error("Invalid birth date");
  return age;
}
export type AttemptStatus =
  | "CREATED"
  | "INSPECTION"
  | "SOLVING"
  | "AWAITING_EVIDENCE"
  | "PROVISIONAL"
  | "APPROVED"
  | "REJECTED"
  | "INTERRUPTED"
  | "EXPIRED";
export const transitions: Record<AttemptStatus, AttemptStatus[]> = {
  CREATED: ["INSPECTION", "INTERRUPTED", "EXPIRED"],
  INSPECTION: ["SOLVING", "INTERRUPTED", "EXPIRED"],
  SOLVING: ["AWAITING_EVIDENCE", "APPROVED", "INTERRUPTED", "EXPIRED"],
  AWAITING_EVIDENCE: ["PROVISIONAL", "APPROVED", "INTERRUPTED", "EXPIRED"],
  PROVISIONAL: ["APPROVED", "REJECTED", "EXPIRED"],
  APPROVED: [],
  REJECTED: [],
  INTERRUPTED: [],
  EXPIRED: [],
};
export function assertTransition(from: AttemptStatus, to: AttemptStatus) {
  if (!transitions[from]?.includes(to))
    throw new Error(`Invalid attempt transition: ${from} → ${to}`);
}
export const capabilities = {
  virtual: { moves: true, scan: false, rankedCamera: false },
  scan: { moves: false, scan: true, rankedCamera: true },
  smart: { moves: true, scan: false, rankedCamera: true },
} as const;
export const Devices = [
  { id: "gan-356-i3", name: "GAN 356 i3", tested: false },
  { id: "gocube-edge", name: "GoCube Edge", tested: false },
  { id: "giiker-i3s", name: "GiiKER i3S", tested: false },
] as const;
