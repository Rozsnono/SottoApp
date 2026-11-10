// Dinamikus Expo-konfig: az app.json-t egészíti ki.
// A google-services.json titok (gitignore-olt). EAS felhős buildnél a
// GOOGLE_SERVICES_JSON fájl-típusú EAS környezeti változó adja az útvonalát;
// helyi buildnél a ./google-services.json marad.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? config.android?.googleServicesFile,
  },
});
