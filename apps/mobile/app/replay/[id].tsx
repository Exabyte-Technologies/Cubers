import { backOrReplace } from "../../src/back-navigation";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AccessibilityInfo, AppState } from "react-native";
import {
  Redirect,
  router,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";
import {
  ReplayTimeline,
  isPyraminx,
  SMART_PROFILES,
  SharedReplay,
} from "@cubers/core";
import { invitationFromParams, invitationSignIn } from "../../src/invitations";
import { useApp } from "../../src/state";
import { CubeView } from "../../src/CubeView";
import { PyraminxView } from "../../src/PyraminxView";
import {
  Screen,
  Heading,
  Card,
  Txt,
  Row,
  Button,
  Chip,
  Notice,
  Busy,
} from "../../src/ui";

export default function Replay() {
  const {
    id,
    shared,
    key: shareKey,
    community,
  } = useLocalSearchParams<{
    id: string;
    shared?: string;
    key?: string;
    community?: string;
  }>();
  const invite =
    shared === "true"
      ? invitationFromParams({
          kind: "replay",
          code: id,
          key: shareKey,
          community,
        })
      : null;
  const { api, token, user, region, t } = useApp();
  const owner = JSON.stringify([
    token,
    user?.id,
    user?.permissions.canLearn,
    region,
    id,
    shared,
    shareKey,
    community,
  ]);
  const currentOwner = useRef(owner);
  currentOwner.current = owner;
  const generation = useRef(0);
  const playback = useRef(0);
  const [snapshot, setSnapshot] = useState<{
    owner: string;
    timeline: ReplayTimeline;
  }>();
  const timeline = snapshot?.owner === owner ? snapshot.timeline : undefined;
  const [sharedExpiry, setSharedExpiry] = useState<string>();
  const [index, setIndex] = useState(0),
    [lastMove, setLastMove] = useState<string>();
  const [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1);
  const [reduced, setReduced] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const state = useMemo(
    () => timeline?.stateAt(Math.min(index, timeline.packet.moves.length)),
    [timeline, index],
  );
  async function load() {
    const epoch = ++generation.current,
      identity = owner;
    const current = () =>
      epoch === generation.current && currentOwner.current === identity;
    setSnapshot(undefined);
    playback.current++;
    setPlaying(false);
    setBusy(true);
    setError("");
    setLastMove(undefined);
    setIndex(0);
    try {
      if (shared === "true" && (!invite || invite.community !== region))
        throw { status: 403 };
      const response =
        shared === "true"
          ? SharedReplay.parse(
              await api("shared-replays/open", { id, key: shareKey }),
            )
          : null;
      const result = response
        ? response.packet
        : await api(`me/replays/${encodeURIComponent(id)}`);
      if (current()) setSharedExpiry(response?.expiresAt);
      if (!current()) return;
      const built = await ReplayTimeline.create(
        result,
        () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
        current,
      );
      if (current()) setSnapshot({ owner: identity, timeline: built });
    } catch (e) {
      if (current())
        setError(
          [403, 404, 409].includes((e as any).status)
            ? t(
                "This saved replay is unavailable for your current account or community.",
                "此还原回放暂不适用于当前账号或社区。",
              )
            : t(
                "Could not load or validate the replay. Reconnect and retry.",
                "暂时无法加载或校验回放，请联网后重试。",
              ),
        );
    } finally {
      if (current()) setBusy(false);
    }
  }
  useFocusEffect(
    useCallback(() => {
      if (token) void load();
      return () => {
        generation.current++;
        playback.current++;
        setPlaying(false);
        setSnapshot(undefined);
      };
    }, [
      api,
      token,
      user?.id,
      user?.permissions.canLearn,
      region,
      id,
      shared,
      shareKey,
      community,
    ]),
  );
  useEffect(() => {
    let active = true,
      motionRevision = 0;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active && motionRevision === 0) setReduced(value);
      })
      .catch(() => {});
    const motion = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (value) => {
        motionRevision++;
        setReduced(value);
        if (value) {
          playback.current++;
          setPlaying(false);
        }
      },
    );
    const background = AppState.addEventListener("change", (value) => {
      if (value !== "active") {
        playback.current++;
        setPlaying(false);
        if (shared === "true") {
          generation.current++;
          setSnapshot(undefined);
          setBusy(false);
        }
      }
    });
    return () => {
      active = false;
      motion.remove();
      background.remove();
    };
  }, [shared, owner]);
  useEffect(() => {
    if (shared !== "true" || !sharedExpiry || !timeline) return;
    const timer = setTimeout(
      () => {
        generation.current++;
        playback.current++;
        setSnapshot(undefined);
        setPlaying(false);
        setError(
          t(
            "This shared replay expired. Ask for a new link.",
            "此分享回放已过期，请索取新链接。",
          ),
        );
      },
      Math.max(0, Date.parse(sharedExpiry) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [shared, sharedExpiry, timeline, owner]);
  useEffect(() => {
    if (!playing || !timeline || reduced) return;
    if (index >= timeline.packet.moves.length) {
      setPlaying(false);
      return;
    }
    const epoch = generation.current,
      identity = owner,
      play = playback.current;
    const timer = setTimeout(() => {
      if (
        epoch !== generation.current ||
        play !== playback.current ||
        currentOwner.current !== identity ||
        AppState.currentState !== "active"
      ) {
        return;
      }
      setLastMove(timeline.packet.moves[index]);
      setIndex(index + 1);
    }, 1000 / speed);
    return () => clearTimeout(timer);
  }, [playing, timeline, index, speed, reduced, owner]);
  function seek(next: number, animate = false) {
    if (!timeline) return;
    playback.current++;
    setPlaying(false);
    setLastMove(animate ? timeline.packet.moves[index] : undefined);
    setIndex(next);
  }
  if (!token)
    return <Redirect href={invite ? invitationSignIn(invite) : "/"} />;
  return (
    <Screen>
      <Button
        kind="secondary"
        label={t("Back", "返回")}
        onPress={() => backOrReplace(router, "/(tabs)/profile")}
      />
      <Heading>
        {shared === "true"
          ? t("Shared solve replay", "分享的还原回放")
          : t("Your solve replay", "你的还原回放")}
      </Heading>
      {shared === "true" && (
        <Notice
          text={t(
            "Anonymous / for study. Shared links can be forwarded to other eligible accounts in this community. Withdrawal stops new loads; previously viewed copies cannot be recalled. Reload to check current access. Sharing does not certify a physical result.",
            "匿名 / 仅供学习。链接可以转发给同社区其他符合资格的账号。撤回会停止后续加载，已经查看的副本无法收回。重新加载可核验当前权限，分享不代表实物成绩已获认证。",
          )}
        />
      )}
      <Card>
        <Txt>
          {t(
            "Reconstructed from the saved scramble and received moves. Playback speed is for studying the sequence; it does not reproduce original turn timing. Replaying awards no progress or ranking credit.",
            "根据保存的打乱与收到的转动重建。播放速度仅用于查看步骤，不代表原始转动时刻；回放不增加进度或排名积分。",
          )}
        </Txt>
        <Txt small>
          {t(
            "Scanned attempts have no continuous move history. Saved smart replays do not connect or activate hardware; every model still needs physical acceptance for new attempts.",
            "扫描实物尝试没有连续转动记录。已保存的智能魔方回放不连接或启用硬件；新尝试仍须等待各型号通过实物验收。",
          )}
        </Txt>
        <Button
          disabled={busy}
          label={t("Reload saved replay", "重新加载回放")}
          onPress={() => void load()}
        />
      </Card>
      {!!error && <Notice text={error} error />}
      {busy && <Busy />}
      {timeline && state && (
        <>
          {timeline.packet.input === "smart" && (
            <Notice
              text={
                timeline.packet.telemetry.continuity === "counter"
                  ? t(
                      `${SMART_PROFILES[timeline.packet.telemetry.model].name} / Saved received turns with counter continuity. This reconstruction does not certify physical performance or replace evidence review.`,
                      `${SMART_PROFILES[timeline.packet.telemetry.model].name} / 已保存的接收转动具有计数连续性。重建不证明实物表现，也不替代录像审核。`,
                    )
                  : t(
                      `${SMART_PROFILES[timeline.packet.telemetry.model].name} / Received turns only. This model has no hardware move counter, so extra turns between matching device positions may be missing. Exact turn count and turning speed are unavailable.`,
                      `${SMART_PROFILES[timeline.packet.telemetry.model].name} / 仅回放收到的转动。此型号没有硬件转动计数，相同设备状态之间的额外转动可能缺失，因此不提供准确转动次数或转速。`,
                    )
              }
            />
          )}
          <Card>
            <Txt style={{ fontWeight: "600" }}>
              {timeline.packet.puzzle === "pyraminx"
                ? t("Pyraminx", "金字塔")
                : timeline.packet.puzzle.replace("x", "×")}{" "}
              /{" "}
              {timeline.packet.mode === "daily"
                ? t("Daily solve", "每日还原")
                : t("Race", "竞速")}
            </Txt>
            <Txt>
              {t(
                `Saved server time: ${(timeline.packet.durationMs / 1000).toFixed(2)}s`,
                `已保存的服务器用时：${(timeline.packet.durationMs / 1000).toFixed(2)} 秒`,
              )}
            </Txt>
            <Txt small>
              {shared === "true" ? t("Shared on: ", "分享时间：") : ""}
              {new Date(timeline.packet.createdAt).toLocaleString()}
            </Txt>
            <Txt small>
              {t("Scramble", "打乱")}：{timeline.packet.scramble.join(" ")}
            </Txt>
          </Card>
          {isPyraminx(state) ? (
            <PyraminxView
              state={state}
              lastMove={reduced ? undefined : lastMove}
            />
          ) : (
            <CubeView state={state} lastMove={reduced ? undefined : lastMove} />
          )}
          <Card>
            <Txt style={{ fontWeight: "600" }}>
              {t(
                `Received turn ${index} of ${timeline.packet.moves.length}`,
                `已查看 ${index} / ${timeline.packet.moves.length} 次已接收转动`,
              )}
            </Txt>
            <Txt>
              {index === timeline.packet.moves.length
                ? t("Validated solved state", "已校验的完成状态")
                : t(
                    `Next move: ${timeline.packet.moves[index]}`,
                    `下一步：${timeline.packet.moves[index]}`,
                  )}
            </Txt>
            <Txt small>
              {timeline.packet.moves
                .slice(
                  Math.max(0, index - 3),
                  Math.min(timeline.packet.moves.length, index + 4),
                )
                .map((move, i) => `${Math.max(0, index - 3) + i + 1}:${move}`)
                .join(" / ")}
            </Txt>
            <Row>
              <Button
                kind="secondary"
                disabled={!index}
                label={t("Start", "起点")}
                onPress={() => seek(0)}
              />
              <Button
                kind="secondary"
                disabled={!index}
                label={t("Previous", "上一步")}
                onPress={() => seek(index - 1)}
              />
              <Button
                disabled={index >= timeline.packet.moves.length}
                label={t("Next", "下一步")}
                onPress={() => seek(index + 1, true)}
              />
              <Button
                kind="secondary"
                disabled={index >= timeline.packet.moves.length}
                label={t("End", "终点")}
                onPress={() => seek(timeline.packet.moves.length)}
              />
            </Row>
            <Row>
              {[0.5, 1, 2].map((value) => (
                <Chip
                  key={value}
                  selected={speed === value}
                  label={t(`${value} moves/s`, `每秒 ${value} 步`)}
                  onPress={() => {
                    playback.current++;
                    setPlaying(false);
                    setSpeed(value);
                  }}
                />
              ))}
            </Row>
            <Button
              disabled={
                reduced ||
                !timeline.packet.moves.length ||
                index >= timeline.packet.moves.length
              }
              label={
                playing ? t("Pause", "暂停") : t("Play sequence", "播放步骤")
              }
              onPress={() => {
                playback.current++;
                setPlaying((p) => !p);
              }}
            />
            {reduced && (
              <Txt small>
                {t(
                  "Reduce Motion is enabled. Use the step buttons to view the sequence at your own pace.",
                  "已启用减少动态效果，请使用逐步按钮自行查看。",
                )}
              </Txt>
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}
