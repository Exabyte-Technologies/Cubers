import React, { useState } from "react";
import { View, ScrollView, Platform } from "react-native";
import { Button } from "./ui";
import { moveGridRows } from "./move-grid";
export function MoveGrid({
  moves,
  disabled = false,
  onMove,
}: {
  moves: readonly string[];
  disabled?: boolean;
  onMove: (move: string) => void;
}) {
  const [width, setWidth] = useState(302);
  const tableWidth = Math.max(269, Math.min(width - 8, 660));
  const columnGap = Math.max(1, Math.min(6, (tableWidth - 6 * 44) / 5));
  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ width: "100%", minWidth: 0 }}
    >
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          padding: 4,
        }}
      >
        <View
          {...(Platform.OS === "web"
            ? ({ dataSet: { hum: "move-grid" } } as any)
            : {})}
          style={{ width: tableWidth, gap: 8 }}
        >
          {moveGridRows(moves).map((row, index) => (
            <View key={index} style={{ flexDirection: "row", gap: columnGap }}>
              {Array.from({ length: 6 }, (_, col) => (
                <View key={col} style={{ flex: 1, minWidth: 44 }}>
                  {row[col] && (
                    <Button
                      small
                      compact
                      kind="secondary"
                      label={row[col]}
                      disabled={disabled}
                      onPress={() => onMove(row[col])}
                    />
                  )}
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
