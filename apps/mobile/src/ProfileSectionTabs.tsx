import React, { useRef } from "react";
import { Platform, Pressable, ScrollView } from "react-native";
import { accentColors } from "./design/tokens";
import { Txt, useTheme } from "./ui";
export function ProfileSectionTabs<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  const c = useTheme(),
    accent = accentColors(c, "blue"),
    refs = useRef<any[]>([]);
  return (
    <ScrollView
      horizontal
      accessibilityRole="tablist"
      accessibilityLabel={label}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 10, paddingVertical: 3 }}
      style={{ flexGrow: 0 }}
    >
      {items.map((item, index) => (
        <Pressable
          key={item.value}
          ref={(ref) => {
            refs.current[index] = ref;
          }}
          accessibilityRole="tab"
          accessibilityLabel={item.label}
          accessibilityState={{ selected: value === item.value }}
          onPress={() => onChange(item.value)}
          {...(Platform.OS === "web"
            ? ({
                "aria-selected": value === item.value,
                tabIndex: value === item.value ? 0 : -1,
                onKeyDown: (event: any) => {
                  let next: number | undefined;
                  if (event.key === "ArrowRight")
                    next = (index + 1) % items.length;
                  if (event.key === "ArrowLeft")
                    next = (index - 1 + items.length) % items.length;
                  if (event.key === "Home") next = 0;
                  if (event.key === "End") next = items.length - 1;
                  if (next === undefined) return;
                  event.preventDefault();
                  onChange(items[next].value);
                  refs.current[next]?.focus();
                },
              } as any)
            : {})}
          style={({ pressed }) => ({
            minHeight: 48,
            borderRadius: 16,
            paddingHorizontal: 17,
            paddingVertical: 12,
            justifyContent: "center",
            borderWidth: 1,
            borderColor: value === item.value ? accent.edge : c.edge,
            backgroundColor:
              value === item.value ? accent.fill : pressed ? c.field : c.paper,
          })}
        >
          <Txt
            small
            style={{
              fontWeight: "600",
              color: value === item.value ? accent.ink : c.ink,
            }}
          >
            {item.label}
          </Txt>
        </Pressable>
      ))}
    </ScrollView>
  );
}
