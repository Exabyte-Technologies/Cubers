import React, { useState, useCallback } from "react";
import { Switch } from "react-native";
import {
  router,
  Redirect,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";
import { useApp } from "../src/state";
import {
  Screen,
  Heading,
  Card,
  Txt,
  Button,
  Row,
  Chip,
  Notice,
  Field,
  Busy,
} from "../src/ui";
import type { ConnectionView, ConnectionPreferences } from "@cubers/core";
type ReviewView = ConnectionView & { canGuardianApprove?: boolean };
export default function ConnectionsScreen() {
  const { api, t, token, user } = useApp();
  const { targetId, clubId, childId, reviewClubId } = useLocalSearchParams<{
    targetId?: string;
    clubId?: string;
    childId?: string;
    reviewClubId?: string;
  }>();
  const [rows, setRows] = useState<ReviewView[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [history, setHistory] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [target, setTarget] = useState<any>(),
    [selectedClub, setSelectedClub] = useState<string | undefined>(clubId),
    [settings, setSettings] = useState<
      ConnectionPreferences & {
        canOfferMentoring: boolean;
        canReceiveFromAnyone: boolean;
      }
    >(),
    [capacity, setCapacity] = useState("5");
  const reviewing = !!childId || !!reviewClubId;
  const path = childId
    ? `guardian/connections?childId=${childId}`
    : reviewClubId
      ? `clubs/${reviewClubId}/connections`
      : `connections?filter=${history ? "history" : "current"}`;
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api(path);
      setRows(result.items);
      setCursor(result.nextCursor);
      if (!reviewing) {
        const s = await api("me/connection-settings");
        setSettings(s);
        setCapacity(String(s.mentorCapacity));
      }
      if (targetId && !reviewing) {
        const preview = await api(`connection-targets/${targetId}`);
        setTarget(preview);
        setSelectedClub((old) =>
          old && preview.clubs.some((club: any) => club.id === old)
            ? old
            : preview.clubRequired
              ? preview.clubs[0]?.id
              : "",
        );
      }
    } catch (error) {
      setRows([]);
      setTarget(undefined);
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [api, path, reviewing, targetId]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  async function act(endpoint: string, body: unknown, notice?: string) {
    setBusy(true);
    setMessage("");
    try {
      await api(endpoint, body);
      await load();
      setMessage(notice || t("Updated.", "已更新。"));
    } catch (error) {
      setMessage((error as Error).message);
      await load();
    } finally {
      setBusy(false);
    }
  }
  async function more() {
    if (!cursor) return;
    setBusy(true);
    try {
      const result = await api(
        `${path}${path.includes("?") ? "&" : "?"}cursor=${cursor}`,
      );
      setRows((old) => [
        ...old,
        ...result.items.filter(
          (row: ReviewView) => !old.some((item) => item.id === row.id),
        ),
      ]);
      setCursor(result.nextCursor);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const status = (row: ConnectionView) =>
    row.status === "ACCEPTED"
      ? row.active
        ? t("Connected", "已建立关系")
        : t(
            "Paused — permissions or review needed",
            "已暂停，需确认权限或重新审核",
          )
      : row.status === "PENDING"
        ? t("Waiting for acceptance and approvals", "等待接受与批准")
        : row.status === "DECLINED"
          ? t("Declined", "已拒绝")
          : row.status === "CANCELLED"
            ? t("Cancelled", "已取消")
            : row.status === "ENDED"
              ? t("Ended", "已结束")
              : t("Expired", "已过期");
  if (!token) return <Redirect href="/" />;
  return (
    <Screen>
      <Button
        small
        kind="secondary"
        label={t("← Back", "← 返回")}
        onPress={() => router.back()}
      />
      <Heading
        eyebrow={
          reviewing
            ? t("A trusted circle", "可信赖的圈子")
            : t("Practice is better together", "一起练习，一起进步")
        }
      >
        {childId
          ? t("Child connections", "孩子的关系申请")
          : reviewClubId
            ? t("Mentorship review", "指导关系审核")
            : t("Friends & mentors", "好友与指导")}
      </Heading>
      <Txt>
        {t(
          "Friendship needs both people's acceptance. Mentorship involving minors stays in an approved shared club, with independent review. Younger children also need guardian approval. Talk in moderated club discussions; this does not open private messaging.",
          "好友关系需要双方同意。涉及未成年人的指导关系须在双方已加入的合规社团内进行，并经独立审核；低龄儿童还需监护人批准。请在受审核的社团讨论中交流，建立关系不会开通私信。",
        )}
      </Txt>
      {!!message && <Notice text={message} />}
      {!reviewing && target && (
        <Card>
          <Txt style={{ fontWeight: "700", fontSize: 20 }}>
            {target.displayName}
          </Txt>
          {!target.accepting ? (
            <Notice
              text={t(
                "This cuber is not accepting new requests.",
                "这位用户暂不接受新的关系申请。",
              )}
            />
          ) : (
            <>
              <Txt small>
                {t(
                  "Choose the shared club where you will practise.",
                  "选择一起练习的社团。",
                )}
              </Txt>
              <Row>
                {!target.clubRequired && (
                  <Chip
                    label={t("Outside a club", "不指定社团")}
                    selected={selectedClub === ""}
                    onPress={() => setSelectedClub("")}
                  />
                )}
                {target.clubs.map((club: any) => (
                  <Chip
                    key={club.id}
                    label={club.name}
                    selected={selectedClub === club.id}
                    onPress={() => setSelectedClub(club.id)}
                  />
                ))}
              </Row>
              <Row>
                {(
                  [
                    "FRIEND",
                    ...(target.offersMentoring ? ["MENTORSHIP"] : []),
                  ] as ("FRIEND" | "MENTORSHIP")[]
                ).map((kind) => (
                  <Button
                    key={kind}
                    small
                    disabled={
                      busy ||
                      (target.clubRequired && !selectedClub) ||
                      target.current.some(
                        (row: any) =>
                          row.kind === kind &&
                          ["PENDING", "ACCEPTED"].includes(row.status),
                      )
                    }
                    label={
                      kind === "FRIEND"
                        ? t("Ask to be friends", "发送好友申请")
                        : t("Request guidance", "申请指导")
                    }
                    onPress={() =>
                      void act(
                        "connections",
                        {
                          targetId,
                          kind,
                          ...(selectedClub ? { clubId: selectedClub } : {}),
                        },
                        t(
                          "Request sent. It will activate only after acceptance and all required approvals.",
                          "申请已发送，须完成接受及所有必要批准后才会生效。",
                        ),
                      )
                    }
                  />
                ))}
              </Row>
            </>
          )}
        </Card>
      )}
      {!reviewing && settings && (
        <Card>
          <Txt style={{ fontWeight: "700", fontSize: 20 }}>
            {t("Who can send requests?", "谁可以向我发起申请？")}
          </Txt>
          <Row>
            {(
              [
                "CLUB",
                ...(settings.canReceiveFromAnyone ? ["ANY"] : []),
                "NONE",
              ] as ConnectionPreferences["requests"][]
            ).map((value) => (
              <Chip
                key={value}
                selected={settings.requests === value}
                label={
                  value === "CLUB"
                    ? t("Shared club members", "共同社团成员")
                    : value === "ANY"
                      ? t("Any cuber", "所有用户")
                      : t("No new requests", "不接受新申请")
                }
                onPress={() => setSettings({ ...settings, requests: value })}
              />
            ))}
          </Row>
          {settings.canOfferMentoring ? (
            <>
              <Row>
                <Txt>{t("Offer mentorship", "接受指导申请")}</Txt>
                <Switch
                  accessibilityLabel={t("Offer mentorship", "接受指导申请")}
                  value={settings.offerMentoring}
                  onValueChange={(offerMentoring) =>
                    setSettings({ ...settings, offerMentoring })
                  }
                />
              </Row>
              {settings.offerMentoring && (
                <Field
                  label={t(
                    "Available mentorship places (1–20)",
                    "指导名额（1–20）",
                  )}
                  value={capacity}
                  onChangeText={setCapacity}
                  keyboardType="number-pad"
                />
              )}
            </>
          ) : (
            <Txt small>
              {t(
                "Offering mentorship requires independent adult verification.",
                "提供指导须先通过独立的成年人身份核验。",
              )}
            </Txt>
          )}
          <Txt small>
            {t(
              "Closing new requests keeps existing connections. You can end an existing connection below.",
              "关闭新申请不会解除现有关系。你可以在下方单独结束某段关系。",
            )}
          </Txt>
          <Button
            small
            disabled={busy}
            label={t("Save request settings", "保存申请设置")}
            onPress={() =>
              void act("me/connection-settings", {
                requests: settings.requests,
                offerMentoring: settings.offerMentoring,
                mentorCapacity: Number(capacity),
              })
            }
          />
        </Card>
      )}
      <Row>
        <Txt style={{ fontSize: 20, fontWeight: "700" }}>
          {reviewing
            ? t("Requests to review", "待处理申请")
            : t("Your connections", "我的关系")}
        </Txt>
        <Button
          small
          kind="secondary"
          disabled={busy}
          label={t("Refresh", "刷新")}
          onPress={() => void load()}
        />
        {!reviewing && (
          <Chip
            selected={history}
            label={t("Include history", "查看历史")}
            onPress={() => setHistory(!history)}
          />
        )}
      </Row>
      {loading ? (
        <Busy />
      ) : !rows.length ? (
        <Card>
          <Txt>
            {t(
              "No connections or requests here yet. Meet people in your clubs or open a cuber's post to send a request.",
              "这里还没有关系或申请。可以从社团成员列表或帖子中向用户发起申请。",
            )}
          </Txt>
        </Card>
      ) : (
        rows.map((row) => {
          const incoming = row.recipient.id === user?.id;
          const pending = row.status === "PENDING",
            accepted = row.status === "ACCEPTED";
          return (
            <Card key={row.id}>
              <Txt style={{ fontWeight: "700" }}>
                {reviewing
                  ? `${row.requester.displayName} ↔ ${row.recipient.displayName}`
                  : incoming
                    ? row.requester.displayName
                    : row.recipient.displayName}{" "}
                ·{" "}
                {row.kind === "FRIEND"
                  ? t("Friend", "好友")
                  : t("Mentorship", "指导关系")}
              </Txt>
              <Txt>{status(row)}</Txt>
              {row.club && (
                <Button
                  small
                  kind="secondary"
                  label={row.club.name}
                  onPress={() =>
                    router.push({
                      pathname: "/club/[id]",
                      params: { id: row.club!.id },
                    })
                  }
                />
              )}
              {(pending || accepted) && (
                <>
                  {row.needs.recipient && (
                    <Txt small>
                      {t(
                        "Waiting for the recipient to accept.",
                        "等待接收方接受。",
                      )}
                    </Txt>
                  )}
                  {row.needs.guardian && (
                    <Txt small>
                      {t(
                        "A linked guardian's approval is still needed.",
                        "仍需关联监护人批准。",
                      )}
                    </Txt>
                  )}
                  {row.needs.clubReview && (
                    <Txt small>
                      {t(
                        "Independent club or moderator review is still needed.",
                        "仍需独立的社团负责人或审核员审核。",
                      )}
                    </Txt>
                  )}
                  {!reviewing && (
                    <Row>
                      {pending && incoming && !row.recipientAccepted && (
                        <Button
                          small
                          disabled={busy || !!row.unavailable}
                          label={t("Accept", "接受")}
                          onPress={() =>
                            void act(`connections/${row.id}/action`, {
                              action: "ACCEPT",
                              version: row.version,
                            })
                          }
                        />
                      )}
                      <Button
                        small
                        kind="secondary"
                        disabled={busy}
                        label={
                          accepted
                            ? t("End connection", "结束关系")
                            : incoming
                              ? t("Decline", "拒绝")
                              : t("Cancel request", "取消申请")
                        }
                        onPress={() =>
                          void act(`connections/${row.id}/action`, {
                            action: accepted
                              ? "END"
                              : incoming
                                ? "DECLINE"
                                : "CANCEL",
                            version: row.version,
                          })
                        }
                      />
                    </Row>
                  )}
                  {childId && (
                    <Row>
                      {row.canGuardianApprove && (
                        <Button
                          small
                          disabled={busy || !!row.unavailable}
                          label={t(
                            "Approve for this child",
                            "批准这个孩子的申请",
                          )}
                          onPress={() =>
                            void act(`guardian/connections/${row.id}/review`, {
                              childId,
                              approve: true,
                              version: row.version,
                            })
                          }
                        />
                      )}
                      <Button
                        small
                        kind="secondary"
                        disabled={busy}
                        label={
                          accepted
                            ? t("End for this child", "为孩子结束关系")
                            : t("Decline for this child", "为孩子拒绝申请")
                        }
                        onPress={() =>
                          void act(`guardian/connections/${row.id}/review`, {
                            childId,
                            approve: false,
                            version: row.version,
                          })
                        }
                      />
                    </Row>
                  )}
                  {reviewClubId && (
                    <Row>
                      <Button
                        small
                        disabled={busy || !!row.unavailable}
                        label={t(
                          "Approve supervised mentorship",
                          "批准社团内的指导关系",
                        )}
                        onPress={() =>
                          void act(
                            `clubs/${reviewClubId}/connections/${row.id}/review`,
                            { approve: true, version: row.version },
                          )
                        }
                      />
                      <Button
                        small
                        kind="secondary"
                        disabled={busy}
                        label={t("Decline", "拒绝")}
                        onPress={() =>
                          void act(
                            `clubs/${reviewClubId}/connections/${row.id}/review`,
                            { approve: false, version: row.version },
                          )
                        }
                      />
                    </Row>
                  )}
                </>
              )}
            </Card>
          );
        })
      )}
      {!!cursor && (
        <Button
          kind="secondary"
          disabled={busy}
          label={t("Load more", "加载更多")}
          onPress={() => void more()}
        />
      )}
    </Screen>
  );
}
