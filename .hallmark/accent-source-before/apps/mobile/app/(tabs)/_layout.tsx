import React from "react";
import { Tabs, Redirect, router } from "expo-router";
import { PlatformPressable } from "@react-navigation/elements";
import { NavGlyph } from "../../src/design/NavGlyph";
import { fonts, radii } from "../../src/design/tokens";
import { useApp } from "../../src/state";
import { useTheme, Screen, Busy, Button, Notice } from "../../src/ui";
export default function TabLayout() {
  const { token, user, loading, reload, t } = useApp(),
    c = useTheme();
  if (loading) return <Busy />;
  if (!token) return <Redirect href="/" />;
  if (!user)
    return (
      <Screen>
        <Busy />
        <Notice text={t("Connecting to your account…", "正在连接账号……")} />
        <Button label={t("Try again", "重试")} onPress={() => void reload()} />
        <Button
          kind="secondary"
          label={t("Downloaded lessons", "已下载课程")}
          onPress={() => router.push("/downloads")}
        />
      </Screen>
    );
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: c.onAccent,
        tabBarActiveBackgroundColor: c.accent,
        tabBarInactiveBackgroundColor: c.paper,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: {
          backgroundColor: c.paper,
          borderTopColor: c.edge,
          borderTopWidth: 2,
          height: 92,
          paddingBottom: 12,
          paddingTop: 8,
        },
        tabBarItemStyle: {
          marginHorizontal: 6,
          borderRadius: radii.stock,
          paddingVertical: 0,
        },
        tabBarButton: (props) => (
          <PlatformPressable
            {...props}
            style={[props.style, { borderRadius: radii.stock, minHeight: 58 }]}
          />
        ),
        tabBarLabelStyle: {
          fontFamily: fonts.strong,
          fontSize: 13,
          lineHeight: 20,
        },
        tabBarIcon: ({ color, size }) => (
          <NavGlyph name={route.name} size={24} color={color} />
        ),
      })}
    >
      <Tabs.Screen name="index" options={{ title: t("Discover", "发现") }} />
      <Tabs.Screen name="learn" options={{ title: t("Learn", "学习") }} />
      <Tabs.Screen name="play" options={{ title: t("Play", "挑战") }} />
      <Tabs.Screen name="profile" options={{ title: t("Profile", "我的") }} />
    </Tabs>
  );
}
