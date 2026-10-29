const { createHash } = require("node:crypto");

// Public compilation settings only. Provider keys and account data must never
// affect or appear in the client build's cache configuration.
const publicBuildNames = Object.freeze([
  "EXPO_PUBLIC_REGION",
  "EXPO_PUBLIC_API_URL_INTL",
  "EXPO_PUBLIC_API_URL_CN",
  "EXPO_PUBLIC_COMMUNITY_DISCOVERY_URL",
  "EXPO_PUBLIC_DEV_TOOLS",
  "NODE_ENV",
  "EXPO_NO_DOTENV",
  "EXPO_NO_CLIENT_ENV_VARS",
]);

function publicBuildCacheKey(env) {
  return createHash("sha256")
    .update(
      JSON.stringify(publicBuildNames.map((name) => [name, env[name] ?? null])),
    )
    .digest("hex");
}

module.exports = { publicBuildNames, publicBuildCacheKey };
