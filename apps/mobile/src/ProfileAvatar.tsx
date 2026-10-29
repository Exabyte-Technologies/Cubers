import React from "react";
import { View } from "react-native";
import Svg, { Polygon, Circle, Path } from "react-native-svg";
import type { ProfileSettings } from "@cubers/core";
import { useApp } from "./state";
import { avatarPalette } from "./design/tokens";
export function ProfileAvatar({
  avatar = { shape: "cube", color: "mint" },
  size = 72,
}: {
  avatar?: ProfileSettings["avatar"];
  size?: number;
}) {
  const { t } = useApp();
  const colors = avatarPalette[avatar.color];
  const shape = {
    cube: t("Cube", "魔方"),
    orbit: t("Orbit", "轨道"),
    pyramid: t("Pyramid", "金字塔"),
  }[avatar.shape];
  const color = {
    mint: t("Mint", "薄荷"),
    sunset: t("Sunset", "落日"),
    indigo: t("Indigo", "靛蓝"),
    rose: t("Rose", "玫瑰"),
  }[avatar.color];
  return (
    <View
      accessible
      accessibilityLabel={t(
        shape + " avatar, " + color,
        shape + "头像，" + color,
      )}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        overflow: "hidden",
        backgroundColor: colors[0],
      }}
    >
      <Svg width={size} height={size} viewBox="0 0 100 100" aria-hidden={true}>
        {avatar.shape === "cube" ? (
          <>
            <Polygon points="50,18 80,35 50,53 20,35" fill={colors[2]} />
            <Polygon points="20,35 50,53 50,86 20,68" fill={colors[1]} />
            <Polygon
              points="50,53 80,35 80,68 50,86"
              fill={colors[2]}
              stroke={colors[1]}
              strokeWidth="2"
            />
            <Path
              d="M35 44V76 M20 51L50 69L80 51 M65 44V76"
              stroke={colors[0]}
              strokeWidth="2"
              fill="none"
            />
          </>
        ) : avatar.shape === "pyramid" ? (
          <>
            <Polygon
              points="50,16 15,78 84,78"
              fill={colors[2]}
              stroke={colors[1]}
              strokeWidth="3"
            />
            <Path
              d="M50 16L50 57L15 78 M50 57L84 78 M32 47L68 47 M32 47L50 78L68 47"
              fill="none"
              stroke={colors[1]}
              strokeWidth="3"
            />
          </>
        ) : (
          <>
            <Circle
              cx="50"
              cy="50"
              r="27"
              fill="none"
              stroke={colors[1]}
              strokeWidth="5"
            />
            <Path d="M18 72L80 24" stroke={colors[2]} strokeWidth="5" />
            <Circle cx="78" cy="26" r="10" fill={colors[1]} />
            <Circle cx="50" cy="50" r="9" fill={colors[2]} />
          </>
        )}
      </Svg>
    </View>
  );
}
