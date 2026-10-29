import React from "react";
import { router, Redirect, useLocalSearchParams } from "expo-router";
import { useApp } from "../src/state";
import { Screen, Heading, Button } from "../src/ui";
import { invitationFromParams, invitationSignIn } from "../src/invitations";
import { ClubDirectory } from "../src/ClubDirectory";
export default function Clubs() {
  const { t, token, region } = useApp(),
    { invite, community } = useLocalSearchParams<{
      invite?: string;
      community?: string;
    }>();
  const intent = invitationFromParams({
    kind: "club",
    code: invite,
    community,
  });
  if (!token)
    return <Redirect href={intent ? invitationSignIn(intent) : "/"} />;
  if (intent?.community && intent.community !== region)
    return (
      <Redirect href={{ pathname: "/invitation", params: { ...intent } }} />
    );
  return (
    <Screen>
      <Button
        small
        kind="secondary"
        label={t("Discover", "返回探索")}
        onPress={() => router.back()}
      />
      <Heading>{t("Your circle of cubers", "你的魔方圈子")}</Heading>
      <ClubDirectory
        key={`${token}:${region}:${intent?.code || "directory"}`}
        initialInvite={intent?.code || ""}
      />
    </Screen>
  );
}
