import { backOrReplace } from "../../src/back-navigation";
import React, { useCallback, useState } from "react";
import { View, Switch } from "react-native";
import { router, Redirect, useFocusEffect } from "expo-router";
import {
  ProfileSettings,
  ProfileSections,
  ProfileSkills,
  type ProfileAchievement,
} from "@cubers/core";
import { useApp } from "../../src/state";
import { ProfileAvatar } from "../../src/ProfileAvatar";
import {
  Screen,
  Heading,
  Card,
  Row,
  Txt,
  Button,
  Field,
  Chip,
  Notice,
  Busy,
  useTheme,
} from "../../src/ui";
export default function EditProfile() {
  const { api, user, token, t, locale, reload } = useApp(),
    c = useTheme();
  const [source, setSource] = useState<any>(),
    [settings, setSettings] = useState<ProfileSettings>(
      ProfileSettings.parse({}),
    ),
    [name, setName] = useState(""),
    [bio, setBio] = useState(""),
    [privateProfile, setPrivate] = useState(true),
    [confirmed, setConfirmed] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const result = await api("me/profile");
      setSource(result);
      setSettings(result.settings);
      setName(result.displayName);
      setBio(result.bio);
      setPrivate(result.privateProfile);
      setConfirmed(false);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }, [api]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  const sectionNames = {
    about: t("About, favorites and skills", "简介、喜爱的魔方与技能"),
    achievements: t("Selected achievements", "精选成就"),
    statistics: t("Solve statistics", "还原统计"),
    friends: t("Friendships", "好友关系"),
    clubs: t("Clubs", "社团"),
  };
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const result = await api("me/profile", {
        revision: source.review.revision,
        displayName: name,
        bio,
        privateProfile,
        settings,
        sharingConfirmed: confirmed,
      });
      await reload();
      await load();
      setMessage(
        result.status === "PENDING"
          ? t(
              "Saved. Your shared profile is hidden until a reviewer approves this revision.",
              "已保存。分享的个人页将在当前版本通过审核后显示。",
            )
          : t("Profile saved.", "个人资料已保存。"),
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!token) return <Redirect href="/" />;
  return (
    <Screen>
      <Button
        small
        kind="secondary"
        label={t("Back", "返回")}
        onPress={() => backOrReplace(router, "/settings")}
      />
      <Heading>{t("Make it yours.", "写下你的魔方故事。")}</Heading>
      {!source ? (
        message ? (
          <Notice text={message} error />
        ) : (
          <Busy />
        )
      ) : (
        <>
          <Card style={{ backgroundColor: c.lavender }}>
            <Row>
              <ProfileAvatar avatar={settings.avatar} />
              <View style={{ flex: 1 }}>
                <Txt style={{ fontWeight: "600", fontSize: 22 }}>{name}</Txt>
                <Txt small>
                  {t("Original geometric avatars", "原创几何头像")}
                </Txt>
              </View>
            </Row>
            <Row>
              {[
                ["cube", "Cube", "魔方"],
                ["orbit", "Orbit", "轨道"],
                ["pyramid", "Pyramid", "金字塔"],
              ].map(([shape, en, zh]) => (
                <Chip
                  key={shape}
                  label={t(en, zh)}
                  selected={settings.avatar.shape === shape}
                  onPress={() =>
                    setSettings((s) => ({
                      ...s,
                      avatar: {
                        ...s.avatar,
                        shape: shape as ProfileSettings["avatar"]["shape"],
                      },
                    }))
                  }
                />
              ))}
            </Row>
            <Row>
              {[
                ["mint", "Mint", "薄荷"],
                ["sunset", "Sunset", "落日"],
                ["indigo", "Indigo", "靛蓝"],
                ["rose", "Rose", "玫瑰"],
              ].map(([color, en, zh]) => (
                <Chip
                  key={color}
                  label={t(en, zh)}
                  selected={settings.avatar.color === color}
                  onPress={() =>
                    setSettings((s) => ({
                      ...s,
                      avatar: {
                        ...s.avatar,
                        color: color as ProfileSettings["avatar"]["color"],
                      },
                    }))
                  }
                />
              ))}
            </Row>
          </Card>
          <Card>
            <Field
              label={t("Display name", "昵称")}
              value={name}
              onChangeText={setName}
              maxLength={40}
            />
            <Field
              label={t("A little about you", "介绍一下自己")}
              value={bio}
              onChangeText={setBio}
              maxLength={300}
              multiline
            />
            <Txt small style={{ color: c.muted }}>
              {t(
                "Keep contact, school and location details out of your profile. Changing your nickname puts your published posts and replies back into review.",
                "请勿填写联系方式、学校或位置。更改昵称后，已发布的帖子与回复会重新进入审核。",
              )}
            </Txt>
          </Card>
          <Card>
            <Txt style={{ fontWeight: "600", fontSize: 21 }}>
              {t("Favorite puzzles", "喜爱的魔方")}
            </Txt>
            <Row>
              {(["2x2", "3x3", "4x4", "pyraminx"] as const).map((p) => (
                <Chip
                  key={p}
                  label={
                    p === "pyraminx"
                      ? t("Pyraminx", "金字塔")
                      : p.replace("x", "×")
                  }
                  selected={settings.favorites.includes(p)}
                  onPress={() =>
                    setSettings((s) => ({
                      ...s,
                      favorites: s.favorites.includes(p)
                        ? s.favorites.filter((v) => v !== p)
                        : [...s.favorites, p],
                    }))
                  }
                />
              ))}
            </Row>
            <Txt style={{ fontWeight: "600", fontSize: 21 }}>
              {t("What you’re practicing", "你正在练习什么")}
            </Txt>
            <Txt small>
              {t(
                "Self-described interests, not skill certification.",
                "自行选择的学习方向，并非技能认证。",
              )}
            </Txt>
            <Row>
              {ProfileSkills.map((skill) => (
                <Chip
                  key={skill.id}
                  label={skill[locale]}
                  selected={settings.skills.includes(skill.id)}
                  onPress={() =>
                    setSettings((s) => ({
                      ...s,
                      skills: s.skills.includes(skill.id)
                        ? s.skills.filter((v) => v !== skill.id)
                        : [...s.skills, skill.id],
                    }))
                  }
                />
              ))}
            </Row>
          </Card>
          <Card>
            <Txt style={{ fontWeight: "600", fontSize: 21 }}>
              {t("Your earned achievements", "你已获得的成就")}
            </Txt>
            <Txt small>
              {t(
                "Select the milestones you want to show. Lesson drills are separate from full solves.",
                "选择想展示的成长时刻。课程练习与完整还原分别记录。",
              )}
            </Txt>
            {(source.achievements as ProfileAchievement[]).map((a) => (
              <View key={a.id} style={{ gap: 6 }}>
                <Chip
                  label={a[locale]}
                  selected={settings.selectedAchievements.includes(a.id)}
                  onPress={() =>
                    setSettings((s) => ({
                      ...s,
                      selectedAchievements: s.selectedAchievements.includes(
                        a.id,
                      )
                        ? s.selectedAchievements.filter((v) => v !== a.id)
                        : [...s.selectedAchievements, a.id],
                    }))
                  }
                />
                <Txt small>{a.description[locale]}</Txt>
              </View>
            ))}
            {!source.achievements.length && (
              <Txt small>
                {t(
                  "Your verified practice milestones will appear here.",
                  "完成经过验证的练习后，成就会显示在这里。",
                )}
              </Txt>
            )}
          </Card>
          <Card>
            <Txt style={{ fontWeight: "600", fontSize: 21 }}>
              {t("Choose who can see each section", "选择每个部分的可见范围")}
            </Txt>
            <Row style={{ justifyContent: "space-between" }}>
              <Txt>
                {t("Keep my entire profile private", "整个个人页保持私密")}
              </Txt>
              <Switch
                accessibilityLabel={t(
                  "Keep my entire profile private",
                  "整个个人页保持私密",
                )}
                value={privateProfile}
                onValueChange={(v) => {
                  setPrivate(v);
                  setConfirmed(false);
                }}
                disabled={privateProfile && !source.sharingEligible}
              />
            </Row>
            <Txt small>
              {t(
                "When your entire profile is private, none of the sections below are shared.",
                "整个个人页保持私密时，下方所有部分均不会向他人分享。",
              )}
            </Txt>
            {!source.sharingEligible && (
              <Notice
                text={
                  user?.ageBand !== "adult"
                    ? t(
                        "Minor profiles remain private.",
                        "未成年人的个人页保持私密。",
                      )
                    : t(
                        "Profile sharing requires verified adult eligibility and regional service availability.",
                        "分享个人页需要通过成年资格核验，且所在区域服务已开放。",
                      )
                }
              />
            )}
            {ProfileSections.map((section) => (
              <View key={section} style={{ gap: 8 }}>
                <Txt style={{ fontWeight: "600" }}>{sectionNames[section]}</Txt>
                <Row>
                  {[
                    ["PRIVATE", "Only me", "仅自己"],
                    ["FRIENDS", "Accepted friends", "已接受的好友"],
                    ["PUBLIC", "Signed-in cubers", "已登录的用户"],
                  ].map(([visibility, en, zh]) => (
                    <Chip
                      key={visibility}
                      label={t(en, zh)}
                      selected={settings.visibility[section] === visibility}
                      onPress={() => {
                        setSettings((s) => ({
                          ...s,
                          visibility: {
                            ...s.visibility,
                            [section]: visibility,
                          },
                        }));
                        setConfirmed(false);
                      }}
                    />
                  ))}
                </Row>
              </View>
            ))}
            <Notice
              text={t(
                "Your nickname and avatar accompany any shared section. Friends means an accepted, currently eligible friendship; following and mentorship do not grant access. Friendships appear only if both people allow it. Private clubs stay limited to their members. Your detailed history, recordings and practice dates stay private.",
                "昵称与头像会随所分享的部分显示。好友是已接受且当前有效的好友关系；关注或指导关系不会获得访问权。好友关系须双方都允许才会展示。私密社团仍仅限成员访问。详细历史、录像与练习日期保持私密。",
              )}
            />
            {!privateProfile && (
              <Row style={{ justifyContent: "space-between" }}>
                <Txt style={{ flex: 1 }}>
                  {t(
                    "I choose to share my nickname, avatar and the sections above with the selected audiences. Others may copy what I share.",
                    "我同意向所选范围分享昵称、头像和上述内容，知悉他人可能保存所分享的信息。",
                  )}
                </Txt>
                <Switch
                  accessibilityLabel={t(
                    "Confirm profile sharing",
                    "确认个人页分享",
                  )}
                  value={confirmed}
                  onValueChange={setConfirmed}
                />
              </Row>
            )}
            <Txt small>
              {t("Content review", "内容审核")}:{" "}
              {source.review.status === "APPROVED"
                ? t("Approved", "已通过")
                : source.review.status === "PENDING"
                  ? t("Awaiting review", "待审核")
                  : source.review.status === "REJECTED"
                    ? t("Not approved", "未通过")
                    : t("Not submitted for sharing", "尚未提交分享")}
            </Txt>
            {!!source.review.reason && <Txt small>{source.review.reason}</Txt>}
          </Card>
          <Button
            label={
              busy ? t("Saving…", "保存中…") : t("Save profile", "保存个人资料")
            }
            onPress={() => void save()}
            disabled={busy || name.trim().length < 2}
          />
          <Button
            kind="secondary"
            label={t("Reload saved profile", "重新加载已保存资料")}
            onPress={() => void load()}
            disabled={busy}
          />
          {source.review.status === "APPROVED" &&
            source.sharingEligible &&
            !source.privateProfile &&
            Object.values(source.settings.visibility).some(
              (value) => value !== "PRIVATE",
            ) && (
              <Button
                kind="secondary"
                label={t("View shared profile", "查看分享的个人页")}
                onPress={() =>
                  router.push({
                    pathname: "/profile/[id]",
                    params: { id: user!.id },
                  })
                }
              />
            )}
          {!!message && <Notice text={message} />}
        </>
      )}
    </Screen>
  );
}
