import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { tutorialLayout } from "./tutorial-layout";
export function useTutorialLayout() {
  const { width, height, fontScale } = useWindowDimensions(),
    insets = useSafeAreaInsets();
  return tutorialLayout(width, height, insets.top, insets.bottom, fontScale);
}
