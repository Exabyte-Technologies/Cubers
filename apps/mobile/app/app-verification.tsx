import React, { useCallback, useRef, useState } from "react";
import { Redirect, useFocusEffect } from "expo-router";
import type { z } from "zod";
import {
  AppAttestationCatalogue,
  AppAttestationReceiptRefreshResult,
  AppAttestationKeyView,
} from "@cubers/core";
import { useApp } from "../src/state";
import {
  Screen,
  Card,
  Heading,
  Txt,
  Button,
  Row,
  Notice,
  Busy,
} from "../src/ui";
import {
  appVerification,
  verificationProvider,
} from "../src/verification/native";
import { verificationMessage } from "../src/verification/messages";
import { VERIFICATION_NOTICE } from "../src/verification/notices";
export default function AppVerificationPage() {
  const { token, region, user } = useApp();
  if (!token) return <Redirect href="/" />;
  return <VerificationView key={JSON.stringify([token, region, user?.id])} />;
}
function VerificationView() {
  const android = verificationProvider === "google-play";
  const { t, locale, api, user } = useApp(),
    epoch = useRef(0),
    [catalogue, setCatalogue] = useState<z.infer<
      typeof AppAttestationCatalogue
    > | null>(null),
    [message, setMessage] = useState(""),
    [notice, setNotice] = useState(false),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState<
      { id: string; version: number } | "reset" | null
    >(null);
  const load = useCallback(async () => {
    const n = ++epoch.current;
    try {
      const c = AppAttestationCatalogue.parse(await api("me/app-attestation"));
      if (n === epoch.current) setCatalogue(c);
    } catch (e) {
      if (n === epoch.current) setMessage(verificationMessage(e, locale));
    }
  }, [api, locale]);
  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        epoch.current++;
        appVerification.cancel();
        setCatalogue(null);
        setConfirm(null);
      };
    }, [load]),
  );
  async function run(
    work: () => Promise<unknown>,
    success: string | ((result: unknown) => string),
  ) {
    const n = epoch.current;
    setBusy(true);
    setMessage("");
    setConfirm(null);
    try {
      const result = await work();
      if (n !== epoch.current) return;
      setMessage(typeof success === "function" ? success(result) : success);
      await load();
    } catch (e) {
      if (n === epoch.current) setMessage(verificationMessage(e, locale));
    } finally {
      setBusy(false);
    }
  }
  const available =
    catalogue?.providers.some(
      (p) => p.provider === verificationProvider && p.available,
    ) && appVerification.supported();
  return (
    <Screen>
      <Heading>{t("App verification", "应用验证")}</Heading>
      <Card>
        <Txt small>
          {android
            ? t(
                "On supported Android devices, Google checks the app, device and Play licensing. It receives an action request hash; your Cubers name, posts and recordings are not sent.",
                "在支持的 Android 设备上，Google 核验应用、设备和 Play 许可，接收操作请求的散列，不接收你的 Cubers 名称、帖子或录像。",
              )
            : t(
                "On supported iPhones, Apple checks the app using a server challenge. Your posts and recordings are not sent.",
                "在支持的 iPhone 上，Apple 使用服务器质询核验应用，不接收你的帖子或录像。",
              )}
        </Txt>
        <Txt>
          {android
            ? t(
                "Android checks are specific to each action. Preparation lasts for this signed-in app session, stores no verification key and does not by itself verify a solve or enable ranking.",
                "Android 验证针对每次操作。准备状态仅保留在本次登录的应用会话内，不保存验证密钥，也不单独证明还原过程或开放排名。",
              )
            : t(
                "Verification helps the server check that sensitive game actions came from your app. It does not verify a solve or replace recording review.",
                "应用验证帮助服务器核验重要游戏操作是否来自你的应用，但不验证实际还原过程，也不替代录像审核。",
              )}
        </Txt>
        <Txt small>
          {android
            ? t(
                "Fresh Google tokens are used once and are not stored by Cubers. Recording review and server puzzle checks remain required.",
                "每个 Google 令牌仅使用一次，Cubers 不保存令牌；仍须进行录像审核和服务器魔方状态校验。",
              )
            : t(
                "Your device keeps its private key. Cubers stores an encrypted verification receipt. Keys belong to one account and community.",
                "设备保管私钥，Cubers 保存加密的验证凭据。验证密钥仅关联一个账号及其所属社区。",
              )}
        </Txt>
        {!available && (
          <Notice
            text={t(
              "Device verification is not available here yet. Casual practice remains available.",
              "此处暂未开放设备验证，仍可使用休闲练习。",
            )}
          />
        )}
        <Button
          disabled={busy || !available || !user?.permissions.canLearn}
          label={
            android
              ? t("Prepare Android verification", "准备 Android 验证")
              : t("Verify this device", "验证此设备")
          }
          onPress={() =>
            void run(
              () => appVerification.enroll(),
              android
                ? t(
                    "Android verification is prepared for this session. Each protected action still needs its own check; ranking remains separately gated.",
                    "已为本次会话准备 Android 验证。每次重要操作仍须独立核验，排名仍需单独验收。",
                  )
                : catalogue?.providers.some(
                      (provider) =>
                        provider.provider === "apple-app-attest" &&
                        provider.receiptRefreshAvailable,
                    )
                  ? t(
                      "Device key saved. Update its receipt below before using verification for game actions.",
                      "已保存设备密钥。用于游戏操作验证前，请先在下方更新其凭据。",
                    )
                  : t(
                      "This device is verified for your account. Ranking still requires separate approval.",
                      "此设备已完成账号验证，正式排名仍需单独验收。",
                    ),
            )
          }
        />
        {(android || (available && user?.permissions.canLearn)) && (
          <Button
            disabled={busy}
            kind="secondary"
            label={
              android
                ? t("Cancel Android checks", "取消 Android 验证")
                : t("Reset this device’s verification", "重置此设备的验证")
            }
            onPress={() => setConfirm("reset")}
          />
        )}
      </Card>
      {message ? <Notice text={message} /> : null}
      {busy ? <Busy /> : null}
      {!catalogue ? (
        <Busy />
      ) : catalogue.keys.length === 0 ? (
        <Card>
          <Txt>
            {t(
              "No Apple device verification keys are saved for this account. Android checks do not save a device key.",
              "此账号尚无 Apple 设备验证密钥。Android 操作验证不保存设备密钥。",
            )}
          </Txt>
        </Card>
      ) : (
        catalogue.keys.map((key, i) => (
          <Card key={key.id}>
            <Txt style={{ fontWeight: "600" }}>
              {t(`Device verification ${i + 1}`, `设备验证 ${i + 1}`)}
            </Txt>
            <Txt>
              {key.status === "ACTIVE"
                ? t("Active", "有效")
                : key.status === "EXPIRED"
                  ? t("Expired", "已过期")
                  : t("Removed", "已撤销")}
            </Txt>
            <Txt small>
              {t(
                `App build ${key.bundleVersion}`,
                `应用版本 ${key.bundleVersion}`,
              )}
            </Txt>
            <Txt small>
              {t("Last verified: ", "最近验证：") +
                new Date(key.lastVerifiedAt).toLocaleString(
                  locale === "zh" ? "zh-CN" : "en",
                )}
            </Txt>
            <Txt small>
              {t("Receipt expires: ", "凭据到期：") +
                new Date(key.receiptExpiresAt).toLocaleString(
                  locale === "zh" ? "zh-CN" : "en",
                )}
            </Txt>
            {!android &&
              available &&
              key.status === "ACTIVE" &&
              catalogue.providers.some(
                (p) =>
                  p.provider === "apple-app-attest" &&
                  p.receiptRefreshAvailable,
              ) && (
                <>
                  <Txt small>
                    {t(
                      "Updating sends the saved verification receipt to Apple for a fresh risk assessment. Your name, posts and recordings are not sent. Apple may require waiting before another update; updating does not enable ranking.",
                      "更新会将已保存的应用验证凭据发送至 Apple，获取新的风险评估，不发送你的名称、帖子或录像。Apple 可能要求等待后才能再次更新；更新不会开放排名。",
                    )}
                  </Txt>
                  <Button
                    disabled={busy}
                    kind="secondary"
                    label={t("Update verification receipt", "更新验证凭据")}
                    onPress={() =>
                      void run(
                        async () => {
                          return AppAttestationReceiptRefreshResult.parse(
                            await api(
                              `me/app-attestation/keys/${key.id}/refresh`,
                              { expectedVersion: key.version },
                            ),
                          );
                        },
                        (result) => {
                          const response =
                            AppAttestationReceiptRefreshResult.parse(result);
                          if (response.assessment === "review-required")
                            return t(
                              "Receipt updated. An operator review is required before verification can be used for game actions.",
                              "凭据已更新。用于游戏操作验证前，仍须由运营方审核。",
                            );
                          if (response.refreshed)
                            return t(
                              "Verification receipt updated. Ranking remains disabled.",
                              "验证凭据已更新，排名仍未开放。",
                            );
                          return t(
                            "Apple requires waiting before another update. The existing expiry is unchanged.",
                            "Apple 要求等待后才能再次更新，现有到期时间未延长。",
                          );
                        },
                      )
                    }
                  />
                </>
              )}
            {!android &&
              (key.receiptAutoRefresh ||
                (key.status === "ACTIVE" &&
                  catalogue.providers.some(
                    (p) =>
                      p.provider === "apple-app-attest" &&
                      p.receiptAutoRefreshAvailable,
                  ))) && (
                <>
                  <Txt small>
                    {t(
                      "Optional automatic updates send this saved receipt to Apple after its permitted update time, even when you are signed out. They exclude your name, posts and recordings. You can stop them here; they do not enable ranking.",
                      "可选的自动更新会在 Apple 允许的时间后发送此凭据，即使你已退出登录；不发送名称、帖子或录像。你可以在此停止，自动更新不会开放排名。",
                    )}
                  </Txt>
                  {key.receiptAutoRefresh && key.receiptRefreshAt && (
                    <Txt small>
                      {t("Next scheduled update: ", "下次计划更新：") +
                        new Date(key.receiptRefreshAt).toLocaleString(
                          locale === "zh" ? "zh-CN" : "en",
                        )}
                    </Txt>
                  )}
                  <Button
                    kind="secondary"
                    disabled={
                      busy ||
                      (!key.receiptAutoRefresh && !user?.permissions.canLearn)
                    }
                    label={
                      key.receiptAutoRefresh
                        ? t("Stop automatic updates", "停止自动更新")
                        : t("Enable automatic updates", "开启自动更新")
                    }
                    onPress={() =>
                      void run(
                        async () =>
                          AppAttestationKeyView.parse(
                            await api(
                              `me/app-attestation/keys/${key.id}/receipt-schedule`,
                              {
                                expectedVersion: key.version,
                                enabled: !key.receiptAutoRefresh,
                              },
                            ),
                          ),
                        key.receiptAutoRefresh
                          ? t("Automatic updates stopped.", "已停止自动更新。")
                          : t(
                              "Automatic updates enabled for this key.",
                              "已为此密钥开启自动更新。",
                            ),
                      )
                    }
                  />
                </>
              )}
            {key.status === "ACTIVE" && (
              <Button
                disabled={busy}
                kind="secondary"
                label={t("Remove verification", "撤销验证")}
                onPress={() => setConfirm({ id: key.id, version: key.version })}
              />
            )}
          </Card>
        ))
      )}
      {confirm && (
        <Card>
          <Txt>
            {confirm === "reset"
              ? android
                ? t(
                    "Cancel this account’s pending Android proofs and clear preparation in this app? Committed game actions are not undone.",
                    "取消此账号待处理的 Android 证明并清除此应用中的准备状态？已完成的游戏操作不会撤销。",
                  )
                : t(
                    "Resetting revokes any known verification for this device. You will need to verify again before a ranked attempt.",
                    "重置会撤销此设备已知的验证记录。参与排名尝试前需要重新验证。",
                  )
              : t(
                  "Remove this verification and stop any pending proofs using it?",
                  "撤销这项验证，并停止使用该密钥的待处理证明？",
                )}
          </Txt>
          <Row>
            <Button
              disabled={busy}
              kind="secondary"
              label={t("Cancel", "取消")}
              onPress={() => setConfirm(null)}
            />
            <Button
              disabled={busy}
              label={t("Confirm", "确认")}
              onPress={() =>
                void run(
                  () =>
                    confirm === "reset"
                      ? appVerification.reset()
                      : appVerification.revoke(confirm!.id, confirm!.version),
                  t("Verification removed.", "验证已撤销。"),
                )
              }
            />
          </Row>
        </Card>
      )}
      <Button
        disabled={busy}
        kind="secondary"
        label={t("Refresh", "刷新")}
        onPress={() => void load()}
      />
      <Button
        kind="secondary"
        label={t("Open-source notice", "开源软件声明")}
        onPress={() => setNotice(!notice)}
      />
      {notice ? (
        <Card>
          <Txt small selectable>
            {VERIFICATION_NOTICE}
          </Txt>
        </Card>
      ) : null}
    </Screen>
  );
}
