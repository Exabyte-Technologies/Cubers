import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform, Switch } from "react-native";
import { Redirect, router, useFocusEffect } from "expo-router";
import {
  AchievementCatalog,
  achievementCardText,
  CardImage,
  type AchievementCardCatalogue,
  type AchievementCardPage,
  type AchievementCardView,
  type Locale,
} from "@cubers/core";
import { useApp } from "../src/state";
import { cardFileShares } from "../src/cards/native";
import { CardPreview } from "../src/cards/Preview";
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
} from "../src/ui";
type ImageView = {
  owner: string;
  row: AchievementCardView;
  image: CardImage;
  preparedAt: number;
  clean: boolean;
};
export default function AchievementCards() {
  const { api, token, user, region, locale, t } = useApp();
  const owner = JSON.stringify([
    token,
    user?.id,
    user?.displayName,
    user?.privateProfile,
    user?.permissions,
    region,
    locale,
  ]);
  const currentOwner = useRef(owner);
  currentOwner.current = owner;
  const generation = useRef(0),
    morePending = useRef(false),
    actionPending = useRef(false);
  const [snapshot, setSnapshot] = useState<{
    owner: string;
    catalogue: AchievementCardCatalogue;
    page: AchievementCardPage;
  }>();
  const data = snapshot?.owner === owner ? snapshot : undefined;
  const [imageView, setImageView] = useState<ImageView>();
  const image = imageView?.owner === owner ? imageView : undefined;
  const [selected, setSelected] = useState<string>(),
    [language, setLanguage] = useState<Locale>(locale),
    [named, setNamed] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [exportConsent, setExportConsent] = useState<string>();
  const [busy, setBusy] = useState(false),
    [paging, setPaging] = useState(false),
    [action, setAction] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const status: Record<string, string> = {
    PENDING_GUARDIAN: t("Awaiting guardian review", "等待监护人审核"),
    PENDING_REVIEW: t("Awaiting content review", "等待内容审核"),
    READY: t("Approved for export", "可导出"),
    REJECTED: t("Not approved", "未通过"),
    CANCELLED: t("Cancelled", "已取消"),
  };
  const title = (id: string) =>
    AchievementCatalog.find((a) => a.id === id)?.[locale] || id;
  function failure(e: unknown) {
    const local = (e as any).code;
    if (local === "UNAVAILABLE")
      return Platform.OS === "web"
        ? t(
            "This browser cannot share PNG files. Use Download PNG instead.",
            "此浏览器无法分享 PNG 文件，请改用下载 PNG 图片。",
          )
        : t(
            "Image sharing is unavailable on this device or app version. Update the app or try another device.",
            "当前设备或应用版本无法分享图片，请更新应用或换用其他设备。",
          );
    if (local === "EXPIRED")
      return t(
        "The prepared image expired. Prepare the approved image again.",
        "准备好的图片已过期，请重新准备核准图片。",
      );
    if (local === "BUSY")
      return t(
        "Close the existing share window before sharing another image.",
        "请先关闭已有分享窗口，再分享其他图片。",
      );
    if (local === "WRITE" || local === "CLEANUP")
      return t(
        "The temporary image cache is unavailable. Reopen the app and retry.",
        "临时图片缓存暂不可用，请重新打开应用后再试。",
      );
    const code = (e as any).status;
    return code === 403
      ? t(
          "Sharing permission changed or is unavailable here. Refresh before continuing.",
          "分享权限已变化或当前不可用，请刷新后继续。",
        )
      : code === 409
        ? t(
            "This card or approval changed. Refresh and prepare a current image.",
            "卡片或审批状态已变化，请刷新后重新准备图片。",
          )
        : code === 429
          ? t(
              "Please wait before requesting another card.",
              "操作较频繁，请稍后再试。",
            )
          : t(
              "Could not complete this step. Reconnect and refresh; try an anonymous card if a nickname is unsupported.",
              "暂时无法完成此步骤，请联网后刷新；若昵称不受支持，可改用匿名卡片。",
            );
  }
  async function refresh() {
    const epoch = ++generation.current,
      identity = owner;
    setBusy(true);
    setError("");
    setImageView(undefined);
    setExportConsent(undefined);
    morePending.current = false;
    actionPending.current = false;
    setPaging(false);
    setAction("");
    setSnapshot(undefined);
    try {
      const [catalogue, page] = await Promise.all([
        api<AchievementCardCatalogue>("me/achievement-cards"),
        api<AchievementCardPage>("me/achievement-cards/requests"),
      ]);
      if (epoch !== generation.current || currentOwner.current !== identity)
        return;
      setSnapshot({ owner: identity, catalogue, page });
      setSelected((old) =>
        catalogue.achievements.some((a) => a.id === old)
          ? old
          : catalogue.achievements[0]?.id,
      );
    } catch (e) {
      if (epoch === generation.current && currentOwner.current === identity)
        setError(failure(e));
    } finally {
      if (epoch === generation.current) setBusy(false);
    }
  }
  useFocusEffect(
    useCallback(() => {
      setNamed(false);
      setConfirmed(false);
      setLanguage(locale);
      setMessage("");
      if (token) void refresh();
      return () => {
        generation.current++;
        actionPending.current = false;
        morePending.current = false;
        setSnapshot(undefined);
        setImageView(undefined);
      };
    }, [api, owner]),
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (value) => {
      if (value !== "active") setImageView(undefined);
      else if (token) void refresh();
    });
    return () => sub.remove();
  }, [api, owner]);
  useEffect(() => {
    if (!image?.clean) return;
    const timer = setTimeout(
      () => setImageView(undefined),
      Math.max(1, image.preparedAt + 60000 - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [image]);
  async function perform(label: string, work: () => Promise<void>) {
    if (actionPending.current || busy) return;
    const epoch = generation.current,
      identity = owner;
    actionPending.current = true;
    setAction(label);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (e) {
      if (epoch === generation.current && currentOwner.current === identity) {
        setImageView(undefined);
        setError(failure(e));
      }
    } finally {
      if (epoch === generation.current && currentOwner.current === identity) {
        actionPending.current = false;
        setAction("");
      }
    }
  }
  async function prepare() {
    if (!selected || !confirmed || !data?.catalogue.sharingAvailable) return;
    const epoch = generation.current,
      identity = owner;
    await perform("prepare", async () => {
      await api("me/achievement-cards", {
        achievementId: selected,
        locale: language,
        includeName: named,
        disclosureConfirmed: true,
      });
      if (epoch === generation.current && currentOwner.current === identity) {
        setConfirmed(false);
        await refresh();
      }
    });
  }
  async function show(row: AchievementCardView, clean = false) {
    if (clean && exportConsent !== row.id) return;
    const epoch = generation.current,
      identity = owner;
    await perform(row.id, async () => {
      setImageView(undefined);
      const packet = CardImage.parse(
        await api(
          `me/achievement-cards/${row.id}/${clean ? "export" : "preview"}`,
          clean
            ? {
                revision: row.revision,
                imageDigest: row.imageDigest,
                disclosureConfirmed: true,
              }
            : {},
        ),
      );
      if (epoch !== generation.current || currentOwner.current !== identity)
        return;
      if (
        packet.cardId !== row.id ||
        packet.approvalDigest !== row.imageDigest ||
        packet.watermarked !== !clean ||
        (clean && packet.imageDigest !== row.imageDigest)
      )
        throw Error("Card image changed");
      setImageView({
        owner: identity,
        row,
        image: packet,
        preparedAt: Date.now(),
        clean,
      });
    });
  }
  async function share(download = false) {
    if (!image?.clean) return;
    const chosen = image;
    await perform("share", async () => {
      const binding = {
        cardId: chosen.row.id,
        imageDigest: chosen.row.imageDigest,
        preparedAt: chosen.preparedAt,
      };
      if (download) await cardFileShares.download(chosen.image, binding);
      else await cardFileShares.share(chosen.image, binding);
      if (currentOwner.current === chosen.owner)
        setMessage(
          t(
            "Your chosen app or browser handles saving and sending. Cubers does not confirm delivery.",
            "保存和发送由你选择的应用或浏览器处理，Cubers 不确认是否送达。",
          ),
        );
    });
  }
  async function more() {
    if (
      !data?.page.nextCursor ||
      morePending.current ||
      busy ||
      actionPending.current
    )
      return;
    const epoch = generation.current,
      identity = owner;
    morePending.current = true;
    setPaging(true);
    setImageView(undefined);
    try {
      const page = await api<AchievementCardPage>(
        `me/achievement-cards/requests?cursor=${encodeURIComponent(data.page.nextCursor)}`,
      );
      if (epoch !== generation.current || currentOwner.current !== identity)
        return;
      setSnapshot((old) =>
        old?.owner === identity
          ? {
              ...old,
              page: {
                items: [
                  ...old.page.items,
                  ...page.items.filter(
                    (r) => !old.page.items.some((p) => p.id === r.id),
                  ),
                ].slice(-100),
                nextCursor: page.nextCursor,
              },
            }
          : old,
      );
    } catch (e) {
      if (epoch === generation.current) {
        if ((e as any).status === 409) await refresh();
        else setError(failure(e));
      }
    } finally {
      if (epoch === generation.current) {
        morePending.current = false;
        setPaging(false);
      }
    }
  }
  if (!token) return <Redirect href="/" />;
  return (
    <Screen>
      <Button
        kind="secondary"
        label={t("Back", "返回")}
        onPress={() => router.back()}
      />
      <Heading>{t("Achievement cards", "成就卡片")}</Heading>
      <Card>
        <Txt>
          {t(
            "Celebrate a milestone you actually earned. Cards start anonymous and never publish a Discover post automatically.",
            "记录真实获得的里程碑。卡片默认匿名，不会自动发布到发现页。",
          )}
        </Txt>
        <Txt small>
          {t(
            "Saved or shared copies may be copied again and cannot be recalled. Cards include no birthday, contact details, location, recordings or account identifier.",
            "保存或分享后的图片可能被再次复制，无法撤回。卡片不含生日、联系方式、位置、录像或账号标识。",
          )}
        </Txt>
        <Button
          disabled={busy || !!action}
          label={t("Refresh", "刷新")}
          onPress={() => void refresh()}
        />
      </Card>
      {!!error && <Notice text={error} error />}
      {!!message && <Notice text={message} />}
      {busy && <Busy />}
      {data && (
        <>
          {!data.catalogue.sharingAvailable && (
            <Notice
              text={t(
                "Card sharing is currently unavailable for this account or community. Your private earned milestones remain visible.",
                "当前账号或社区暂不可分享卡片，已获得的私密里程碑仍可查看。",
              )}
            />
          )}
          {data.catalogue.minor && (
            <Notice
              text={
                data.catalogue.youngChild
                  ? t(
                      "Your cards stay anonymous. Your current guardian and an independent content reviewer must approve each image before clean export.",
                      "你的卡片保持匿名，每张图片须经当前监护人及独立内容审核人员批准，才能导出无水印版本。",
                    )
                  : t(
                      "Your cards stay anonymous and need content review before clean export.",
                      "你的卡片保持匿名，须经内容审核后才能导出无水印版本。",
                    )
              }
            />
          )}
          <Card>
            <Txt style={{ fontWeight: "700" }}>
              {t("Choose an earned milestone", "选择已获得的里程碑")}
            </Txt>
            {!data.catalogue.achievements.length && (
              <Txt>
                {t(
                  "Complete a verified lesson or approved solve to earn your first card.",
                  "完成经过验证的课程练习或已核准还原，获得第一张卡片。",
                )}
              </Txt>
            )}
            {data.catalogue.achievements.map((a) => (
              <Chip
                key={a.id}
                label={a[locale]}
                selected={selected === a.id}
                onPress={() => {
                  setSelected(a.id);
                  setConfirmed(false);
                }}
              />
            ))}
            <Txt small>{t("Image language", "图片语言")}</Txt>
            <Row>
              {(["en", "zh"] as Locale[]).map((l) => (
                <Chip
                  key={l}
                  label={l === "en" ? "English" : "简体中文"}
                  selected={language === l}
                  onPress={() => {
                    setLanguage(l);
                    setConfirmed(false);
                  }}
                />
              ))}
            </Row>
            {data.catalogue.namedCardsAvailable && (
              <Row>
                <Switch
                  accessibilityLabel={t(
                    "Include my current nickname",
                    "加入当前昵称",
                  )}
                  value={named}
                  onValueChange={(v) => {
                    setNamed(v);
                    setConfirmed(false);
                  }}
                />
                <Txt style={{ flex: 1 }}>
                  {t(
                    "Include my current nickname · requires content review",
                    "加入当前昵称 · 需要内容审核",
                  )}
                </Txt>
              </Row>
            )}
            <Row>
              <Switch
                accessibilityLabel={t(
                  "I understand the image sharing choices",
                  "我已了解图片分享选择",
                )}
                value={confirmed}
                onValueChange={setConfirmed}
              />
              <Txt small style={{ flex: 1 }}>
                {t(
                  "I understand what this card includes, its review requirements, and that saved/shared copies cannot be recalled.",
                  "我已了解本卡片的内容、审核要求，以及保存或分享后的副本无法撤回。",
                )}
              </Txt>
            </Row>
            <Button
              disabled={
                !!action ||
                busy ||
                !selected ||
                !confirmed ||
                !data.catalogue.sharingAvailable
              }
              label={t("Create card request", "创建卡片申请")}
              onPress={() => void prepare()}
            />
          </Card>
          {image && (
            <Card>
              <Txt style={{ fontWeight: "700" }}>
                {image.clean
                  ? t("Approved image ready", "已准备好核准图片")
                  : t("Watermarked preview", "带水印预览")}
              </Txt>
              <CardPreview
                image={image.image}
                label={`${achievementCardText(image.row.achievementId, image.row.locale).title}. ${achievementCardText(image.row.achievementId, image.row.locale).description}. ${achievementCardText(image.row.achievementId, image.row.locale).footer}. ${image.row.namedLabel || t("Anonymous", "匿名")} · ${image.clean ? t("Approved", "已核准") : t("Preview", "预览")}`}
              />
              {image.clean && (
                <>
                  <Txt small>
                    {t(
                      "Use the buttons within one minute. Preparing another image rechecks its current approval and permissions.",
                      "请在一分钟内使用下方按钮，重新准备图片会再次检查当前审批与权限。",
                    )}
                  </Txt>
                  <Button
                    disabled={!!action}
                    label={t("Share image", "分享图片")}
                    onPress={() => void share()}
                  />
                  {Platform.OS === "web" && (
                    <Button
                      kind="secondary"
                      disabled={!!action}
                      label={t("Download PNG", "下载 PNG 图片")}
                      onPress={() => void share(true)}
                    />
                  )}
                </>
              )}
            </Card>
          )}
          <Txt small>
            {t(
              "Your requests · export permission lasts seven days; request history is kept for thirty days. At most 100 loaded requests are shown; Refresh returns to the newest.",
              "你的申请 · 导出权限有效七日，申请历史保留三十日。最多显示已加载的 100 条申请，刷新可返回最新记录。",
            )}
          </Txt>
          {data.page.items.map((row) => (
            <Card key={row.id}>
              <Txt style={{ fontWeight: "700" }}>
                {title(row.achievementId)}
              </Txt>
              <Txt>
                {row.expired
                  ? t("Export window expired", "导出权限已过期")
                  : status[row.status]}{" "}
                · {row.locale === "en" ? "English" : "简体中文"}
              </Txt>
              <Txt small>
                {row.namedLabel
                  ? t(`Nickname: ${row.namedLabel}`, `昵称：${row.namedLabel}`)
                  : t("Anonymous image", "匿名图片")}
              </Txt>
              <Txt selectable small>
                {t("Support reference", "支持申请编号")}: {row.id}
              </Txt>
              <Txt small>
                {t("Expires", "有效期至")}{" "}
                {new Date(row.expiresAt).toLocaleString()}
              </Txt>
              {!!row.reason && <Txt small>{row.reason}</Txt>}
              {!row.expired && (
                <Button
                  kind="secondary"
                  disabled={!!action || busy}
                  label={t("Preview", "预览")}
                  onPress={() => void show(row)}
                />
              )}
              {!row.expired &&
                row.status === "READY" &&
                data.catalogue.sharingAvailable && (
                  <>
                    <Row>
                      <Switch
                        accessibilityLabel={t(
                          "Allow preparing this approved image for sharing",
                          "允许准备此核准图片供分享",
                        )}
                        value={exportConsent === row.id}
                        onValueChange={(v) =>
                          setExportConsent(v ? row.id : undefined)
                        }
                      />
                      <Txt small style={{ flex: 1 }}>
                        {t(
                          "Prepare this exact approved image for saving or sharing; copies cannot be recalled.",
                          "准备这张已核准图片用于保存或分享，副本无法撤回。",
                        )}
                      </Txt>
                    </Row>
                    <Button
                      disabled={!!action || exportConsent !== row.id}
                      label={t("Prepare approved image", "准备核准图片")}
                      onPress={() => void show(row, true)}
                    />
                  </>
                )}
              {!["CANCELLED", "REJECTED"].includes(row.status) && (
                <Button
                  kind="secondary"
                  disabled={!!action || busy}
                  label={t("Cancel this request", "取消本申请")}
                  onPress={() =>
                    void perform(row.id, async () => {
                      await api(`me/achievement-cards/${row.id}/cancel`, {});
                      if (currentOwner.current === owner) await refresh();
                    })
                  }
                />
              )}
            </Card>
          ))}
          {data.page.nextCursor && (
            <Button
              disabled={paging || !!action}
              label={
                paging
                  ? t("Loading…", "加载中……")
                  : t("Older requests", "较早申请")
              }
              onPress={() => void more()}
            />
          )}
        </>
      )}
    </Screen>
  );
}
