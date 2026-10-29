import React, { useCallback, useState } from "react";
import { Switch, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useApp } from "./state";
import { Button, Card, Row, Field, Txt, Notice, useTheme } from "./ui";
export function ClubDirectory({
  initialInvite = "",
}: {
  initialInvite?: string;
}) {
  const { api, t, user } = useApp(),
    c = useTheme(),
    [clubs, setClubs] = useState<any[]>([]),
    [mine, setMine] = useState<any[]>([]),
    [invite, setInvite] = useState(initialInvite);
  const [creating, setCreating] = useState(false),
    [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [privateClub, setPrivate] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const load = useCallback(
    () =>
      Promise.all([api("clubs"), api("clubs/mine")])
        .then(([clubs, mine]) => {
          setClubs(clubs);
          setMine(mine);
        })
        .catch((error) => setMessage(error.message)),
    [api],
  );
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  async function request(path: string, body: unknown) {
    setBusy(true);
    setMessage("");
    try {
      const result = await api(path, body);
      await load();
      return result;
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Txt style={{ fontSize: 22, fontWeight: "600" }}>
        {t("Find your circle", "找到你的圈子")}
      </Txt>
      <Card>
        <Field
          label={t("Private invitation code", "私密社团邀请码")}
          value={invite}
          onChangeText={setInvite}
          autoCapitalize="none"
          maxLength={80}
        />
        <Button
          kind="secondary"
          label={t("Request membership with invitation", "使用邀请申请加入")}
          disabled={busy || !invite.trim()}
          onPress={() =>
            void request("clubs/invite", { code: invite.trim() }).then(
              (club) => {
                if (club) {
                  setInvite("");
                  router.push(`/club/${club.id}`);
                }
              },
            )
          }
        />
      </Card>
      {!!mine.length && (
        <>
          <Txt style={{ fontWeight: "600" }}>
            {t("Your clubs and requests", "我的社团与申请")}
          </Txt>
          {mine.map((club) => (
            <View
              key={club.id}
              style={{
                gap: 12,
                paddingVertical: 18,
                borderTopWidth: 1,
                borderColor: c.line,
              }}
            >
              <Txt style={{ fontWeight: "600" }}>{club.name}</Txt>
              <Txt small>
                {club.ownerId === user?.id
                  ? t("Managed by you", "由你管理")
                  : club.membership === "APPROVED"
                    ? t("Member", "已加入")
                    : t("Membership request", "成员申请")}{" "}
                /{" "}
                {club.status === "APPROVED"
                  ? t("Open", "已开放")
                  : club.status === "PENDING"
                    ? t("Club review pending", "社团待审核")
                    : club.status === "ARCHIVED"
                      ? t("Archived", "已归档")
                      : t("Not approved", "未通过审核")}
              </Txt>
              <Button
                small
                label={t("Open club", "打开社团")}
                onPress={() => router.push(`/club/${club.id}`)}
              />
            </View>
          ))}
        </>
      )}
      <Txt style={{ fontWeight: "600" }}>{t("Public clubs", "公开社团")}</Txt>
      {clubs
        .filter((club) => !club.private)
        .map((club) => (
          <View
            key={club.id}
            style={{
              gap: 12,
              paddingVertical: 18,
              borderTopWidth: 1,
              borderColor: c.line,
            }}
          >
            <Txt style={{ fontWeight: "600" }}>{club.name}</Txt>
            <Txt small>{club.description}</Txt>
            <Row>
              <Button
                small
                kind="secondary"
                label={t("View discussions", "查看讨论")}
                onPress={() => router.push(`/club/${club.id}`)}
              />
              {club.membership !== "APPROVED" && (
                <Button
                  small
                  label={t("Join club", "加入社团")}
                  disabled={busy}
                  onPress={() => void request(`clubs/${club.id}/join`, {})}
                />
              )}
            </Row>
          </View>
        ))}
      {!clubs.some((club) => !club.private) && (
        <Txt small>
          {t(
            "There are no reviewed public clubs yet.",
            "暂时没有已审核的公开社团。",
          )}
        </Txt>
      )}
      {user?.guardianEligible && (
        <Button
          kind="secondary"
          label={t("Create a club", "创建社团")}
          onPress={() => setCreating(!creating)}
        />
      )}
      {creating && (
        <Card>
          <Txt style={{ fontWeight: "600" }}>
            {t("A welcoming place to cube", "一起转动的友好空间")}
          </Txt>
          <Notice
            text={t(
              "Clubs need review before opening. Use a general description; keep children's schools and contact details private.",
              "社团通过审核后才能开放。请使用一般性介绍，不要公开儿童的学校和联系方式。",
            )}
          />
          <Field
            label={t("Club name", "社团名称")}
            value={name}
            onChangeText={setName}
            maxLength={80}
          />
          <Field
            label={t("Description", "介绍")}
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={1000}
          />
          <Row style={{ justifyContent: "space-between" }}>
            <Txt>
              {t(
                "Private · invitation and approval required",
                "私密 · 需要邀请及批准",
              )}
            </Txt>
            <Switch
              accessibilityLabel={t("Private club", "私密社团")}
              value={privateClub}
              onValueChange={setPrivate}
            />
          </Row>
          <Button
            label={t("Send club for review", "提交社团审核")}
            disabled={busy || name.trim().length < 2}
            onPress={() =>
              void request("clubs", {
                name,
                description,
                private: privateClub,
              }).then((club) => {
                if (club) {
                  setCreating(false);
                  setName("");
                  setDescription("");
                  router.push(`/club/${club.id}`);
                }
              })
            }
          />
        </Card>
      )}
      {!!message && <Notice text={message} error />}
    </>
  );
}
