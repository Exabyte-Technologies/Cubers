import React from "react";
import { Pressable, Platform } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useTheme } from "./ui";
import { useApp } from "./state";
export function ProfileGear({ onPress }: { onPress: () => void }) {
  const c = useTheme(),
    { t } = useApp();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("Settings", "设置")}
      onPress={onPress}
      {...(Platform.OS === "web"
        ? { dataSet: { hum: "profile-settings" } }
        : {})}
      style={({ pressed }) => ({
        width: 48,
        height: 48,
        borderRadius: 16,
        backgroundColor: pressed ? c.field : c.paper,
        borderWidth: 1,
        borderColor: c.edge,
        justifyContent: "center",
        alignItems: "center",
      })}
    >
      <Svg width={26} height={26} viewBox="0 0 26 26" aria-hidden={true}>
        <Path
          d="M10 2.5h6l.8 3.2 2.8 1.6 3.2-.9 3 5.2-2.4 2.3v3.2l2.4 2.3-3 5.2-3.2-.9-2.8 1.6-.8 3.2h-6l-.8-3.2-2.8-1.6-3.2.9-3-5.2L2.6 17v-3.2L.2 11.5l3-5.2 3.2.9 2.8-1.6z"
          transform="translate(2.6 0) scale(.8)"
          fill="none"
          stroke={c.ink}
          strokeWidth={2}
          strokeLinejoin="round"
        />
        <Circle
          cx={13}
          cy={13}
          r={4}
          fill="none"
          stroke={c.ink}
          strokeWidth={2}
        />
      </Svg>
    </Pressable>
  );
}
