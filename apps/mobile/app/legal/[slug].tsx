import React, { useEffect, useState } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { useApp } from "../../src/state";
import { Linking } from "react-native";
import { PublicLegalDocument } from "@cubers/core";
import { Screen, Heading, Txt, Button, Busy, Notice } from "../../src/ui";
export default function Legal() {
  const { slug } = useLocalSearchParams<{ slug: string }>(),
    { api, locale, t } = useApp(),
    [document, setDocument] = useState<PublicLegalDocument>(),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true;
    setDocument(undefined);
    setError("");
    api(`legal/${slug}`)
      .then((value) => {
        if (current) setDocument(PublicLegalDocument.parse(value));
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [slug, api, retry]);
  const openLink = (url: string) => {
    void Linking.openURL(url).catch(() =>
      setError(t("Could not open this link.", "无法打开此链接。")),
    );
  };
  return (
    <Screen>
      <Button
        label={t("Back", "返回")}
        kind="secondary"
        onPress={() =>
          router.canGoBack() ? router.back() : router.replace("/")
        }
      />
      {error ? (
        <>
          <Notice text={error} error />
          <Button
            label={t("Try again", "重试")}
            kind="secondary"
            onPress={() => setRetry((value) => value + 1)}
          />
        </>
      ) : null}
      {document ? (
        <>
          <Heading>{document.title[locale]}</Heading>
          <Txt>{document.body[locale]}</Txt>
          <Button
            label={t("Email support", "联系支持邮箱")}
            onPress={() => openLink(`mailto:${document.operator.email}`)}
          />
          <Button
            label={t("Operator website", "运营方网站")}
            kind="secondary"
            onPress={() => openLink(document.operator.website)}
          />
          {document.actionUrl ? (
            <Button
              label={t("Open browser deletion request", "打开浏览器注销申请")}
              onPress={() => openLink(document.actionUrl!)}
            />
          ) : null}
        </>
      ) : !error ? (
        <Busy />
      ) : null}
    </Screen>
  );
}
