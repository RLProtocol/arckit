// Metro only watches the app folder by default; the shared deployments file lives one level up in the repo.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, "..", "deployments")];

// @noble/hashes maps its crypto import to ./crypto.js through the "browser" field, which its "exports" map does not
// list, so Metro warns and falls back to the file. Resolve it to that file directly: same module, no warning.
const nobleCrypto = path.resolve(__dirname, "node_modules/@noble/hashes/crypto.js");
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "@noble/hashes/crypto" || moduleName === "@noble/hashes/crypto.js") return { type: "sourceFile", filePath: nobleCrypto };
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
