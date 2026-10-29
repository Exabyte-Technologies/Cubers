import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Platform } from "react-native";
import { useFocusEffect } from "expo-router";
import {
  SponsorCards as CardList,
  SponsorDestination,
  parseSponsorDestination,
  type SponsorCard as Sponsor,
} from "@cubers/core";
import { useApp } from "./state";
import { Card, Txt, Button, Notice } from "./ui";
type Leased = { card: Sponsor; until: number };
export function SponsorCards() {
  const { token, region, user } = useApp();
  const eligible = !!user?.permissions?.canSeeSponsors;
  return (
    <SponsorView
      key={JSON.stringify([token, region, eligible])}
      eligible={eligible}
    />
  );
}
function SponsorView({ eligible }: { eligible: boolean }) {
  const { api, t, locale, token } = useApp(),
    [rows, setRows] = useState<Leased[]>([]),
    [selected, setSelected] = useState<Leased>(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const live = useRef(true),
    focused = useRef(false),
    epoch = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    opening = useRef(false);
  const clear = useCallback(() => {
    epoch.current++;
    clearTimeout(timer.current);
    setRows([]);
    setSelected(undefined);
  }, []);
  const load = useCallback(async () => {
    clear();
    if (
      !eligible ||
      !token ||
      !focused.current ||
      AppState.currentState === "background" ||
      AppState.currentState === "inactive"
    )
      return;
    if (Platform.OS === "web" && document.visibilityState !== "visible") return;
    const run = epoch.current,
      start = performance.now();
    try {
      const parsed = CardList.parse(await api("sponsors"));
      if (!live.current || !focused.current || run !== epoch.current) return;
      const now = performance.now(),
        elapsed = now - start;
      const leased = parsed
        .map((card) => ({
          card,
          until: now + Math.max(0, card.validForMs - elapsed),
        }))
        .filter((row) => row.until > now);
      setRows(leased);
      if (leased.length)
        timer.current = setTimeout(
          () => {
            if (live.current && run === epoch.current) clear();
          },
          Math.max(
            0,
            Math.min(...leased.map((row) => row.until)) - performance.now(),
          ),
        );
    } catch {
      if (live.current && run === epoch.current) clear();
    }
  }, [api, eligible, token, clear]);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      epoch.current++;
      clearTimeout(timer.current);
    };
  }, []);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      void load();
      const refresh = setInterval(() => void load(), 25000);
      return () => {
        focused.current = false;
        clearInterval(refresh);
        clear();
      };
    }, [load, clear]),
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") clear();
      else if (focused.current) void load();
    });
    const visibility = () => {
      if (document.visibilityState !== "visible") clear();
      else if (focused.current) void load();
    };
    if (Platform.OS === "web")
      document.addEventListener("visibilitychange", visibility);
    return () => {
      sub.remove();
      if (Platform.OS === "web")
        document.removeEventListener("visibilitychange", visibility);
    };
  }, [clear, load]);
  async function open() {
    if (!selected || opening.current || selected.until <= performance.now())
      return;
    const chosen = selected,
      run = epoch.current;
    opening.current = true;
    setBusy(true);
    setMessage("");
    try {
      const value = await api(`sponsors/${chosen.card.id}/open`, {
        expectedVersion: chosen.card.version,
      });
      const destination = SponsorDestination.parse(value.destination);
      if (
        !live.current ||
        !focused.current ||
        run !== epoch.current ||
        chosen.until <= performance.now()
      )
        return;
      if (
        value.version !== chosen.card.version ||
        destination !== chosen.card.destination
      )
        throw Error("changed");
      if (Platform.OS === "web") {
        // Same-tab navigation avoids popup blocking after the server check.
        const link = document.createElement("a");
        link.href = destination;
        link.target = "_self";
        link.rel = "noopener noreferrer";
        link.referrerPolicy = "no-referrer";
        document.body.appendChild(link);
        link.click();
        link.remove();
      } else await Linking.openURL(destination);
      setSelected(undefined);
    } catch {
      if (live.current && run === epoch.current) {
        clear();
        setMessage(
          t(
            "This advertisement is no longer available. Refresh Discover to continue.",
            "此广告已不可用，请刷新发现页后继续。",
          ),
        );
      }
    } finally {
      opening.current = false;
      if (live.current) setBusy(false);
    }
  }
  if (!eligible) return null;
  return (
    <>
      {rows.map(({ card, until }) => (
        <Card key={card.id}>
          <Txt small style={{ fontWeight: "800" }}>
            {t("Advertisement · Sponsor", "广告 · 赞助内容")}
          </Txt>
          <Txt style={{ fontWeight: "700", fontSize: 20 }}>
            {card.title[locale]}
          </Txt>
          <Txt>{card.summary[locale]}</Txt>
          <Txt small selectable>
            {parseSponsorDestination(card.destination)!.host}
          </Txt>
          <Button
            label={t("Review sponsor website", "查看赞助方网站信息")}
            disabled={busy}
            onPress={() => {
              if (until > performance.now()) {
                setSelected({ card, until });
                setMessage("");
              }
            }}
          />
        </Card>
      ))}
      {selected && (
        <Card>
          <Txt accessibilityRole="header" style={{ fontWeight: "700" }}>
            {t("Open an external website?", "打开外部网站？")}
          </Txt>
          <Txt>
            {t(
              "You are leaving Cubers. The website's own privacy terms apply. No account or puzzle information is added to this link.",
              "即将离开 Cubers，外部网站适用其自身的隐私规则。链接不会附加你的账号或魔方信息。",
            )}
          </Txt>
          <Txt selectable>{selected.card.destination}</Txt>
          <Button
            label={t("Open website", "打开网站")}
            disabled={busy}
            onPress={() => void open()}
          />
          <Button
            label={t("Stay in Cubers", "留在 Cubers")}
            disabled={busy}
            onPress={() => setSelected(undefined)}
          />
        </Card>
      )}
      {!!message && <Notice text={message} />}
    </>
  );
}
