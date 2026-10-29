import React, { useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useApp } from "../src/state";
import { invitationFromParams, invitationSignIn } from "../src/invitations";
import { Screen, Heading, Card, Txt, Button, Notice, Busy } from "../src/ui";

export default function InvitationPage() {
  const { token, region, loading } = useApp();
  const params = useLocalSearchParams();
  const invite = invitationFromParams(params);
  // Discard private errors and in-flight callbacks on account or link changes.
  return (
    <InvitationView
      key={JSON.stringify([token, region, invite])}
      params={params}
      loading={loading}
    />
  );
}
function InvitationView({
  params,
  loading,
}: {
  params: Record<string, unknown>;
  loading: boolean;
}) {
  const { token, region, regionReady, api, user, t } = useApp(),
    invite = invitationFromParams(params),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const active = useRef(true);
  React.useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  if (loading) return <Busy />;
  const mismatch =
    regionReady && !!invite?.community && invite.community !== region;
  async function accept() {
    if (!invite || !token || mismatch || busy) return;
    setBusy(true);
    setError("");
    try {
      if (invite.kind === "replay") {
        if (active.current)
          router.replace({
            pathname: "/replay/[id]",
            params: {
              id: invite.code,
              shared: "true",
              key: invite.key!,
              community: invite.community!,
            },
          });
        return;
      }
      // Server checks current consent, region, code rotation, membership and room state.
      const result = await api(
        invite.kind === "club" ? "clubs/invite" : "rooms/join",
        { code: invite.code },
      );
      if (!active.current) return;
      router.replace(
        invite.kind === "club" ? `/club/${result.id}` : `/room/${result.id}`,
      );
    } catch (e) {
      if (active.current) setError((e as Error).message);
    } finally {
      if (active.current) setBusy(false);
    }
  }
  return (
    <Screen>
      <Heading>
        {invite?.kind === "replay"
          ? t("A shared solve replay", "分享的还原回放")
          : t("An invitation to cube together", "一起玩魔方的邀请")}
      </Heading>
      {!invite ? (
        <Notice
          error
          text={t(
            "This invitation link is invalid. Ask the sender for a fresh link.",
            "邀请链接无效，请向邀请人索取新链接。",
          )}
        />
      ) : (
        <Card>
          <Txt>
            {invite.kind === "replay"
              ? t(
                  "Sign in to view an anonymous solve replay. Links expire and can be withdrawn. The replay contains no identity, recording or room membership; it cannot award progress or ranking credit.",
                  "登录后可查看匿名还原回放。链接会过期，也可能被撤回。回放不包含身份、录像或房间权限，也不会增加学习进度或排名积分。",
                )
              : invite.kind === "club"
                ? t(
                    "Sign in to review a club membership request. The club may require approval; opening this link does not join it.",
                    "登录后可申请加入社团，社团可能需要审批；打开链接不会自动加入。",
                  )
                : t(
                    "Sign in to join a room. Opening this link does not join or start a solve.",
                    "登录后可加入房间；打开链接不会自动加入或开始还原。",
                  )}
          </Txt>
          <Txt>
            {t("Invitation community: ", "邀请所属社区：")}
            {invite.community
              ? invite.community === "CN"
                ? t("Mainland China", "中国大陆")
                : t("International", "国际社区")
              : t(
                  "Not specified — checked in your current community only",
                  "未标注，将仅在当前社区核验",
                )}
          </Txt>
          {mismatch && (
            <Notice
              error
              text={t(
                "This invitation belongs to another community. Your community is detected from your connection and accounts remain separate. Ask for an invitation in your community; this link cannot change where you sign in.",
                "此邀请属于另一社区。社区按网络连接自动检测，账号相互独立。请索取当前社区的邀请，此链接不会更改登录社区。",
              )}
            />
          )}
          {!token ? (
            <Button
              label={t("Sign in to continue", "登录后继续")}
              onPress={() => router.replace(invitationSignIn(invite))}
            />
          ) : (
            <Button
              disabled={busy || mismatch || !user}
              label={
                busy
                  ? t("Please wait…", "请稍候……")
                  : invite.kind === "replay"
                    ? t("View shared replay", "查看分享回放")
                    : invite.kind === "club"
                      ? t("Request club membership", "申请加入社团")
                      : t("Join room", "加入房间")
              }
              onPress={() => void accept()}
            />
          )}
          {!!error && <Notice error text={error} />}
          <Txt small>
            {t(
              "Expired, replaced or unavailable invitations cannot grant access. Your current account and guardian permissions still apply.",
              "已过期、已更换或不可用的邀请无法授予访问权限，仍须满足当前账号与监护授权条件。",
            )}
          </Txt>
        </Card>
      )}
      <Button
        kind="secondary"
        label={t("Dismiss invitation", "忽略邀请")}
        onPress={() => router.replace(token ? "/(tabs)" : "/")}
      />
    </Screen>
  );
}
