export function guidedMoveText(
  move: string,
  locale: "en" | "zh",
  puzzle: string,
) {
  const names: Record<string, [string, string]> = {
    U: ["top", "顶"],
    D: ["bottom", "底"],
    R: ["right", "右"],
    L: ["left", "左"],
    F: ["front", "前"],
    B: ["back", "后"],
  };
  const [en, zh] = names[move[0].toUpperCase()] || [move[0], move[0]],
    prime = move.endsWith("'"),
    double = move.endsWith("2"),
    wide = move.includes("w");
  if (puzzle === "pyraminx")
    return locale === "en"
      ? `Turn ${move[0]} ${prime ? "counterclockwise" : "clockwise"} by 120°, looking straight at that vertex. ${move[0] === move[0].toLowerCase() ? "Move only its tiny tip." : "Move the large vertex layer."}`
      : `正对 ${move[0]} 顶点观察，${prime ? "逆时针" : "顺时针"}转动 120°。${move[0] === move[0].toLowerCase() ? "只转最小尖角。" : "转动整个较大顶点层。"}`;
  return locale === "en"
    ? `Turn the ${en} ${wide ? "two layers" : "face"} ${double ? "180°" : prime ? "90° counterclockwise" : "90° clockwise"}, looking directly at that face.`
    : `正对${zh}面观察，将${wide ? "该侧两层" : "这一面"}${double ? "转动 180°" : prime ? "逆时针转动 90°" : "顺时针转动 90°"}。`;
}
