import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { PracticeReminders, type ReminderPreference } from "./controller";
const prefix = "cubers-practice-",
  key = "cubers-practice-reminder",
  channel = "cubers-practice";
export const practiceReminders = new PracticeReminders({
  async read() {
    try {
      return JSON.parse(
        (await SecureStore.getItemAsync(key)) || "null",
      ) as ReminderPreference | null;
    } catch {
      return null;
    }
  },
  async save(value) {
    if (value) await SecureStore.setItemAsync(key, JSON.stringify(value));
    else await SecureStore.deleteItemAsync(key);
  },
  async allowed(prompt) {
    if (Platform.OS === "android")
      await Notifications.setNotificationChannelAsync(channel, {
        name: "Cubers practice",
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: null,
        enableVibrate: false,
      });
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && prompt)
      permission = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowSound: false, allowBadge: false },
      });
    return permission.granted;
  },
  async clearOwned() {
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      pending
        .filter((p) => p.identifier.startsWith(prefix))
        .map((p) =>
          Notifications.cancelScheduledNotificationAsync(p.identifier),
        ),
    );
    const displayed = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(
      displayed
        .filter((p) => p.request.identifier.startsWith(prefix))
        .map((p) =>
          Notifications.dismissNotificationAsync(p.request.identifier),
        ),
    );
  },
  async schedule(date, locale, index) {
    await Notifications.scheduleNotificationAsync({
      identifier: prefix + index,
      content: {
        title: "Cubers",
        body:
          locale === "zh"
            ? "想转一会儿魔方吗？有空时再练习也可以。"
            : "A little cubing practice? Come back whenever it suits you.",
        sound: false,
        data: { kind: "practice-reminder" },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date,
        channelId: channel,
      },
    });
  },
});
