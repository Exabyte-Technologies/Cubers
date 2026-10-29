import React from "react";
import { View } from "react-native";
import { useApp } from "./state";
import { Notice, Button } from "./ui";

export function SessionRestoreNotice() {
  const { t, retrySessionRestore } = useApp();
  return (
    <View style={{ gap: 12 }}>
      <Notice
        error
        text={t(
          "Your saved sign-in could not be read. Unlock your device or reopen Cubers, then retry. Saved credentials have not been cleared.",
          "暂时无法读取已保存的登录信息。请解锁设备或重新打开 Cubers 后重试，原有登录信息未被清除。",
        )}
      />
      <Button
        label={t("Retry saved sign-in", "重试读取登录信息")}
        onPress={retrySessionRestore}
      />
    </View>
  );
}
