const {
  withAndroidManifest,
  withEntitlementsPlist,
} = require("@expo/config-plugins");
// This app uses on-device reminders only. Prevent messaging/analytics automatic
// registration if a future build accidentally supplies Firebase configuration.
module.exports = function withLocalReminders(config) {
  config = withAndroidManifest(config, (mod) => {
    const app = mod.modResults.manifest.application[0];
    const names = [
      "firebase_messaging_auto_init_enabled",
      "firebase_analytics_collection_enabled",
      "firebase_messaging_installation_id_enabled",
    ];
    app["meta-data"] = (app["meta-data"] || []).filter(
      (entry) => !names.includes(entry.$["android:name"]),
    );
    for (const name of names)
      app["meta-data"].push({
        $: { "android:name": name, "android:value": "false" },
      });
    return mod;
  });
  return withEntitlementsPlist(config, (mod) => {
    delete mod.modResults["aps-environment"];
    return mod;
  });
};
