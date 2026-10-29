// Hallmark Hum: native sRGB equivalents of the declared OKLCH theme.
export const lightPalette = {
  bg: "#f7f5ec",
  paper: "#fcfbf6",
  ink: "#12161c",
  muted: "#565b63",
  line: "#d7d4c9",
  green: "#0064be",
  mint: "#70e093",
  yellow: "#f7d21a",
  lavender: "#c6dfef",
  orange: "#ffe3e1",
  red: "#be2323",
  accent: "#f7d21a",
  onAccent: "#12161c",
  onInk: "#f7f5ec",
  edge: "#d2c6aa",
  blue: "#0064be",
  coral: "#ff5e63",
  mintDeep: "#00713e",
  softBlue: "#c6dfef",
  softCoral: "#ffe3e1",
  buttonEdge: "#c9a000",
  coralEdge: "#b94149",
  sand: "#efc185",
  sandEdge: "#966327",
  softSand: "#ffe4bf",
  softPear: "#fff0a4",
  field: "#f0ede0",
  shadow: "#12161c",
  errorSurface: "#ffe3e1",
};
export const darkPalette = {
  bg: "#0c1015",
  paper: "#191d24",
  ink: "#f1efe6",
  muted: "#b0aea4",
  line: "#373e47",
  green: "#70b3f7",
  mint: "#1b3824",
  yellow: "#f7d21a",
  lavender: "#1c313d",
  orange: "#472928",
  red: "#ff9286",
  accent: "#f7d21a",
  onAccent: "#12161c",
  onInk: "#0c1015",
  edge: "#414b58",
  blue: "#70b3f7",
  coral: "#ff918e",
  mintDeep: "#7fd497",
  softBlue: "#1c313d",
  softCoral: "#472928",
  buttonEdge: "#c9a000",
  coralEdge: "#ba6261",
  sand: "#efc185",
  sandEdge: "#ac804b",
  softSand: "#453427",
  softPear: "#39351b",
  field: "#12161c",
  shadow: "#12161c",
  errorSurface: "#472928",
};
export const fonts = {
  body: "ChillaxMedium",
  strong: "ChillaxSemibold",
  code: "monospace",
} as const;
export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 40,
  xxl: 64,
} as const;
export const radii = { card: 24, stock: 16, field: 14, pill: 999 } as const;
export const brandPalette = {
  green: "#285c47",
  sun: "#f2b16c",
  top: "#f3d66c",
  left: "#71ad8b",
  right: "#8c83bf",
  grid: "#f7f5ef",
} as const;
export const avatarPalette = {
  mint: ["#dfeee4", "#285c47", "#71ad8b"],
  sunset: ["#fff0d7", "#814000", "#d98627"],
  indigo: ["#e9e5f7", "#483e82", "#9183c5"],
  rose: ["#fbe4e7", "#8c324b", "#cf778e"],
} as const;
export const puzzleRenderPalette = {
  clear: "#000000",
  ambient: "#ffffff",
  cameraBorder: "#98a293",
  cameraInk: "#19291f",
  scanError: "#a12e28",
  caseBorder: "#283b31",
  caseInk: "#0b1811",
  light: "#fff9e8",
  plastic: "#26342d",
  cubeOutline: "#89978b",
  triangleOutline: "#57685d",
  netInk: "#17271d",
  cameraFrame: "#f8faf9",
  scanAligned: "#26d779",
  scanVeil: "rgba(245,242,233,0.76)",
  scanVeilDark: "rgba(11,18,26,0.80)",
  mutedInk: "#52655a",
} as const;

// Accents follow the task, never the item index. Neutral controls stay paper.
export type AccentTone = "pear" | "mint" | "blue" | "coral" | "sand";
export function accentColors(c: typeof lightPalette, tone: AccentTone) {
  switch (tone) {
    case "sand":
      return {
        fill: c.sand,
        ink: c.onAccent,
        edge: c.sandEdge,
        surface: c.softSand,
      };
    case "mint":
      return { fill: c.mint, ink: c.ink, edge: c.mintDeep, surface: c.mint };
    case "blue":
      return {
        fill: c.softBlue,
        ink: c.ink,
        edge: c.blue,
        surface: c.softBlue,
      };
    case "coral":
      return {
        fill: c.coral,
        ink: c.onAccent,
        edge: c.coralEdge,
        surface: c.softCoral,
      };
    default:
      return {
        fill: c.accent,
        ink: c.onAccent,
        edge: c.buttonEdge,
        surface: c.softPear,
      };
  }
}
export const sectionAccents = {
  index: "blue",
  learn: "mint",
  play: "coral",
  profile: "blue",
} as const satisfies Record<string, AccentTone>;
