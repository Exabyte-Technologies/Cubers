import React from "react";
import { Stack, usePathname, router } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { AppState, useApp } from "../src/state";
import { Busy, Screen, Heading, Button } from "../src/ui";
import { SessionRestoreNotice } from "../src/SessionRestoreNotice";
import { useFonts } from "expo-font";
import { ActivityIndicator, View, useColorScheme } from "react-native";
import { darkPalette, lightPalette } from "../src/design/tokens";
import "../src/design/styles";
import { DEVELOPMENT_BUILD } from "../src/development/config";
import {
  DevelopmentBootstrap,
  DevelopmentTools,
} from "../src/development/DevelopmentTools";

function SessionReady({ children }: { children: React.ReactNode }) {
  const { loading, storageUnavailable, t } = useApp();
  const pathname = usePathname();
  const publicPage =
    pathname === "/" ||
    pathname === "/sign-in" ||
    pathname.startsWith("/legal/") ||
    ["/verify", "/reset-password", "/invitation", "/delete-account"].includes(
      pathname,
    );
  if (loading && !publicPage) return <Busy />;
  if (storageUnavailable && !publicPage)
    return (
      <Screen>
        <Heading>{t("Restore your sign-in", "恢复登录信息")}</Heading>
        <SessionRestoreNotice />
        <Button
          kind="secondary"
          label={t("Sign-in and help", "登录与帮助")}
          onPress={() => router.push("/sign-in")}
        />
      </Screen>
    );
  return children;
}

export default function Root() {
  const [fontsLoaded, fontError] = useFonts({
    ChillaxMedium: require("../assets/fonts/Chillax-Medium.ttf"),
    ChillaxSemibold: require("../assets/fonts/Chillax-Semibold.ttf"),
  });
  const c = useColorScheme() === "dark" ? darkPalette : lightPalette;
  if (!fontsLoaded && !fontError)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: c.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator accessibilityLabel="Loading Cubers" color={c.blue} />
      </View>
    );
  const application = (
    <AppState>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{ headerShown: false }}
        screenLayout={({ children }) => <SessionReady>{children}</SessionReady>}
      />
      {DEVELOPMENT_BUILD ? <DevelopmentTools /> : null}
    </AppState>
  );
  return (
    <SafeAreaProvider>
      {DEVELOPMENT_BUILD ? (
        <DevelopmentBootstrap>{application}</DevelopmentBootstrap>
      ) : (
        application
      )}
    </SafeAreaProvider>
  );
}
