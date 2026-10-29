import {
  createDevelopmentRuntime,
  defaultDevelopmentSettings,
} from "./runtime";

// Static public build setting; never read from account data or device storage.
export const DEVELOPMENT_BUILD = process.env.EXPO_PUBLIC_DEV_TOOLS === "true";
export const bundledEndpoints = {
  discovery: process.env.EXPO_PUBLIC_COMMUNITY_DISCOVERY_URL,
  INTL: process.env.EXPO_PUBLIC_API_URL_INTL,
  CN: process.env.EXPO_PUBLIC_API_URL_CN,
};
export const developmentRuntime = createDevelopmentRuntime(
  DEVELOPMENT_BUILD,
  defaultDevelopmentSettings(DEVELOPMENT_BUILD ? bundledEndpoints : {}),
);
export function appEndpoints() {
  return DEVELOPMENT_BUILD
    ? developmentRuntime.settings.endpoints
    : bundledEndpoints;
}
