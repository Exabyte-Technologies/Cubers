import React, { useRef, useState } from "react";
import { View, ScrollView } from "react-native";
import type { ActivityCalendar } from "@cubers/core";
import { useApp } from "./state";
import { Button, Row, Txt, useTheme } from "./ui";

export function ProfileActivity({ data }: { data: ActivityCalendar }) {
  const { t, locale } = useApp(),
    c = useTheme();
  const scroll = useRef<ScrollView>(null);
  const [details, setDetails] = useState(false);
  const leading = data.days.length
    ? new Date(data.days[0].day + "T00:00:00Z").getUTCDay()
    : 0;
  const cells = [...Array.from({ length: leading }, () => null), ...data.days];
  const weeks = Array.from(
    { length: Math.ceil(cells.length / 7) },
    (_, index) => cells.slice(index * 7, index * 7 + 7),
  );
  const activeDays = data.days.filter((day) => day.total > 0).reverse();
  const date = (day: string) =>
    new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(day + "T12:00:00Z"));
  const description = (day: ActivityCalendar["days"][number]) =>
    t(
      `${date(day.day)}: ${day.lessons} lesson ${day.lessons === 1 ? "practice" : "practices"}, ${day.guidedSolves} guided ${day.guidedSolves === 1 ? "solve" : "solves"}, ${day.solves} approved ${day.solves === 1 ? "solve" : "solves"}`,
      `${date(day.day)}：${day.lessons} 次课程练习、${day.guidedSolves} 次引导还原、${day.solves} 次已核准还原`,
    );
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: c.line,
        borderRadius: 24,
        padding: 20,
        gap: 16,
        backgroundColor: c.paper,
      }}
    >
      <Row style={{ justifyContent: "space-between" }}>
        <Txt
          accessibilityRole="header"
          style={{ fontSize: 23, fontWeight: "600", lineHeight: 30 }}
        >
          {t("A little every day", "每天一点点")}
        </Txt>
        <Txt small style={{ color: c.muted }}>
          {t(
            `${data.totals.activeDays} active ${data.totals.activeDays === 1 ? "day" : "days"}`,
            `${data.totals.activeDays} 个活跃日`,
          )}
        </Txt>
      </Row>
      <Txt small style={{ color: c.muted }}>
        {t(
          "Private activity from verified practice over the last year. Scroll to explore earlier days.",
          "私密活动：过去一年的已验证练习，横向滚动可查看更早的日期。",
        )}
      </Txt>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ gap: 2, paddingTop: 21 }}>
          {["", t("Mon", "一"), "", t("Wed", "三"), "", t("Fri", "五"), ""].map(
            (label, i) => (
              <Txt
                key={i}
                small
                style={{
                  fontSize: 10,
                  lineHeight: 14,
                  height: 14,
                  color: c.muted,
                }}
              >
                {label}
              </Txt>
            ),
          )}
        </View>
        <ScrollView
          ref={scroll}
          horizontal
          showsHorizontalScrollIndicator
          onContentSizeChange={() =>
            scroll.current?.scrollToEnd({ animated: false })
          }
          style={{ flex: 1 }}
          contentContainerStyle={{ gap: 3, paddingBottom: 10 }}
          accessibilityLabel={t(
            "Daily practice activity calendar",
            "每日练习活动日历",
          )}
        >
          {weeks.map((week, index) => {
            const month = week.find(
              (day) => day && Number(day.day.slice(-2)) === 1,
            );
            return (
              <View key={index} style={{ gap: 2, width: 14 }}>
                <Txt
                  small
                  style={{
                    fontSize: 9,
                    lineHeight: 19,
                    height: 19,
                    width: 45,
                    color: c.muted,
                  }}
                >
                  {month
                    ? new Intl.DateTimeFormat(
                        locale === "zh" ? "zh-CN" : "en",
                        { timeZone: "UTC", month: "short" },
                      ).format(new Date(month.day + "T12:00:00Z"))
                    : ""}
                </Txt>
                {week.map((day, i) => (
                  <View
                    key={day?.day ?? `pad-${i}`}
                    accessible={!!day}
                    accessibilityLabel={day ? description(day) : undefined}
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 3,
                      backgroundColor: day?.total ? c.mintDeep : c.line,
                      opacity: !day
                        ? 0
                        : day.total === 0
                          ? 0.5
                          : day.total < 2
                            ? 0.4
                            : day.total < 4
                              ? 0.6
                              : day.total < 8
                                ? 0.8
                                : 1,
                    }}
                  />
                ))}
              </View>
            );
          })}
        </ScrollView>
      </View>
      <Row style={{ justifyContent: "space-between", gap: 12 }}>
        <Txt small style={{ color: c.muted }}>
          {data.timeZone}
        </Txt>
        <Row style={{ gap: 4 }}>
          <Txt small>{t("Less", "少")}</Txt>
          {[0, 1, 2, 3, 4].map((level) => (
            <View
              key={level}
              style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                backgroundColor: level ? c.mintDeep : c.line,
                opacity: level ? 0.25 + level * 0.1875 : 0.5,
              }}
            />
          ))}
          <Txt small>{t("More", "多")}</Txt>
        </Row>
      </Row>
      <Button
        small
        kind="secondary"
        label={
          details
            ? t("Hide daily details", "收起每日记录")
            : t("Daily details", "每日记录")
        }
        onPress={() => setDetails((value) => !value)}
      />
      {details &&
        (activeDays.length ? (
          activeDays.map((day) => (
            <View
              key={day.day}
              style={{ borderTopWidth: 1, borderColor: c.line, paddingTop: 12 }}
            >
              <Txt small>{description(day)}</Txt>
            </View>
          ))
        ) : (
          <Txt small>
            {t(
              "Your first verified practice will fill the first square.",
              "完成第一次已验证练习，就能点亮第一个方格。",
            )}
          </Txt>
        ))}
    </View>
  );
}
