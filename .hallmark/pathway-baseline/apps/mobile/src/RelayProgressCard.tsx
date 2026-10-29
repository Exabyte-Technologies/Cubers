import React, { useState } from "react";
import type { RelayProgress } from "@cubers/core";
import { useApp } from "./state";
import { Card, Txt, Row, Button, Notice } from "./ui";
export function RelayProgressCard({
  progress,
  host,
  busy,
  end,
}: {
  progress: RelayProgress;
  host: boolean;
  busy: boolean;
  end: () => Promise<unknown>;
}) {
  const { t } = useApp();
  const [confirm, setConfirm] = useState(false);
  const labels = {
    waiting: t("Waiting", "等待中"),
    ready: t("Ready to take the next leg", "准备接棒"),
    solving: t("Inspection or solve in progress", "正在观察或还原"),
    complete: t("Verified", "已验证"),
    interrupted: t("Relay ended", "接力已结束"),
  };
  return (
    <Card>
      <Txt
        accessibilityRole="header"
        style={{ fontSize: 22, fontWeight: "700" }}
      >
        {t("Team relay", "团队接力")}
      </Txt>
      <Txt>
        {t(
          "Each teammate solves a fresh server scramble, in order. Pass the turn only after a verified solve. This is a casual team challenge, with no public ranking.",
          "每位队友按顺序还原新的服务器打乱，验证完成后再传棒。这是一场休闲团队挑战，不计入公开排名。",
        )}
      </Txt>
      <Txt>
        {t(
          `${progress.completed} of ${progress.total} legs verified`,
          `已验证 ${progress.completed} / ${progress.total} 棒`,
        )}
      </Txt>
      {progress.status === "waiting" && (
        <Txt>
          {t(
            "The host starts after at least two players join; the turn order then stays fixed.",
            "至少两位玩家加入后由房主开始，之后棒次顺序固定。",
          )}
        </Txt>
      )}
      {progress.legs.map((leg) => (
        <Row key={leg.number} style={{ justifyContent: "space-between" }}>
          <Txt>
            {t(
              `Leg ${leg.number}${leg.yours ? " · You" : ""}`,
              `第 ${leg.number} 棒${leg.yours ? " · 你" : ""}`,
            )}
          </Txt>
          <Txt small>
            {labels[leg.state]}
            {leg.durationMs !== null
              ? ` · ${(leg.durationMs / 1000).toFixed(3)} ${t("s", "秒")}`
              : ""}
          </Txt>
        </Row>
      ))}
      {progress.completed > 0 && (
        <Txt>
          {t(
            `${progress.status === "complete" ? "Team solve total" : "Verified solve subtotal"}: ${(progress.solveTotalMs / 1000).toFixed(3)} seconds. This includes inspection penalties, but excludes inspection and handoff waiting.`,
            `${progress.status === "complete" ? "团队还原总用时" : "已验证还原用时小计"}：${(progress.solveTotalMs / 1000).toFixed(3)} 秒。包含观察超时罚时，不包含观察和等待传棒的时间。`,
          )}
        </Txt>
      )}
      {progress.status === "complete" && (
        <Notice
          text={t(
            "Relay complete. Every teammate finished their verified leg.",
            "接力完成，每位队友都完成了经过验证的一棒。",
          )}
        />
      )}
      {progress.status === "interrupted" && (
        <Notice
          text={t(
            "This relay ended without a team result. Already verified legs stay recorded in this room. Start a new room to try together again.",
            "本场接力已结束，不产生团队成绩。已经验证的单棒成绩仍保留在本房间记录中，重新合作请创建新房间。",
          )}
        />
      )}
      {host &&
        ["waiting", "active"].includes(progress.status) &&
        (confirm ? (
          <>
            <Notice
              text={t(
                "End this relay for everyone? Active attempts will stop and this room cannot restart.",
                "结束所有人的接力？进行中的尝试将中止，房间不能重新开始。",
              )}
            />
            <Button
              label={t("End relay for everyone", "结束本场接力")}
              disabled={busy}
              onPress={() => {
                void end().then(() => setConfirm(false));
              }}
            />
            <Button
              label={t("Keep playing", "继续游玩")}
              disabled={busy}
              onPress={() => setConfirm(false)}
            />
          </>
        ) : (
          <Button
            label={t("End this relay…", "结束本场接力……")}
            disabled={busy}
            onPress={() => setConfirm(true)}
          />
        ))}
    </Card>
  );
}
