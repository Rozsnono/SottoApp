/** Idő-formázók az üzenet-infóhoz és az aktivitás-jelzéshez (a nyelv az i18n-ből jön). */
import i18n from "@/i18n";

/** Mai időpont: ÓÓ:PP; régebbi: dátum + ÓÓ:PP. */
export function clock(ts: number): string {
  const d = new Date(ts);
  const loc = i18n.language === "hu" ? "hu-HU" : "en-GB";
  const time = d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === new Date().toDateString()) return time;
  return `${d.toLocaleDateString(loc, { month: "short", day: "numeric" })} ${time}`;
}

/** „Aktív most” / „Aktív N perce|órája”; 24 óránál régebbi aktivitást nem mutatunk (üres szöveg). */
export function activityText(a: { online: boolean; at: number } | undefined): string {
  if (!a) return "";
  if (a.online) return i18n.t("activity.now");
  const min = Math.max(1, Math.round((Date.now() - a.at) / 60_000));
  if (min < 60) return i18n.t("activity.min", { n: min });
  const h = Math.round(min / 60);
  return h < 24 ? i18n.t("activity.hour", { n: h }) : "";
}
