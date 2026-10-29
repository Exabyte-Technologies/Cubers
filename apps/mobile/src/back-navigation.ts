import type { Href } from "expo-router";

type BackNavigation = {
  canGoBack(): boolean;
  back(): void;
  replace(destination: Href): void;
};

/** A native link or browser bookmark may open a screen without any history. */
export function backOrReplace(navigation: BackNavigation, destination: Href) {
  if (navigation.canGoBack()) navigation.back();
  else navigation.replace(destination);
}
