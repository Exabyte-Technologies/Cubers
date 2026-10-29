import React from "react";
import { Tabs, Redirect, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
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
  const icons: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = {
    index: "planet-outline",
    learn: "book-outline",
    play: "game-controller-outline",
    profile: "person-circle-outline",
  };
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: c.green,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: {
          backgroundColor: c.paper,
          borderTopColor: c.line,
          height: 79,
          paddingBottom: 15,
          paddingTop: 9,
        },
        tabBarLabelStyle: { fontWeight: "600", fontSize: 11 },
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={icons[route.name]} size={size} color={color} />
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
