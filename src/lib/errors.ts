import { ApiError } from "./api";
import i18n from "@/i18n";

/** Felhasználónak szánt, érthető hibaüzenet. A technikai részlet logba megy, nem a UI-ra. */
export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case "NETWORK": return i18n.t("errors.network");
      case "RATE_LIMITED": return i18n.t("errors.rate");
      case "ACCOUNT_SUSPENDED": return i18n.t("errors.suspended");
      case "UNAUTHORIZED": return i18n.t("auth.wrongCreds");
      case "CONFLICT": return i18n.t("auth.usernameTaken");
      case "VALIDATION_ERROR": return `${e.message} (${e.code})`;
      default: return `${e.message || i18n.t("errors.generic")} (${e.code})`; // a kód segíti a hibakeresést
    }
  }
  console.warn("[error]", e instanceof Error ? e.message : e);
  return i18n.t("errors.generic");
}
