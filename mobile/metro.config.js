const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Prefer Watchman for large trees; allow explicit opt-out if needed.
config.watcher = {
  ...config.watcher,
  useWatchman: process.env.EXPO_NO_WATCHMAN !== "1",
};

module.exports = config;
