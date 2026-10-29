import React from "react";
import Svg, { Circle, Path, Rect } from "react-native-svg";
export function NavGlyph({
  name,
  color,
  size = 24,
}: {
  name: string;
  color: string;
  size?: number;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={true}
    >
      {name === "index" ? (
        <>
          <Circle cx={12} cy={12} r={9} />
          <Path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8 4.8-2.2Z" />
        </>
      ) : name === "learn" ? (
        <>
          <Path d="M3 5.5c3-1 6-1 9 1 3-2 6-2 9-1V20c-3-1-6-1-9 1-3-2-6-2-9-1V5.5Z M12 6.5V21" />
          <Path d="M6 9h3M6 12h3M15 9h3M15 12h3" />
        </>
      ) : name === "play" ? (
        <>
          <Path d="M7 5h10c2 0 3 2 3.5 4l1 7c.5 3-2.5 4-4 2l-2-2h-7l-2 2c-1.5 2-4.5 1-4-2l1-7C4 7 5 5 7 5Z" />
          <Path d="M7 9v5M4.5 11.5h5" />
          <Circle cx={16} cy={10} r={0.6} />
          <Circle cx={18} cy={13} r={0.6} />
        </>
      ) : (
        <>
          <Circle cx={12} cy={8} r={4} />
          <Path d="M4 21v-2a8 8 0 0 1 16 0v2" />
        </>
      )}
    </Svg>
  );
}
