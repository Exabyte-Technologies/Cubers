const { getDefaultConfig } = require("expo/metro-config");
const { publicBuildCacheKey } = require("./config/public-build-cache");

const config = getDefaultConfig(__dirname);
// CI export:embed retains Metro's transform cache even with --reset-cache.
// Keep transforms compiled for different public service settings separate.
config.cacheVersion = `${config.cacheVersion}:cubers-${publicBuildCacheKey(process.env)}`;

module.exports = config;
