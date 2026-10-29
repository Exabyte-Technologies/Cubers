import React from "react";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { AppState } from "../src/state";
export default function Root() {
  return (
    <SafeAreaProvider>
      <AppState>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }} />
      </AppState>
    </SafeAreaProvider>
  );
}
