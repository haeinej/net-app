const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
// Watchman during `expo config --introspect` (EAS local prep) can hang on large/monorepo trees.
const useWatchman =
  process.env.CI !== "true" && process.env.EXPO_NO_WATCHMAN !== "1";
config.resolver.useWatchman = useWatchman;

module.exports = config;
