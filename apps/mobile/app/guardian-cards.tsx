import { backOrReplace } from "../src/back-navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Switch } from "react-native";
import { Redirect, router, useFocusEffect } from "expo-router";
import { CardImage, achievementCardText, type ReviewCard } from "@cubers/core";
import { useApp } from "../src/state";
import { CardPreview } from "../src/cards/Preview";
import {
  Screen,
  Heading,
  Card,
  Txt,
  Row,
  Button,
  Field,
  Notice,
  Busy,
} from "../src/ui";
export default function GuardianCards() {
  const { token, region, user } = useApp();
  if (!token) return <Redirect href="/" />;
  return (
    <GuardianCardPage
      key={JSON.stringify([token, region, user?.id, user?.guardianEligible])}
    />
  );
}
function GuardianCardPage() {
  const { api, t, locale, token, user } = useApp();
  const [rows, setRows] = useState<ReviewCard[]>([]),
    [next, setNext] = useState<string | null>(null),
    [preview, setPreview] = useState<{ row: ReviewCard; image: CardImage }>();
  const [checked, setChecked] = useState(false),
    [reasons, setReasons] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [action, setAction] = useState(""),
    [paging, setPaging] = useState(false),
    [error, setError] = useState("");
  const generation = useRef(0),
    acting = useRef(false),
    morePending = useRef(false);
  const label = (row: ReviewCard) => {
    const text = achievementCardText(row.achievementId, row.locale);
    return `${text.title}. ${text.description}. ${text.footer}. ${t("Anonymous image", "匿名图片")}`;
  };
  async function refresh() {
    const epoch = ++generation.current;
    setRows([]);
    setNext(null);
    setPreview(undefined);
    setChecked(false);
    setReasons({});
    setBusy(true);
    setError("");
    acting.current = false;
    morePending.current = false;
    setAction("");
    setPaging(false);
    try {
      const result = await api<{
        items: ReviewCard[];
        nextCursor: string | null;
      }>("guardian/achievement-cards");
      if (epoch === generation.current) {
        setRows(result.items);
        setNext(result.nextCursor);
      }
    } catch {
      if (epoch === generation.current)
        setError(
          t(
            "Could not load current card requests. Reconnect and refresh; guardian permissions may have changed.",
            "无法加载当前卡片申请，请联网后刷新，监护权限可能已变化。",
          ),
        );
    } finally {
      if (epoch === generation.current) setBusy(false);
    }
  }
  useFocusEffect(
    useCallback(() => {
      if (token && user?.guardianEligible) void refresh();
      return () => {
        generation.current++;
        setRows([]);
        setPreview(undefined);
      };
    }, [api, token, user?.guardianEligible]),
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        setPreview(undefined);
        setChecked(false);
      } else if (token && user?.guardianEligible) void refresh();
    });
    return () => sub.remove();
  }, [api, token, user?.guardianEligible]);
  async function inspect(row: ReviewCard) {
    if (acting.current || busy) return;
    const epoch = generation.current;
    acting.current = true;
    setAction(row.id);
    setError("");
    setPreview(undefined);
    setChecked(false);
    try {
      const image = CardImage.parse(
        await api(`guardian/achievement-cards/${row.id}/preview`, {}),
      );
      if (epoch !== generation.current) return;
      if (
        image.cardId !== row.id ||
        image.watermarked ||
        image.imageDigest !== row.imageDigest ||
        image.approvalDigest !== row.imageDigest
      )
        throw Error("Preview changed");
      setPreview({ row, image });
    } catch {
      if (epoch === generation.current)
        setError(
          t(
            "This exact image is no longer available for your review. Refresh the requests.",
            "此图片已无法供你审核，请刷新申请列表。",
          ),
        );
    } finally {
      if (epoch === generation.current) {
        acting.current = false;
        setAction("");
      }
    }
  }
  async function review(row: ReviewCard, approve: boolean) {
    if (
      acting.current ||
      busy ||
      (approve &&
        (row.status !== "PENDING_GUARDIAN" ||
          !checked ||
          preview?.row.id !== row.id ||
          preview.image.approvalDigest !== row.imageDigest)) ||
      (!approve && (reasons[row.id] || "").trim().length < 3)
    )
      return;
    const epoch = generation.current;
    acting.current = true;
    setAction(row.id);
    setError("");
    try {
      await api(`guardian/achievement-cards/${row.id}/review`, {
        revision: row.revision,
        imageDigest: row.imageDigest,
        approve,
        imageChecked: approve && checked,
        reason: approve ? "" : reasons[row.id].trim(),
      });
      if (epoch === generation.current) await refresh();
    } catch {
      if (epoch === generation.current)
        setError(
          t(
            "The request or permission changed. Refresh before reviewing again.",
            "申请或权限已变化，请刷新后重新审核。",
          ),
        );
    } finally {
      if (epoch === generation.current) {
        acting.current = false;
        setAction("");
      }
    }
  }
  async function more() {
    if (!next || morePending.current || acting.current || busy) return;
    const epoch = generation.current;
    morePending.current = true;
    setPaging(true);
    setPreview(undefined);
    setChecked(false);
    try {
      const page = await api<{
        items: ReviewCard[];
        nextCursor: string | null;
      }>(`guardian/achievement-cards?cursor=${encodeURIComponent(next)}`);
      if (epoch !== generation.current) return;
      setRows((old) =>
        [
          ...old,
          ...page.items.filter((r) => !old.some((p) => p.id === r.id)),
        ].slice(-100),
      );
      setNext(page.nextCursor);
    } catch {
      if (epoch === generation.current)
        setError(
          t(
            "Could not load older requests. Refresh the list.",
            "无法加载较早的申请，请刷新列表。",
          ),
        );
    } finally {
      if (epoch === generation.current) {
        morePending.current = false;
        setPaging(false);
      }
    }
  }
  return (
    <Screen>
      <Button
        kind="secondary"
        label={t("Back", "返回")}
        onPress={() => backOrReplace(router, "/guardian")}
      />
      <Heading>
        {t("Manage child achievement cards", "管理儿童成就卡片")}
      </Heading>
      <Card>
        <Txt>
          {t(
            "Inspect the exact anonymous image before approving. Approval lets an independent content reviewer consider it; it does not publish a post or immediately allow export.",
            "批准前请查看这张具体的匿名图片。批准后还须由独立内容审核人员审核，不会自动发帖，也不会立即开放导出。",
          )}
        </Txt>
        <Txt small>
          {t(
            "Once approved by both reviewers, the child may save/share the image outside Cubers. Copies cannot be recalled. You can withdraw public-sharing permission from Guardian controls.",
            "经双方批准后，儿童可在 Cubers 外保存或分享图片，副本无法撤回。你可在监护设置中撤销公开分享权限。",
          )}
        </Txt>
        <Button
          disabled={busy || !!action}
          label={t("Refresh", "刷新")}
          onPress={() => void refresh()}
        />
      </Card>
      {!user?.guardianEligible && (
        <Notice
          text={t(
            "Current verified guardian eligibility is required.",
            "需要当前有效且经过核验的监护人资格。",
          )}
        />
      )}
      {!!error && <Notice text={error} error />}
      {busy && <Busy />}
      {preview && (
        <Card>
          <Txt style={{ fontWeight: "600" }}>
            {preview.row.subject.displayName} /{" "}
            {t("Exact image for review", "待审核的具体图片")}
          </Txt>
          <CardPreview image={preview.image} label={label(preview.row)} />
          {preview.row.status === "PENDING_GUARDIAN" && (
            <>
              <Row>
                <Switch
                  accessibilityLabel={t(
                    "I inspected this image and understand external copies cannot be recalled",
                    "我已查看此图片并了解外部副本无法撤回",
                  )}
                  value={checked}
                  onValueChange={setChecked}
                />
                <Txt small style={{ flex: 1 }}>
                  {t(
                    "I inspected this image, agree that this child may request its external sharing, and understand the remaining content review.",
                    "我已查看此图片，同意该儿童申请在应用外分享，并了解仍须完成内容审核。",
                  )}
                </Txt>
              </Row>
              <Button
                disabled={!!action || !checked}
                label={t(
                  "Approve this image for content review",
                  "批准此图片进入内容审核",
                )}
                onPress={() => void review(preview.row, true)}
              />
            </>
          )}
          {preview.row.status !== "PENDING_GUARDIAN" && (
            <Txt small>
              {t(
                "Your guardian approval is already recorded. You can withdraw this card's future export permission below; copies already shared cannot be recalled.",
                "已记录你的监护人批准。你可在下方撤回该卡片今后的导出权限；已经分享的副本无法撤回。",
              )}
            </Txt>
          )}
        </Card>
      )}
      {!busy && user?.guardianEligible && !rows.length && (
        <Card>
          <Txt>
            {t(
              "No active child cards currently need review or management.",
              "暂无需要审核或管理的有效儿童卡片。",
            )}
          </Txt>
        </Card>
      )}
      {rows.map((row) => (
        <Card key={row.id}>
          <Txt style={{ fontWeight: "600" }}>
            {row.subject.displayName} /{" "}
            {achievementCardText(row.achievementId, locale).title}
          </Txt>
          <Txt small>
            {row.locale === "zh" ? "简体中文" : "English"} /{" "}
            {t("Expires", "有效期至")}{" "}
            {new Date(row.expiresAt).toLocaleString()}
          </Txt>
          <Button
            kind="secondary"
            disabled={!!action || busy}
            label={t("Inspect image", "查看图片")}
            onPress={() => void inspect(row)}
          />
          <Field
            label={t(
              "Reason if declining or withdrawing",
              "拒绝或撤回时请说明原因",
            )}
            value={reasons[row.id] || ""}
            onChangeText={(text) =>
              setReasons((old) => ({ ...old, [row.id]: text.slice(0, 400) }))
            }
            multiline
          />
          <Button
            kind="secondary"
            disabled={!!action || (reasons[row.id] || "").trim().length < 3}
            label={
              row.status === "PENDING_GUARDIAN"
                ? t("Decline this request", "拒绝本申请")
                : t(
                    "Withdraw this card's export permission",
                    "撤回本卡片导出权限",
                  )
            }
            onPress={() => void review(row, false)}
          />
        </Card>
      ))}
      {next && (
        <Button
          disabled={paging || !!action}
          label={
            paging ? t("Loading…", "加载中……") : t("Older requests", "较早申请")
          }
          onPress={() => void more()}
        />
      )}
      {!!rows.length && (
        <Txt small>
          {t(
            "At most 100 loaded requests are shown; Refresh returns to the newest.",
            "最多显示已加载的 100 条申请，刷新可返回最新记录。",
          )}
        </Txt>
      )}
    </Screen>
  );
}
