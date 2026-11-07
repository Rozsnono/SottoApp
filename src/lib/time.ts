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

/** Napválasztó felirat: Ma / Tegnap / dátum (az év csak más évnél). */
export function dayLabel(ts: number): string {
  const d = new Date(ts);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(new Date()) - day(d)) / 86_400_000);
  if (diff === 0) return i18n.t("day.today");
  if (diff === 1) return i18n.t("day.yesterday");
  const loc = i18n.language === "hu" ? "hu-HU" : "en-GB";
  return d.toLocaleDateString(loc, { year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric", month: "long", day: "numeric" });
}

/** Két időbélyeg különböző naptári napra esik-e. */
export const differentDay = (a: number, b: number): boolean => new Date(a).toDateString() !== new Date(b).toDateString();

/** „Aktív most” / „Aktív N perce|órája”; 24 óránál régebbi aktivitást nem mutatunk (üres szöveg). */
export function activityText(a: { online: boolean; at: number } | undefined): string {
  if (!a) return "";
  if (a.online) return i18n.t("activity.now");
  const min = Math.max(1, Math.round((Date.now() - a.at) / 60_000));
  if (min < 60) return i18n.t("activity.min", { n: min });
  const h = Math.round(min / 60);
  return h < 24 ? i18n.t("activity.hour", { n: h }) : "";
}
