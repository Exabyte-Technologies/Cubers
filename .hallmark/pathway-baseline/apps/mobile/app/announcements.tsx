import React from "react";
import { router, Redirect } from "expo-router";
import { AnnouncementCards } from "../src/Announcements";
import { useApp } from "../src/state";
import { Screen, Button } from "../src/ui";
export default function UpdatesPage() {
  const { token, t } = useApp();
  if (!token) return <Redirect href="/" />;
  return (
    <Screen>
      <Button
        small
        kind="secondary"
        label={t("Back", "返回")}
        onPress={() => router.back()}
      />
      <AnnouncementCards full />
    </Screen>
  );
}
