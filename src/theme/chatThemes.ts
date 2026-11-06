/**
 * Beszélgetés-témák (Messenger-szerűen): mindkét félnél ugyanaz látszik, a váltás titkosított `event` üzenetként
 * megy át (a szerver nem látja). `out`: saját buborék háttere (fehér szöveggel ≥4.5:1 kontraszt), `bg*`: a chat háttere.
 */
export interface ChatTheme {
  key: string;
  out: string;
  bgLight: string;
  bgDark: string;
}

export const CHAT_THEMES: ChatTheme[] = [
  { key: "default", out: "", bgLight: "", bgDark: "" }, // az app alapértelmezett színei
  { key: "ocean", out: "#0B6BCB", bgLight: "#EAF3FC", bgDark: "#0C1826" },
  { key: "sunset", out: "#C2410C", bgLight: "#FCEFE6", bgDark: "#241309" },
  { key: "forest", out: "#1F7A4D", bgLight: "#E8F5EE", bgDark: "#0D1E15" },
  { key: "grape", out: "#7E3FD0", bgLight: "#F1E9FB", bgDark: "#1A1128" },
  { key: "rose", out: "#C0265D", bgLight: "#FBE8EF", bgDark: "#25101A" },
  { key: "teal", out: "#0F766E", bgLight: "#E4F4F2", bgDark: "#0A1D1B" },
  { key: "slate", out: "#475569", bgLight: "#EDF0F4", bgDark: "#141A22" },
];

export const themeByKey = (key: string | null | undefined): ChatTheme => CHAT_THEMES.find((t) => t.key === key) ?? CHAT_THEMES[0];
