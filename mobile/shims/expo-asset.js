class Asset {
  constructor(props) {
    Object.assign(this, props);
  }

  static fromModule(moduleId) {
    const uri =
      typeof moduleId === "string"
        ? moduleId
        : typeof moduleId === "number"
          ? `asset:${moduleId}`
          : moduleId?.uri ?? moduleId?.localUri ?? moduleId?.default ?? null;

    return new Asset({
      uri,
      localUri: uri,
      width: moduleId?.width ?? null,
      height: moduleId?.height ?? null,
      downloadAsync: async () => Asset.fromModule(moduleId),
    });
  }
}

exports.Asset = Asset;
exports.default = { Asset };
