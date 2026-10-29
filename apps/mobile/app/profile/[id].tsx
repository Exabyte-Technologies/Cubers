import { backOrReplace } from "../../src/back-navigation";
import React, { useCallback, useState } from "react";
import { View } from "react-native";
import {
  router,
  Redirect,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";
import { ProfileSkills, type SharedProfile } from "@cubers/core";
import { useApp } from "../../src/state";
import { ProfileAvatar } from "../../src/ProfileAvatar";
import {
  Screen,
  Heading,
  Card,
  Txt,
  Button,
  Row,
  Field,
  Notice,
  Busy,
  useTheme,
} from "../../src/ui";
export default function SharedProfilePage() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    { api, t, token, locale, user } = useApp();
  const c = useTheme();
  const [profile, setProfile] = useState<SharedProfile>(),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [reason, setReason] = useState("");
  const load = useCallback(async () => {
    setProfile(undefined);
    setMessage("");
    try {
      setProfile(await api("profiles/" + id));
    } catch (e) {
      setMessage(
        (e as any).status === 404
          ? t(
              "This profile is private or unavailable.",
              "此个人页为私密或暂不可用。",
            )
          : (e as Error).message,
      );
    }
  }, [api, id, locale]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  async function more(section: "friends" | "clubs") {
    setBusy(true);
    try {
      const page = await api(
        "profiles/" +
          id +
          "/" +
          section +
          "?cursor=" +
          profile![section]!.nextCursor,
      );
      setProfile((p) =>
        p
          ? {
              ...p,
              [section]: {
                items: [...p[section]!.items, ...page.items],
                nextCursor: page.nextCursor,
              },
            }
          : p,
      );
    } catch (e) {
      if ((e as any).status === 404) setProfile(undefined);
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
        onPress={() => backOrReplace(router, "/(tabs)")}
      />
      {!profile ? (
        message ? (
          <Notice text={message} />
        ) : (
          <Busy />
        )
      ) : (
        <>
          <Card style={{ backgroundColor: c.lavender }}>
            <Row>
              <ProfileAvatar avatar={profile.avatar} />
              <View style={{ flex: 1 }}>
                <Heading>{profile.displayName}</Heading>
                <Txt small>{t("Shared with you", "向你分享的个人页")}</Txt>
              </View>
            </Row>
          </Card>
          {profile.about && (
            <Card>
              <Txt style={{ fontWeight: "600", fontSize: 21 }}>
                {t("About", "简介")}
              </Txt>
              {!!profile.about.bio && <Txt selectable>{profile.about.bio}</Txt>}
              {!!profile.about.favorites.length && (
                <Txt>
                  {t("Favorite puzzles", "喜爱的魔方")}:{" "}
                  {profile.about.favorites
                    .map((p) =>
                      p === "pyraminx"
                        ? t("Pyraminx", "金字塔")
                        : p.replace("x", "×"),
                    )
                    .join(" / ")}
                </Txt>
              )}
              {!!profile.about.skills.length && (
                <>
                  <Txt>{t("Currently practicing", "正在练习")}</Txt>
                  {profile.about.skills.map((id) => (
                    <Txt small key={id}>
                      {ProfileSkills.find((s) => s.id === id)?.[locale]}
                    </Txt>
                  ))}
                  <Txt small>
                    {t(
                      "Self-described interests, not skill certification.",
                      "自行选择的学习方向，并非技能认证。",
                    )}
                  </Txt>
                </>
              )}
            </Card>
          )}
          {profile.achievements && (
            <Card>
              <Txt style={{ fontWeight: "600", fontSize: 21 }}>
                {t("Selected achievements", "精选成就")}
              </Txt>
              {profile.achievements.length ? (
                profile.achievements.map((a) => (
                  <View key={a.id} style={{ gap: 5 }}>
                    <Txt style={{ fontWeight: "600" }}>{a[locale]}</Txt>
                    <Txt small>{a.description[locale]}</Txt>
                  </View>
                ))
              ) : (
                <Txt small>
                  {t("No achievements selected.", "尚未选择展示的成就。")}
                </Txt>
              )}
            </Card>
          )}
          {profile.statistics && (
            <Card>
              <Txt style={{ fontWeight: "600", fontSize: 21 }}>
                {t("Solve statistics", "还原统计")}
              </Txt>
              <Txt small>
                {t(
                  "Most recent 1,000 eligible approved race/daily solves. Categories stay separate; these are not official competition records.",
                  "最近一千次当前符合条件的核准竞速／每日还原，类别分别统计，并非官方比赛记录。",
                )}
              </Txt>
              {profile.statistics.categories.map((s) => (
                <Txt key={s.puzzle + s.input}>
                  {s.puzzle === "pyraminx"
                    ? t("Pyraminx", "金字塔")
                    : s.puzzle.replace("x", "×")}{" "}
                  /{" "}
                  {s.input === "virtual"
                    ? t("Virtual", "虚拟")
                    : s.input === "scan"
                      ? t("Physical", "实物")
                      : t("Smart", "智能")}{" "}
                  / {t(s.solves + " solves", s.solves + " 次")} /{" "}
                  {t("Best", "最快")} {(s.bestMs / 1000).toFixed(2)}s
                </Txt>
              ))}
              {!profile.statistics.categories.length && (
                <Txt small>
                  {t("No eligible solves yet.", "尚无符合条件的还原。")}
                </Txt>
              )}
            </Card>
          )}
          {profile.friends && (
            <Card>
              <Txt style={{ fontWeight: "600", fontSize: 21 }}>
                {t("Friends", "好友")}
              </Txt>
              <Txt small>
                {t(
                  "Only friendships both people choose to share with you appear here.",
                  "仅显示双方都选择向你分享的好友关系。",
                )}
              </Txt>
              {profile.friends.items.map((peer) => (
                <Row key={peer.id}>
                  <ProfileAvatar avatar={peer.avatar} size={38} />
                  <Button
                    small
                    kind="secondary"
                    label={peer.displayName}
                    onPress={() =>
                      router.push({
                        pathname: "/profile/[id]",
                        params: { id: peer.id },
                      })
                    }
                  />
                </Row>
              ))}
              {profile.friends.nextCursor && (
                <Button
                  kind="secondary"
                  label={t("More friends", "更多好友")}
                  disabled={busy}
                  onPress={() => void more("friends")}
                />
              )}
            </Card>
          )}
          {profile.clubs && (
            <Card>
              <Txt style={{ fontWeight: "600", fontSize: 21 }}>
                {t("Clubs", "社团")}
              </Txt>
              {profile.clubs.items.map((club) => (
                <Button
                  key={club.id}
                  kind="secondary"
                  label={
                    club.name + (club.private ? t(" / Private", " / 私密") : "")
                  }
                  onPress={() =>
                    router.push({
                      pathname: "/club/[id]",
                      params: { id: club.id },
                    })
                  }
                />
              ))}
              {profile.clubs.nextCursor && (
                <Button
                  kind="secondary"
                  label={t("More clubs", "更多社团")}
                  disabled={busy}
                  onPress={() => void more("clubs")}
                />
              )}
            </Card>
          )}
          {user?.id !== id && (
            <Card>
              <Button
                kind="secondary"
                label={t("Friends and mentorship", "好友与指导")}
                onPress={() =>
                  router.push({
                    pathname: "/connections",
                    params: { targetId: id },
                  })
                }
              />
              <Field
                label={t("Report a concern", "举报问题")}
                value={reason}
                onChangeText={setReason}
                maxLength={1000}
                multiline
              />
              <Button
                kind="secondary"
                label={t("Send report", "提交举报")}
                disabled={busy || reason.trim().length < 5}
                onPress={() => {
                  setBusy(true);
                  void api("reports", { targetId: id, reason })
                    .then(() => {
                      setReason("");
                      setMessage(
                        t("Report sent for review.", "举报已提交审核。"),
                      );
                    })
                    .catch((e) => setMessage(e.message))
                    .finally(() => setBusy(false));
                }}
              />
              <Button
                kind="secondary"
                label={t("Block this account", "屏蔽此账号")}
                disabled={busy}
                onPress={() => {
                  setBusy(true);
                  void api("social", {
                    targetId: id,
                    kind: "block",
                    enabled: true,
                  })
                    .then(() => {
                      setProfile(undefined);
                      setMessage(t("Account blocked.", "已屏蔽此账号。"));
                    })
                    .catch((e) => setMessage(e.message))
                    .finally(() => setBusy(false));
                }}
              />
            </Card>
          )}
          {!!message && <Notice text={message} />}
        </>
      )}
    </Screen>
  );
}
