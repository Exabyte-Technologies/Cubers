import React, { createContext, useContext, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  useColorScheme,
  Platform,
} from "react-native";
import Svg, {
  Polygon,
  Circle,
  Line,
  Defs,
  Pattern,
  Rect,
  Path,
} from "react-native-svg";
import { useApp } from "./state";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Link } from "expo-router";
import {
  lightPalette,
  darkPalette,
  fonts,
  space,
  radii,
  brandPalette,
} from "./design/tokens";
export const palette = lightPalette;
export function useTheme() {
  const dark = useColorScheme() === "dark";
  return { ...(dark ? darkPalette : lightPalette), dark };
}
const web = (value: Record<string, string>) =>
  Platform.OS === "web" ? ({ dataSet: value } as any) : {};
const Surface = createContext(false);
export function CheckboxMark({ checked }: { checked: boolean }) {
  const c = useTheme();
  return (
    <Svg width={22} height={22} viewBox="0 0 22 22" aria-hidden={true}>
      <Rect
        x={1}
        y={1}
        width={20}
        height={20}
        rx={5}
        fill={checked ? c.accent : c.paper}
        stroke={checked ? c.onAccent : c.muted}
        strokeWidth={1.5}
      />
      {checked && (
        <Path
          d="m5.5 11 3.5 3.5 7.5-8"
          fill="none"
          stroke={c.onAccent}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </Svg>
  );
}
function Grain() {
  const c = useTheme();
  return (
    <Svg
      pointerEvents="none"
      aria-hidden={true}
      width="100%"
      height="100%"
      style={StyleSheet.absoluteFill}
    >
      <Defs>
        <Pattern
          id="hum-paper-fibre"
          width={72}
          height={72}
          patternUnits="userSpaceOnUse"
        >
          <Circle cx={7} cy={11} r={0.45} fill={c.ink} opacity={0.04} />
          <Circle cx={43} cy={22} r={0.55} fill={c.ink} opacity={0.035} />
          <Circle cx={20} cy={51} r={0.5} fill={c.ink} opacity={0.04} />
          <Circle cx={61} cy={62} r={0.5} fill={c.ink} opacity={0.03} />
          <Path
            d="M14 27l3 1M51 44l4-1M30 67l2 1"
            stroke={c.ink}
            strokeWidth={0.4}
            opacity={0.03}
          />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#hum-paper-fibre)" />
    </Svg>
  );
}
export function Logo({ size = 42 }: { size?: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      accessibilityLabel="Cubers logo"
    >
      <Line
        x1="26"
        y1="59"
        x2="76"
        y2="27"
        stroke={brandPalette.green}
        strokeWidth="7"
      />
      <Circle cx="77" cy="25" r="10" fill={brandPalette.sun} />
      <Polygon points="48,17 80,35 48,54 16,35" fill={brandPalette.top} />
      <Polygon points="16,35 48,54 48,91 16,72" fill={brandPalette.left} />
      <Polygon points="48,54 80,35 80,72 48,91" fill={brandPalette.right} />
      <Line
        x1="32"
        y1="44"
        x2="32"
        y2="81"
        stroke={brandPalette.grid}
        strokeWidth="2"
      />
      <Line
        x1="64"
        y1="44"
        x2="64"
        y2="81"
        stroke={brandPalette.grid}
        strokeWidth="2"
      />
      <Line
        x1="16"
        y1="54"
        x2="48"
        y2="72"
        stroke={brandPalette.grid}
        strokeWidth="2"
      />
      <Line
        x1="48"
        y1="72"
        x2="80"
        y2="54"
        stroke={brandPalette.grid}
        strokeWidth="2"
      />
    </Svg>
  );
}
export function Txt({
  children,
  style,
  small = false,
  ...props
}: React.ComponentProps<typeof Text> & { small?: boolean }) {
  const c = useTheme(),
    flattened = StyleSheet.flatten(style),
    strong = Number(flattened?.fontWeight || 500) >= 600;
  return (
    <Text
      {...props}
      style={[
        {
          color: c.ink,
          fontSize: small ? 14 : 17,
          lineHeight: small ? 22 : 27,
          fontFamily: strong ? fonts.strong : fonts.body,
        },
        style,
        {
          fontFamily:
            flattened?.fontFamily || (strong ? fonts.strong : fonts.body),
          fontWeight: "400",
        },
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
    <View
      {...web({ hum: "heading" })}
      style={{ gap: space.xs, marginBottom: space.xs, minWidth: 0 }}
    >
      <Txt
        accessibilityRole="header"
        style={{
          fontSize: 32,
          lineHeight: 39,
          fontWeight: "600",
          letterSpacing: -0.7,
        }}
      >
        {children}
      </Txt>
      {eyebrow && (
        <Txt small style={{ color: c.muted, maxWidth: 620 }}>
          {eyebrow}
        </Txt>
      )}
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
  const c = useTheme(),
    nested = useContext(Surface);
  return (
    <Surface.Provider value={true}>
      <View
        {...web({ hum: nested ? "section" : "card" })}
        style={[
          {
            backgroundColor: c.paper,
            borderColor: c.line,
            borderWidth: 1,
            borderBottomWidth: 3,
            borderRadius: radii.card,
            padding: space.lg,
            gap: space.md,
            minWidth: 0,
          },
          style,
          nested && {
            backgroundColor: "transparent",
            borderWidth: 0,
            borderBottomWidth: 0,
            borderRadius: 0,
            padding: 0,
            shadowOpacity: 0,
          },
        ]}
      >
        {children}
      </View>
    </Surface.Provider>
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
  const c = useTheme(),
    [focus, setFocus] = useState(false);
  return (
    <Pressable
      {...web({ hum: "button", kind })}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={({ pressed }) => ({
        backgroundColor:
          kind === "primary"
            ? c.accent
            : kind === "danger"
              ? c.errorSurface
              : c.paper,
        borderRadius: radii.stock,
        borderWidth: 1,
        borderColor: focus ? c.blue : kind === "danger" ? c.red : c.line,
        borderBottomWidth: 5,
        borderBottomColor:
          kind === "primary"
            ? c.buttonEdge
            : kind === "danger"
              ? c.red
              : c.edge,
        paddingHorizontal: small ? space.md : space.lg,
        paddingVertical: space.sm,
        minHeight: small ? 48 : 54,
        maxWidth: "100%",
        opacity: disabled ? 0.55 : 1,
        alignItems: "center",
        justifyContent: "center",
        transform: [{ translateY: pressed && !disabled ? 3 : 0 }],
      })}
    >
      <Txt
        {...web({ hum: "button-label" })}
        style={{
          color:
            kind === "primary" ? c.onAccent : kind === "danger" ? c.red : c.ink,
          fontWeight: "600",
          fontSize: small ? 14 : 16,
          lineHeight: 22,
          textAlign: "center",
        }}
      >
        {label}
      </Txt>
    </Pressable>
  );
}
export function Field({
  label,
  ...props
}: React.ComponentProps<typeof TextInput> & { label: string }) {
  const c = useTheme(),
    [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: space.xs, minWidth: 0 }}>
      <Txt small style={{ fontWeight: "600" }}>
        {label}
      </Txt>
      <TextInput
        {...web({ hum: "field" })}
        accessibilityLabel={label}
        placeholderTextColor={c.muted}
        {...props}
        onFocus={(e) => {
          setFocus(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocus(false);
          props.onBlur?.(e);
        }}
        style={[
          {
            backgroundColor: c.field,
            color: c.ink,
            borderColor: focus ? c.blue : c.muted,
            borderWidth: 1,
            borderRadius: radii.field,
            paddingHorizontal: space.md,
            paddingVertical: space.sm,
            fontSize: 16,
            lineHeight: 24,
            fontFamily: fonts.body,
            minHeight: 52,
            minWidth: 0,
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
          gap: space.sm,
          flexWrap: "wrap",
          minWidth: 0,
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
      {...web({ hum: "chip" })}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: radii.pill,
        paddingHorizontal: space.md,
        paddingVertical: space.sm,
        minHeight: 44,
        opacity: disabled ? 0.55 : 1,
        backgroundColor: selected ? c.ink : c.paper,
        borderWidth: 1,
        borderColor: selected ? c.ink : c.edge,
        transform: [{ translateY: pressed ? 1 : 0 }],
        maxWidth: "100%",
      })}
    >
      <Txt
        small
        style={{ fontWeight: "600", color: selected ? c.onInk : c.ink }}
      >
        {label}
      </Txt>
    </Pressable>
  );
}
export function Screen({ children }: { children: React.ReactNode }) {
  const c = useTheme(),
    insets = useSafeAreaInsets(),
    { offline, t, token } = useApp();
  return (
    <View
      {...web({ hum: "app", mode: c.dark ? "dark" : "light" })}
      style={{ flex: 1, backgroundColor: c.bg }}
    >
      <Grain />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: space.lg,
          paddingTop: Math.max(space.lg, insets.top),
          paddingBottom: Math.max(space.xl, insets.bottom + space.lg),
          gap: space.lg,
          width: "100%",
          maxWidth: 1000,
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
          {...web({ hum: "topbar" })}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingBottom: space.md,
            borderBottomWidth: 1,
            borderColor: c.line,
            marginBottom: space.xs,
          }}
        >
          <Link href={token ? "/(tabs)" : "/"} asChild>
            <Pressable
              {...web({ hum: "brand" })}
              accessibilityRole="link"
              accessibilityLabel={t("Cubers home", "Cubers 首页")}
            >
              <Row>
                <Logo size={40} />
                <Txt
                  style={{
                    fontSize: 27,
                    lineHeight: 34,
                    fontWeight: "600",
                    letterSpacing: -0.8,
                  }}
                >
                  cubers
                </Txt>
              </Row>
            </Pressable>
          </Link>
          <LocaleButton />
        </View>
        {children}
        <Link
          href="https://db-ip.com"
          {...web({ hum: "footer-link" })}
          style={{
            color: c.muted,
            fontFamily: fonts.body,
            fontSize: 12,
            paddingVertical: space.md,
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
    </View>
  );
}
export function LocaleButton() {
  const { locale, setLocale } = useApp(),
    c = useTheme();
  return (
    <Pressable
      {...web({ hum: "locale" })}
      accessibilityRole="button"
      accessibilityLabel="Change language"
      onPress={() => setLocale(locale === "en" ? "zh" : "en")}
      style={({ pressed }) => ({
        padding: space.sm,
        minHeight: 44,
        borderRadius: radii.stock,
        borderWidth: 1,
        borderColor: c.edge,
        backgroundColor: pressed ? c.field : c.paper,
      })}
    >
      <Txt small style={{ fontWeight: "600" }}>
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
      {...web({ hum: "notice", tone: error ? "error" : "info" })}
      accessibilityRole="alert"
      style={{
        padding: space.md,
        borderRadius: radii.stock,
        backgroundColor: error ? c.errorSurface : c.softBlue,
        borderWidth: 1,
        borderColor: error ? c.red : c.blue,
      }}
    >
      <Txt small style={{ color: error ? c.red : c.ink }}>
        {text}
      </Txt>
    </View>
  );
}
export function Busy() {
  const c = useTheme();
  return (
    <ActivityIndicator
      accessibilityLabel="Loading"
      style={{ padding: space.lg }}
      color={c.blue}
    />
  );
}
export function Empty({ title, body }: { title: string; body: string }) {
  const c = useTheme();
  return (
    <Card style={{ paddingVertical: space.xl, alignItems: "center" }}>
      <Logo size={48} />
      <Txt
        style={{
          fontSize: 22,
          lineHeight: 29,
          fontWeight: "600",
          textAlign: "center",
        }}
      >
        {title}
      </Txt>
      <Txt small style={{ color: c.muted, textAlign: "center", maxWidth: 400 }}>
        {body}
      </Txt>
    </Card>
  );
}
