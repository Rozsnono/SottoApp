/** i18next (HU/EN). A nyelv a rendszerből indul, a felhasználó felülírhatja (secure-store nélkül is működik). */
/* eslint-disable import/no-named-as-default-member -- az i18next default példányát használjuk (hivatalos minta) */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import * as SecureStore from "expo-secure-store";
import { hu } from "./hu";
import { en } from "./en";

export type Lang = "hu" | "en";
const KEY = "sotto.lang";

export async function initI18n(): Promise<void> {
  let lang: Lang = Localization.getLocales()[0]?.languageCode === "hu" ? "hu" : "en";
  try {
    const saved = await SecureStore.getItemAsync(KEY);
    if (saved === "hu" || saved === "en") lang = saved;
  } catch {
    /* nincs mentett nyelv – a rendszer nyelve marad */
  }
  await i18n.use(initReactI18next).init({ resources: { hu: { translation: hu }, en: { translation: en } }, lng: lang, fallbackLng: "en", interpolation: { escapeValue: false }, returnNull: false });
}

export async function setLang(lang: Lang): Promise<void> {
  await i18n.changeLanguage(lang);
  try {
    await SecureStore.setItemAsync(KEY, lang);
  } catch (e) {
    console.warn("[i18n] nyelv mentése sikertelen", e instanceof Error ? e.message : e);
  }
}

export default i18n;
