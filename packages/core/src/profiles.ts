import { z } from "zod";
import { Puzzle } from "./contracts";
export const ProfileSkills = [
  { id: "beginner", en: "Learning the basics", zh: "学习基础" },
  { id: "f2l", en: "Practicing F2L", zh: "练习 F2L" },
  {
    id: "last-layer",
    en: "Learning last-layer algorithms",
    zh: "学习顶层公式",
  },
  { id: "roux", en: "Exploring Roux", zh: "探索桥式" },
  { id: "big-cubes", en: "Practicing big cubes", zh: "练习高阶魔方" },
  { id: "pyraminx", en: "Practicing Pyraminx", zh: "练习金字塔" },
] as const;
export const AchievementCatalog = [
  {
    id: "first-checkpoint",
    en: "First checkpoint",
    zh: "第一个检查点",
    description: {
      en: "Complete a verified lesson drill.",
      zh: "完成一次经过验证的课程练习。",
    },
  },
  {
    id: "five-lessons",
    en: "Five lesson drills",
    zh: "五节课程练习",
    description: {
      en: "Complete five different lesson drills.",
      zh: "完成五节不同的课程练习。",
    },
  },
  {
    id: "twenty-lessons",
    en: "Twenty lesson drills",
    zh: "二十节课程练习",
    description: {
      en: "Complete twenty different lesson drills.",
      zh: "完成二十节不同的课程练习。",
    },
  },
  {
    id: "ten-checkpoints",
    en: "Practice habit",
    zh: "坚持练习",
    description: {
      en: "Finish ten verified practice checkpoints.",
      zh: "完成十次经过验证的练习检查点。",
    },
  },
  {
    id: "virtual-solve",
    en: "Virtual finish",
    zh: "虚拟还原",
    description: {
      en: "Finish a server-verified virtual race or daily solve.",
      zh: "完成一次服务器核验的虚拟竞速或每日还原。",
    },
  },
  {
    id: "reviewed-physical",
    en: "Reviewed physical finish",
    zh: "实物还原通过审核",
    description: {
      en: "Receive evidence approval for a recorded ranked physical solve.",
      zh: "一次有录像的排名实物还原通过证据审核。",
    },
  },
] as const;
export const AchievementId = z.enum([
  "first-checkpoint",
  "five-lessons",
  "twenty-lessons",
  "ten-checkpoints",
  "virtual-solve",
  "reviewed-physical",
]);
export type AchievementId = z.infer<typeof AchievementId>;
export const ProfileVisibility = z.enum(["PRIVATE", "FRIENDS", "PUBLIC"]);
export const ProfileSections = [
  "about",
  "achievements",
  "statistics",
  "friends",
  "clubs",
] as const;
export type ProfileSection = (typeof ProfileSections)[number];
const unique = <T>(values: T[]) => new Set(values).size === values.length;
export const ProfileSettings = z
  .object({
    avatar: z
      .object({
        shape: z.enum(["cube", "orbit", "pyramid"]).default("cube"),
        color: z.enum(["mint", "sunset", "indigo", "rose"]).default("mint"),
      })
      .strict()
      .default({}),
    favorites: z
      .array(Puzzle)
      .max(4)
      .refine(unique, "Choose each puzzle once")
      .default([]),
    skills: z
      .array(
        z.enum([
          "beginner",
          "f2l",
          "last-layer",
          "roux",
          "big-cubes",
          "pyraminx",
        ]),
      )
      .max(6)
      .refine(unique, "Choose each skill once")
      .default([]),
    selectedAchievements: z
      .array(AchievementId)
      .max(6)
      .refine(unique, "Choose each achievement once")
      .default([]),
    visibility: z
      .object({
        about: ProfileVisibility.default("PRIVATE"),
        achievements: ProfileVisibility.default("PRIVATE"),
        statistics: ProfileVisibility.default("PRIVATE"),
        friends: ProfileVisibility.default("PRIVATE"),
        clubs: ProfileVisibility.default("PRIVATE"),
      })
      .strict()
      .default({}),
  })
  .strict();
export type ProfileSettings = z.infer<typeof ProfileSettings>;
export const ProfileIdentity = z
  .object({
    displayName: z.string().trim().min(2).max(40),
    bio: z.string().trim().max(300),
    privateProfile: z.boolean(),
    sharingConfirmed: z.boolean().optional(),
  })
  .strict();
export const UpdateProfile = ProfileIdentity.extend({
  revision: z.number().int().positive(),
  settings: ProfileSettings,
});
export type UpdateProfile = z.infer<typeof UpdateProfile>;
export type ProfileAchievement = (typeof AchievementCatalog)[number];
export type SharedProfile = {
  id: string;
  displayName: string;
  avatar: ProfileSettings["avatar"];
  about: {
    bio: string;
    favorites: ProfileSettings["favorites"];
    skills: ProfileSettings["skills"];
  } | null;
  achievements: ProfileAchievement[] | null;
  statistics: {
    window: string;
    categories: {
      puzzle: string;
      input: string;
      solves: number;
      bestMs: number;
    }[];
  } | null;
  friends: {
    items: {
      id: string;
      displayName: string;
      avatar: ProfileSettings["avatar"];
    }[];
    nextCursor: string | null;
  } | null;
  clubs: {
    items: { id: string; name: string; private: boolean }[];
    nextCursor: string | null;
  } | null;
};
