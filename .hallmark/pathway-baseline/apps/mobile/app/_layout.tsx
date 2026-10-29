import React from "react";
import { Stack, usePathname } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { AppState, useApp } from "../src/state";
import { Busy } from "../src/ui";
import { useFonts } from "expo-font";
import { ActivityIndicator, View, useColorScheme } from "react-native";
import { darkPalette, lightPalette } from "../src/design/tokens";
import "../src/design/styles";

function SessionReady({ children }: { children: React.ReactNode }) {
  const { loading } = useApp();
  const pathname = usePathname();
  const publicPage =
    pathname === "/" ||
    pathname.startsWith("/legal/") ||
    ["/verify", "/reset-password", "/invitation", "/delete-account"].includes(pathname);
  if (loading && !publicPage) return <Busy />;
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
  return (
    <SafeAreaProvider>
      <AppState>
        <StatusBar style="auto" />
        <Stack
          screenOptions={{ headerShown: false }}
          screenLayout={({ children }) => <SessionReady>{children}</SessionReady>}
        />
      </AppState>
    </SafeAreaProvider>
  );
}
