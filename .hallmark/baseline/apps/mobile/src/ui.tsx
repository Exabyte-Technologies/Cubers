import React from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  useColorScheme,
} from "react-native";
import Svg, { Polygon, Circle, Line } from "react-native-svg";
import { useApp } from "./state";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Link } from "expo-router";
export const palette = {
  bg: "#f7f5ef",
  paper: "#fffefa",
  ink: "#252b28",
  muted: "#657168",
  line: "#e3e6df",
  green: "#285c47",
  mint: "#dfeee4",
  yellow: "#f3d66c",
  lavender: "#e9e5f7",
  orange: "#f2af7a",
  red: "#b94339",
};
export function useTheme() {
  const dark = useColorScheme() === "dark";
  return dark
    ? {
        ...palette,
        bg: "#151b18",
        paper: "#202822",
        ink: "#f1f3e9",
        muted: "#b1beb2",
        line: "#3b463e",
        green: "#9fd5b4",
        mint: "#2d4334",
        lavender: "#373044",
        yellow: "#ddbd54",
      }
    : palette;
}
export function Logo({ size = 42 }: { size?: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      accessibilityLabel="Cubers logo"
    >
      <Line x1="26" y1="59" x2="76" y2="27" stroke="#285c47" strokeWidth="7" />
      <Circle cx="77" cy="25" r="10" fill="#f2b16c" />
      <Polygon points="48,17 80,35 48,54 16,35" fill="#f3d66c" />
      <Polygon points="16,35 48,54 48,91 16,72" fill="#71ad8b" />
      <Polygon points="48,54 80,35 80,72 48,91" fill="#8c83bf" />
      <Line x1="32" y1="44" x2="32" y2="81" stroke="#f7f5ef" strokeWidth="2" />
      <Line x1="64" y1="44" x2="64" y2="81" stroke="#f7f5ef" strokeWidth="2" />
      <Line x1="16" y1="54" x2="48" y2="72" stroke="#f7f5ef" strokeWidth="2" />
      <Line x1="48" y1="72" x2="80" y2="54" stroke="#f7f5ef" strokeWidth="2" />
    </Svg>
  );
}
export function Txt({
  children,
  style,
  small = false,
  ...props
}: React.ComponentProps<typeof Text> & { small?: boolean }) {
  const c = useTheme();
  return (
    <Text
      {...props}
      style={[
        {
          color: c.ink,
          fontSize: small ? 13 : 16,
          lineHeight: small ? 20 : 25,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
export function Heading({
  children,
  eyebrow,
}: {
  children: React.ReactNode;
  eyebrow?: string;
}) {
  const c = useTheme();
  return (
    <View style={{ gap: 8, marginBottom: 22 }}>
      {eyebrow && (
        <Txt
          small
          style={{
            color: c.green,
            fontWeight: "700",
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          {eyebrow}
        </Txt>
      )}
      <Txt
        accessibilityRole="header"
        style={{
          fontSize: 32,
          lineHeight: 39,
          fontWeight: "800",
          letterSpacing: -1,
        }}
      >
        {children}
      </Txt>
    </View>
  );
}
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: any;
}) {
  const c = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: c.paper,
          borderColor: c.line,
          borderWidth: 1,
          borderRadius: 22,
          padding: 22,
          gap: 12,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function Button({
  label,
  onPress,
  kind = "primary",
  disabled = false,
  small = false,
}: {
  label: string;
  onPress: () => void;
  kind?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  small?: boolean;
}) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor:
          kind === "primary" ? c.green : kind === "danger" ? "#b94339" : c.mint,
        borderRadius: small ? 12 : 16,
        paddingHorizontal: small ? 15 : 20,
        paddingVertical: small ? 11 : 15,
        minHeight: 44,
        opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
        alignItems: "center",
        justifyContent: "center",
      })}
    >
      <Txt
        style={{
          color: kind === "secondary" ? c.ink : useColor(kind, c),
          fontWeight: "700",
          fontSize: small ? 13 : 15,
        }}
      >
        {label}
      </Txt>
    </Pressable>
  );
}
function useColor(kind: string, c: ReturnType<typeof useTheme>) {
  return kind === "primary" && c.bg === "#151b18" ? "#15251a" : "#ffffff";
}
export function Field({
  label,
  ...props
}: React.ComponentProps<typeof TextInput> & { label: string }) {
  const c = useTheme();
  return (
    <View style={{ gap: 7 }}>
      <Txt small style={{ fontWeight: "600" }}>
        {label}
      </Txt>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.muted}
        {...props}
        style={[
          {
            borderColor: c.line,
            borderWidth: 1,
            backgroundColor: c.bg,
            color: c.ink,
            borderRadius: 12,
            padding: 14,
            minHeight: 48,
            fontSize: 16,
          },
          props.style,
        ]}
      />
    </View>
  );
}
export function Row({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: any;
}) {
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function Chip({
  label,
  selected,
  onPress,
  disabled = false,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        borderRadius: 50,
        paddingHorizontal: 16,
        paddingVertical: 11,
        minHeight: 44,
        opacity: disabled ? 0.5 : 1,
        backgroundColor: selected ? c.green : c.paper,
        borderWidth: 1,
        borderColor: selected ? c.green : c.line,
      }}
    >
      <Txt
        small
        style={{
          fontWeight: "600",
          color: selected ? (c.bg === "#151b18" ? "#15251a" : "white") : c.ink,
        }}
      >
        {label}
      </Txt>
    </Pressable>
  );
}
export function Screen({ children }: { children: React.ReactNode }) {
  const c = useTheme(),
    insets = useSafeAreaInsets(),
    { offline, t } = useApp();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{
        padding: 22,
        paddingTop: Math.max(22, insets.top),
        paddingBottom: Math.max(45, insets.bottom + 22),
        gap: 20,
        width: "100%",
        maxWidth: 900,
        alignSelf: "center",
      }}
      keyboardShouldPersistTaps="handled"
    >
      {offline && (
        <Notice
          text={t(
            "You are offline. Changes need a connection.",
            "当前离线，更改需要网络连接。",
          )}
        />
      )}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <Row>
          <Logo size={35} />
          <Txt style={{ fontSize: 25, fontWeight: "800", letterSpacing: -1 }}>
            cubers
          </Txt>
        </Row>
        <LocaleButton />
      </View>
      {children}
      <Link
        href="https://db-ip.com"
        style={{
          color: c.muted,
          fontSize: 12,
          paddingVertical: 12,
          textAlign: "center",
        }}
        accessibilityLabel={t(
          "IP Geolocation by DB-IP",
          "IP 地理位置数据由 DB-IP 提供",
        )}
      >
        {t("IP Geolocation by DB-IP", "IP 地理位置数据由 DB-IP 提供")}
      </Link>
    </ScrollView>
  );
}
export function LocaleButton() {
  const { locale, setLocale } = useApp();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Change language"
      onPress={() => setLocale(locale === "en" ? "zh" : "en")}
      style={{ padding: 12, minHeight: 44 }}
    >
      <Txt small style={{ fontWeight: "700" }}>
        {locale === "en" ? "中文" : "English"}
      </Txt>
    </Pressable>
  );
}
export function Notice({
  text,
  error = false,
}: {
  text: string;
  error?: boolean;
}) {
  const c = useTheme();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        padding: 15,
        borderRadius: 12,
        backgroundColor: error ? "#f8e4df" : c.mint,
      }}
    >
      <Txt small style={{ color: error ? "#8f3028" : c.ink }}>
        {text}
      </Txt>
    </View>
  );
}
export function Busy() {
  return (
    <ActivityIndicator
      accessibilityLabel="Loading"
      style={{ padding: 30 }}
      color="#438165"
    />
  );
}
export function Empty({ title, body }: { title: string; body: string }) {
  const c = useTheme();
  return (
    <Card style={{ paddingVertical: 35, alignItems: "center" }}>
      <Logo size={55} />
      <Txt style={{ fontSize: 20, fontWeight: "700", textAlign: "center" }}>
        {title}
      </Txt>
      <Txt small style={{ color: c.muted, textAlign: "center", maxWidth: 370 }}>
        {body}
      </Txt>
    </Card>
  );
}
