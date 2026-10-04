// Metro only watches the app folder by default; the shared deployments file lives one level up in the repo.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, "..", "deployments")];
module.exports = config;
