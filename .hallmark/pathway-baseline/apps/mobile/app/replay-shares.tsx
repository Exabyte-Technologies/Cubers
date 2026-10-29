import React, { useCallback, useEffect, useRef, useState } from "react";
import { Share, Switch, AppState } from "react-native";
import {
  Redirect,
  router,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";
import {
  ReplaySharePreview,
  ReplayTimeline,
  isPyraminx,
  type ReplayShareView,
} from "@cubers/core";
import { useApp } from "../src/state";
import { invitationLink } from "../src/invitations";
import { CubeView } from "../src/CubeView";
import { PyraminxView } from "../src/PyraminxView";
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
} from "../src/ui";
export default function ReplaySharesPage() {
  const params = useLocalSearchParams<{ attemptId?: string; role?: string }>(),
    { token, user, region } = useApp();
  if (!token) return <Redirect href="/" />;
  return (
    <Page
      key={JSON.stringify([
        token,
        user?.id,
        region,
        params.role,
        params.attemptId,
      ])}
      attemptId={params.attemptId}
      role={params.role === "guardian" ? "guardian" : "owner"}
    />
  );
}
function Page({
  attemptId,
  role,
}: {
  attemptId?: string;
  role: "owner" | "guardian";
}) {
  const { api, t, region } = useApp(),
    base = role === "owner" ? "me/replay-shares" : "guardian/replay-shares",
    [rows, setRows] = useState<ReplayShareView[]>([]),
    [next, setNext] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [disclosure, setDisclosure] = useState(false),
    [checked, setChecked] = useState(false),
    [reason, setReason] = useState(""),
    [preview, setPreview] = useState<{
      row: ReplayShareView;
      data: ReplaySharePreview;
      timeline: ReplayTimeline;
    }>(),
    [index, setIndex] = useState(0),
    [link, setLink] = useState("");
  const visibility = useRef(0),
    operation = useRef(0),
    epoch = useRef(0),
    mounted = useRef(true),
    acting = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const sub = AppState.addEventListener("change", (value) => {
      if (value !== "active") {
        epoch.current++;
        visibility.current++;
        operation.current++;
        setPreview(undefined);
        setChecked(false);
        setLink("");
        setBusy(false);
        acting.current = false;
      }
    });
    return () => {
      mounted.current = false;
      visibility.current++;
      operation.current++;
      epoch.current++;
      sub.remove();
    };
  }, []);
  async function load(more = false) {
    const run = ++epoch.current;
    setBusy(true);
    setError("");
    setPreview(undefined);
    setChecked(false);
    setLink("");
    try {
      const result = await api<{
        items: ReplayShareView[];
        nextCursor: string | null;
      }>(base + (more && next ? `?cursor=${encodeURIComponent(next)}` : ""));
      if (mounted.current && epoch.current === run) {
        setRows((old) => (more ? [...old, ...result.items] : result.items));
        setNext(result.nextCursor);
      }
    } catch (e) {
      if (mounted.current && epoch.current === run)
        setError((e as Error).message);
    } finally {
      if (mounted.current && epoch.current === run) setBusy(false);
    }
  }
  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        epoch.current++;
        visibility.current++;
        operation.current++;
        setPreview(undefined);
        setLink("");
      };
    }, [api, base]),
  );
  async function action(work: () => Promise<void>) {
    if (acting.current) return;
    acting.current = true;
    const run = ++operation.current;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      if (mounted.current && run === operation.current)
        setError((e as Error).message);
    } finally {
      if (run === operation.current) {
        acting.current = false;
        if (mounted.current) setBusy(false);
      }
    }
  }
  async function inspect(row: ReplayShareView) {
    const run = ++epoch.current;
    setPreview(undefined);
    setChecked(false);
    setIndex(0);
    const data = ReplaySharePreview.parse(
        await api(`${base}/${row.id}/preview`, {}),
      ),
      timeline = await ReplayTimeline.create(
        data.packet,
        () => new Promise((resolve) => setTimeout(resolve, 0)),
        () => mounted.current && run === epoch.current,
      );
    if (mounted.current && run === epoch.current)
      setPreview({ row, data, timeline });
  }
  async function review(approve: boolean) {
    if (!preview) return;
    const { row, data } = preview;
    await api(`${base}/${row.id}/review`, {
      revision: data.revision,
      packetDigest: data.packetDigest,
      receipt: data.receipt,
      approve,
      packetChecked: checked,
      reason,
    });
    await load();
    setReason("");
  }
  const state = preview?.timeline.stateAt(
    Math.min(index, preview.timeline.packet.moves.length),
  );
  return (
    <Screen>
      <Button
        kind="secondary"
        label={t("Back", "返回")}
        onPress={() => router.back()}
      />
      <Heading>
        {role === "guardian"
          ? t("Review replay sharing", "审核回放分享")
          : t("Share a solve, anonymously", "匿名分享还原")}
      </Heading>
      <Notice
        text={t(
          "A shared replay includes the scramble, received turns, input category, server time and smart-model limitations. It contains no name, video, room access or original attempt identifier. Anyone with the link and an eligible account in this community can view it for up to seven days. Withdrawal stops new loads; already viewed copies cannot be recalled. Children need guardian and moderator review; teens need moderator review. No progress or ranking credit is awarded.",
          "分享包含打乱、收到的转动、输入类别、服务器用时和智能型号限制，不包含姓名、录像、房间权限或原始尝试标识。同社区持有链接的符合资格账号最多可查看七天。撤回会停止后续加载，已查看的副本无法收回。儿童需要监护人和管理员审核，青少年需要管理员审核，分享不会增加进度或排名积分。",
        )}
      />
      {role === "owner" && (
        <Card>
          <Row>
            <Txt>
              {t(
                "I understand what the link reveals",
                "我了解链接将分享的内容",
              )}
            </Txt>
            <Switch
              accessibilityLabel={t(
                "Confirm replay sharing disclosure",
                "确认回放分享说明",
              )}
              value={disclosure}
              onValueChange={setDisclosure}
            />
          </Row>
          {attemptId && (
            <Button
              disabled={busy || !disclosure}
              label={t("Prepare this replay", "准备分享此回放")}
              onPress={() =>
                void action(async () => {
                  await api(base, { attemptId, disclosureConfirmed: true });
                  await load();
                })
              }
            />
          )}
        </Card>
      )}
      {!!error && <Notice error text={error} />}
      <Button
        disabled={busy}
        kind="secondary"
        label={t("Refresh requests", "刷新申请")}
        onPress={() => void load()}
      />
      {busy && <Busy />}
      {rows.map((row) => (
        <Card key={row.id}>
          <Txt>
            {row.puzzle.replace("x", "×")} / {row.input} /{" "}
            {(row.durationMs / 1000).toFixed(2)}s
          </Txt>
          {row.subject && <Txt>{row.subject.displayName}</Txt>}
          <Txt small>
            {row.status} / {t("Expires", "到期")}{" "}
            {new Date(row.expiresAt).toLocaleString()}
          </Txt>
          {!!row.reason && <Txt small>{row.reason}</Txt>}
          <Button
            disabled={
              busy ||
              row.expired ||
              !["PENDING_GUARDIAN", "PENDING_REVIEW", "READY"].includes(
                row.status,
              )
            }
            label={t("Inspect exact replay", "查看待分享的回放")}
            onPress={() => void action(() => inspect(row))}
          />
          {role === "owner" &&
            ["PENDING_GUARDIAN", "PENDING_REVIEW", "READY"].includes(
              row.status,
            ) && (
              <Button
                disabled={busy}
                kind="danger"
                label={t("Withdraw this request and link", "撤回此申请及链接")}
                onPress={() =>
                  void action(async () => {
                    await api(`${base}/${row.id}/cancel`, {});
                    await load();
                  })
                }
              />
            )}
        </Card>
      ))}
      {preview && state && (
        <Card>
          <Txt>
            {t("Exact anonymous replay preview", "待分享的匿名回放预览")}
          </Txt>
          <Notice
            text={
              preview.data.packet.input === "smart" &&
              preview.data.packet.telemetry.continuity === "net-state"
                ? t(
                    "Received turns only; counterless devices cannot establish extra hidden turns, exact count or turning speed.",
                    "仅含收到的转动；无计数设备不能确定隐藏转动、准确次数或转速。",
                  )
                : t(
                    "Study replay; it does not certify a competition result.",
                    "学习回放，不代表比赛成绩已获认证。",
                  )
            }
          />
          {isPyraminx(state) ? (
            <PyraminxView state={state} />
          ) : (
            <CubeView state={state} />
          )}
          <Txt>
            {index} / {preview.timeline.packet.moves.length}
          </Txt>
          <Row>
            <Button
              small
              disabled={index === 0}
              label={t("Previous", "上一步")}
              onPress={() => setIndex((v) => Math.max(0, v - 1))}
            />
            <Button
              small
              disabled={index === preview.timeline.packet.moves.length}
              label={t("Next", "下一步")}
              onPress={() =>
                setIndex((v) =>
                  Math.min(preview.timeline.packet.moves.length, v + 1),
                )
              }
            />
            <Button
              small
              label={t("Solved end", "完成状态")}
              onPress={() => setIndex(preview.timeline.packet.moves.length)}
            />
          </Row>
          <Txt small>{preview.timeline.packet.moves.join(" ")}</Txt>
          {role === "guardian" ? (
            <>
              <Row>
                <Txt>
                  {t("I inspected this exact replay", "我已查看此回放")}
                </Txt>
                <Switch
                  accessibilityLabel={t("Replay inspected", "已查看回放")}
                  value={checked}
                  onValueChange={setChecked}
                />
              </Row>
              <Field
                label={t("Reason if withdrawing", "撤回理由")}
                value={reason}
                onChangeText={setReason}
              />
              <Button
                disabled={
                  busy || !checked || preview.row.status !== "PENDING_GUARDIAN"
                }
                label={t(
                  "Approve for moderator review",
                  "同意并提交管理员审核",
                )}
                onPress={() => void action(() => review(true))}
              />
              <Button
                kind="danger"
                disabled={busy || reason.trim().length < 3}
                label={t("Reject or withdraw sharing", "拒绝或撤回分享")}
                onPress={() => void action(() => review(false))}
              />
            </>
          ) : (
            <Button
              disabled={busy || !disclosure || preview.row.status !== "READY"}
              label={t("Create fresh sharing link", "生成新分享链接")}
              onPress={() =>
                void action(async () => {
                  const visible = visibility.current,
                    run = operation.current;
                  const result = await api<{
                    share: ReplayShareView;
                    key: string;
                    community: "CN" | "INTL";
                  }>(`${base}/${preview.row.id}/publish`, {
                    revision: preview.data.revision,
                    packetDigest: preview.data.packetDigest,
                    disclosureConfirmed: true,
                  });
                  await load();
                  if (
                    mounted.current &&
                    visibility.current === visible &&
                    operation.current === run
                  )
                    setLink(
                      invitationLink({
                        kind: "replay",
                        code: result.share.id,
                        key: result.key,
                        community: result.community,
                      }),
                    );
                })
              }
            />
          )}
        </Card>
      )}
      {!!link && (
        <Card>
          <Notice
            text={t(
              "This fresh link replaces any previous link for this request. Share it only with intended recipients.",
              "新链接已替换此申请之前的链接，请仅分享给希望查看的人。",
            )}
          />
          <Button
            label={t("Share replay link", "分享回放链接")}
            onPress={() =>
              void Share.share({ message: link }).catch(() =>
                setError(t("Sharing was unavailable", "暂时无法分享")),
              )
            }
          />
        </Card>
      )}
      {next && (
        <Button
          disabled={busy}
          kind="secondary"
          label={t("Load more", "加载更多")}
          onPress={() => void load(true)}
        />
      )}
    </Screen>
  );
}
