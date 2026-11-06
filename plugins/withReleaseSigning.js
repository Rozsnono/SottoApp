/**
 * Release aláírás környezeti változókból (a keystore és a jelszavak SOHA nem kerülnek a repóba):
 * SOTTO_KEYSTORE_PATH, SOTTO_KEYSTORE_PASSWORD, SOTTO_KEY_ALIAS, SOTTO_KEY_PASSWORD.
 * Ha nincsenek megadva, a build a debug aláírással fut (a prebuild alapértelmezése).
 */
const { withAppBuildGradle } = require("expo/config-plugins");

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let g = cfg.modResults.contents;
    if (g.includes("SOTTO_KEYSTORE_PATH")) return cfg;
    const block = `
        release {
            if (System.getenv("SOTTO_KEYSTORE_PATH")) {
                storeFile file(System.getenv("SOTTO_KEYSTORE_PATH"))
                storePassword System.getenv("SOTTO_KEYSTORE_PASSWORD")
                keyAlias System.getenv("SOTTO_KEY_ALIAS")
                keyPassword System.getenv("SOTTO_KEY_PASSWORD")
            }
        }`;
    g = g.replace(/signingConfigs\s*\{/, (m) => m + block);
    g = g.replace(/(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/, (m, pre) => `${pre}signingConfig System.getenv("SOTTO_KEYSTORE_PATH") ? signingConfigs.release : signingConfigs.debug`);
    cfg.modResults.contents = g;
    return cfg;
  });
};
