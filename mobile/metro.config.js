const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.watchFolders = [path.join(__dirname, "node_modules")];
config.resolver.unstable_enablePackageExports = false;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "expo-router" || moduleName.startsWith("expo-router/")) {
    try {
      const resolvedPath = require.resolve(moduleName, {
        paths: [path.dirname(context.originModulePath), __dirname],
      });
      const extension = path.extname(resolvedPath).slice(1);
      const sourceExts = new Set(context.sourceExts);

      if (sourceExts.has(extension)) {
        return {
          type: "sourceFile",
          filePath: resolvedPath,
        };
      }

      return {
        type: "assetFiles",
        filePaths: [resolvedPath],
      };
    } catch (error) {
      console.warn(`expo-router resolver fallback failed for ${moduleName}: ${error.message}`);
    }
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
