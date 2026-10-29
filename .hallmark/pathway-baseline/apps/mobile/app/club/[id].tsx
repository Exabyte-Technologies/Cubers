import React, { useCallback, useEffect, useRef, useState } from "react";
import { Switch, Share } from "react-native";
import {
  router,
  Redirect,
  useLocalSearchParams,
  useFocusEffect,
} from "expo-router";
import { useApp } from "../../src/state";
import {
  Screen,
  Heading,
  Card,
  Row,
  Txt,
  Button,
  Field,
  Notice,
  Busy,
  useTheme,
} from "../../src/ui";
import { invitationLink } from "../../src/invitations";
import { PostComposer } from "../../src/PostComposer";
import { PostCard } from "../../src/PostCard";
import type { CommunityPost } from "../../src/community.shared";
export default function Club() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token, region } = useApp();
  if (!token) return <Redirect href="/" />;
  return <ClubView key={JSON.stringify([id, token, region])} id={id} />;
}
function ClubView({ id }: { id: string }) {
  const { api, t, token, user, region } = useApp();
  const c = useTheme();
  const [club, setClub] = useState<any>(),
    [announcements, setAnnouncements] = useState<CommunityPost[]>([]),
    [announcementCursor, setAnnouncementCursor] = useState<string | null>(null),
    [posts, setPosts] = useState<CommunityPost[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [members, setMembers] = useState<any[]>([]);
  const [compose, setCompose] = useState(false),
    [editing, setEditing] = useState(false),
    [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [privateClub, setPrivate] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [leaving, setLeaving] = useState(false);
  const generation = useRef(0),
    paging = useRef(false);
  const load = useCallback(async () => {
    const current = ++generation.current;
    paging.current = false;
    setBusy(false);
    setMessage("");
    setClub(undefined);
    setPosts([]);
    setAnnouncements([]);
    setMembers([]);
    setCursor(null);
    setAnnouncementCursor(null);
    try {
      const club = await api(`clubs/${id}`);
      const [announcementPage, discussionPage, members] = await Promise.all([
        club.canRead
          ? api(`feed?clubId=${id}&postKind=ANNOUNCEMENT`)
          : { items: [], nextCursor: null },
        club.canRead
          ? api(`feed?clubId=${id}&postKind=DISCUSSION`)
          : { items: [], nextCursor: null },
        club.owner || club.membership === "APPROVED"
          ? api(`clubs/${id}/members`)
          : [],
      ]);
      if (current !== generation.current) return;
      setClub(club);
      setAnnouncements(announcementPage.items);
      setAnnouncementCursor(announcementPage.nextCursor);
      setPosts(discussionPage.items);
      setCursor(discussionPage.nextCursor);
      setMembers(members);
    } catch (error) {
      if (current === generation.current) setMessage((error as Error).message);
    }
  }, [api, id]);
  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        generation.current++;
      };
    }, [load]),
  );
  useEffect(() => {
    if (club) {
      setName(club.name);
      setDescription(club.description);
      setPrivate(club.private);
    }
  }, [club?.id, club?.revision]);
  async function act(path: string, body?: unknown, method?: string) {
    const current = generation.current;
    setBusy(true);
    setMessage("");
    try {
      const value = await api(path, body, method);
      if (current !== generation.current) return;
      await load();
      return value;
    } catch (error) {
      if (current === generation.current) setMessage((error as Error).message);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  async function more(kind: "DISCUSSION" | "ANNOUNCEMENT") {
    const nextPage = kind === "ANNOUNCEMENT" ? announcementCursor : cursor;
    if (!nextPage || paging.current) return;
    const current = generation.current;
    paging.current = true;
    setBusy(true);
    try {
      const result = await api(
        `feed?clubId=${id}&postKind=${kind}&cursor=${encodeURIComponent(nextPage)}`,
      );
      if (current !== generation.current) return;
      const update = kind === "ANNOUNCEMENT" ? setAnnouncements : setPosts;
      update((rows) => [
        ...rows,
        ...result.items.filter(
          (item: CommunityPost) => !rows.some((row) => row.id === item.id),
        ),
      ]);
      if (kind === "ANNOUNCEMENT") setAnnouncementCursor(result.nextCursor);
      else setCursor(result.nextCursor);
      setMessage("");
    } catch (error) {
      if (current === generation.current) {
        const failure = error as Error & { status?: number };
        if (failure.status === 403 || failure.status === 404) {
          setClub(undefined);
          setAnnouncements([]);
          setPosts([]);
          setMembers([]);
          setCursor(null);
          setAnnouncementCursor(null);
        }
        setMessage(
          failure.status === 400
            ? t(
                "This saved page expired or changed. Refresh the club posts to continue.",
                "保存的分页位置已过期或发生变化，请刷新社团帖子后继续。",
              )
            : failure.message,
        );
      }
    } finally {
      if (current === generation.current) {
        paging.current = false;
        setBusy(false);
      }
    }
  }
  if (!token) return <Redirect href="/" />;
  return (
    <Screen>
      <Button
        small
        kind="secondary"
        label={t("Clubs", "返回社团")}
        onPress={() => router.back()}
      />
      {!club ? (
        message ? (
          <Notice text={message} error />
        ) : (
          <Busy />
        )
      ) : (
        <>
          <Card style={{ backgroundColor: c.lavender }}>
          <Heading
            eyebrow={
              club.private
                ? t("A private circle", "私密圈子")
                : t("A shared fascination", "共同的热爱")
            }
          >
            {club.name}
          </Heading>
          <Txt>{club.description}</Txt>
          </Card>
          {club.status !== "APPROVED" && (
            <Notice
              text={
                club.status === "ARCHIVED"
                  ? t(
                      "This club is archived. Existing members can read its history.",
                      "此社团已归档，原成员可以查看历史内容。",
                    )
                  : club.status === "PENDING"
                    ? t(
                        "Club details are awaiting moderation. Discussions reopen after approval.",
                        "社团资料正在审核，通过后重新开放讨论。",
                      )
                    : `${t("Club not approved", "社团未获批准")}${club.reason ? ` / ${club.reason}` : ""}`
              }
            />
          )}
          {club.membership === "PENDING" && (
            <Notice
              text={t(
                "Your membership request is waiting for the owner. Private conversations open after approval.",
                "成员申请正等待负责人批准，通过后可查看私密讨论。",
              )}
            />
          )}
          {club.owner ? (
            <Card>
              <Txt style={{ fontWeight: "600" }}>
                {t("Manage your club", "管理社团")}
              </Txt>
              <Button
                small
                kind="secondary"
                label={t("Review mentorship requests", "审核指导申请")}
                disabled={club.status !== "APPROVED"}
                onPress={() =>
                  router.push({
                    pathname: "/connections",
                    params: { reviewClubId: id },
                  })
                }
              />
              <Row>
                <Button
                  small
                  kind="secondary"
                  label={t("Edit club details", "编辑社团资料")}
                  disabled={club.status === "ARCHIVED"}
                  onPress={() => setEditing(!editing)}
                />
                {club.status === "APPROVED" && (
                  <Button
                    small
                    kind="secondary"
                    label={t("Share invitation", "分享邀请")}
                    onPress={() =>
                      void Share.share({
                        title: club.name,
                        message: `${club.name}\n${invitationLink({ kind: "club", code: club.inviteCode, community: region })}`,
                      }).catch((error) => setMessage(error.message))
                    }
                  />
                )}
              </Row>
              {club.status === "APPROVED" && (
                <Button
                  small
                  kind="secondary"
                  label={t("Replace invitation code", "更换邀请码")}
                  disabled={busy}
                  onPress={() => void act(`clubs/${id}/invite/rotate`, {})}
                />
              )}
              {editing && (
                <>
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
                    <Txt>{t("Private club", "私密社团")}</Txt>
                    <Switch
                      accessibilityLabel={t("Private club", "私密社团")}
                      value={privateClub}
                      onValueChange={setPrivate}
                    />
                  </Row>
                  <Notice
                    text={t(
                      "Changes return the club to moderation. Discussions pause until approval.",
                      "修改后社团将重新审核，通过前暂停讨论。",
                    )}
                  />
                  <Button
                    label={t("Save and send for review", "保存并提交审核")}
                    disabled={busy || name.trim().length < 2}
                    onPress={() =>
                      void act(
                        `clubs/${id}`,
                        { name, description, private: privateClub },
                        "PATCH",
                      ).then((result) => {
                        if (result) setEditing(false);
                      })
                    }
                  />
                </>
              )}
            </Card>
          ) : club.membership ? (
            <Row>
              <Button
                small
                kind="secondary"
                label={
                  leaving
                    ? t("Confirm leaving / withdrawing", "确认退出／撤回申请")
                    : t("Leave club / withdraw request", "退出社团／撤回申请")
                }
                disabled={busy}
                onPress={() => {
                  if (!leaving) setLeaving(true);
                  else
                    void act(
                      `clubs/${id}/membership`,
                      undefined,
                      "DELETE",
                    ).then((value) => {
                      if (value) router.back();
                    });
                }}
              />
            </Row>
          ) : (
            !club.private &&
            club.status === "APPROVED" && (
              <Button
                label={t("Join this club", "加入社团")}
                disabled={busy}
                onPress={() => void act(`clubs/${id}/join`, {})}
              />
            )
          )}
          {!!members.length && (
            <Card>
              <Txt style={{ fontSize: 20, fontWeight: "600" }}>
                {t("Members", "成员")}
              </Txt>
              {members.map((member) => (
                <Row
                  key={member.userId}
                  style={{ justifyContent: "space-between" }}
                >
                  <Txt>
                    {member.displayName} /{" "}
                    {member.status === "APPROVED"
                      ? t("Member", "成员")
                      : member.status === "PENDING"
                        ? t("Requested", "待批准")
                        : member.status === "BANNED"
                          ? t("Removed", "已移除")
                          : t("Not approved", "未批准")}
                  </Txt>
                  {member.status === "APPROVED" &&
                    member.userId !== user?.id &&
                    club.membership === "APPROVED" && (
                      <Button
                        small
                        kind="secondary"
                        label={t("Connect", "建立关系")}
                        onPress={() =>
                          router.push({
                            pathname: "/connections",
                            params: { targetId: member.userId, clubId: id },
                          })
                        }
                      />
                    )}
                  {club.owner &&
                    member.userId !== user?.id &&
                    club.status === "APPROVED" && (
                      <Row>
                        {member.status === "PENDING" && (
                          <>
                            <Button
                              small
                              label={t("Approve", "批准")}
                              disabled={busy}
                              onPress={() =>
                                void act(
                                  `clubs/${id}/members/${member.userId}`,
                                  { status: "APPROVED" },
                                )
                              }
                            />
                            <Button
                              small
                              kind="secondary"
                              label={t("Decline", "拒绝")}
                              disabled={busy}
                              onPress={() =>
                                void act(
                                  `clubs/${id}/members/${member.userId}`,
                                  { status: "REJECTED" },
                                )
                              }
                            />
                          </>
                        )}
                        {member.status === "APPROVED" && (
                          <Button
                            small
                            kind="secondary"
                            label={t("Remove member", "移除成员")}
                            disabled={busy}
                            onPress={() =>
                              void act(`clubs/${id}/members/${member.userId}`, {
                                status: "BANNED",
                              })
                            }
                          />
                        )}
                      </Row>
                    )}
                </Row>
              ))}
            </Card>
          )}
          {club.canPost && (
            <Button
              kind="secondary"
              label={t("Start a discussion / announcement", "发起讨论／公告")}
              onPress={() => setCompose(!compose)}
            />
          )}
          {compose && club.canPost && (
            <PostComposer
              clubId={id}
              canAnnounce={club.owner}
              onCancel={() => setCompose(false)}
              onSubmitted={() => {
                setCompose(false);
                setMessage(
                  t(
                    "Post sent for review. Check Profile for its status.",
                    "帖子已提交审核，可在个人页查看状态。",
                  ),
                );
                void load();
              }}
            />
          )}
          {club.canRead && (
            <>
              <Txt style={{ fontSize: 21, fontWeight: "600" }}>
                {t("Announcements", "公告")}
              </Txt>
              {announcements.length ? (
                announcements.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onChanged={() => void load()}
                  />
                ))
              ) : (
                <Txt small>
                  {t(
                    "No published announcements yet.",
                    "暂时没有已发布的公告。",
                  )}
                </Txt>
              )}
              {announcementCursor && (
                <Button
                  kind="secondary"
                  label={t("More announcements", "更多公告")}
                  disabled={busy}
                  onPress={() => void more("ANNOUNCEMENT")}
                />
              )}
              <Txt style={{ fontSize: 21, fontWeight: "600" }}>
                {t("Discussions", "讨论")}
              </Txt>
              {posts.length ? (
                posts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onChanged={() => void load()}
                  />
                ))
              ) : (
                <Txt small>
                  {t("No published discussions yet.", "暂时没有已发布的讨论。")}
                </Txt>
              )}
              {cursor && (
                <Button
                  kind="secondary"
                  label={t("More discussions", "更多讨论")}
                  disabled={busy}
                  onPress={() => void more("DISCUSSION")}
                />
              )}
              <Button
                small
                kind="secondary"
                label={t("Refresh club posts", "刷新社团帖子")}
                disabled={busy}
                onPress={() => void load()}
              />
            </>
          )}
          {!!message && <Notice text={message} />}
        </>
      )}
    </Screen>
  );
}
