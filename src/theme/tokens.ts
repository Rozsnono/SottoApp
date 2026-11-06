/** Dizájn tokenek – forrás: docs/design/tokens.json (WCAG AA ellenőrizve). */
export const colors = {
  light: { bg: "#FAF8F4", surface: "#FFFFFF", surfaceAlt: "#F1EEE8", border: "#E4DFD6", text: "#16181D", textMuted: "#5B6070", accent: "#4A4FD8", onAccent: "#FFFFFF", accentSoft: "#E8E9FB", bubbleOut: "#4A4FD8", onBubbleOut: "#FFFFFF", bubbleIn: "#ECE8E0", onBubbleIn: "#16181D", danger: "#C62F36", success: "#17795A", warning: "#8A5A00", overlay: "rgba(14,16,21,0.45)" },
  dark: { bg: "#0E1015", surface: "#171A21", surfaceAlt: "#1E222B", border: "#2A2F3B", text: "#ECEEF3", textMuted: "#9AA0B1", accent: "#8F94FF", onAccent: "#0E1015", accentSoft: "#23264A", bubbleOut: "#5A5FE8", onBubbleOut: "#FFFFFF", bubbleIn: "#232733", onBubbleIn: "#ECEEF3", danger: "#FF6B72", success: "#3DD6A0", warning: "#F2B84B", overlay: "rgba(0,0,0,0.6)" },
} as const;
export type Palette = { [K in keyof (typeof colors)["light"]]: string };

export const contactColors = {
  light: { indigo: "#E3E4FA", teal: "#D7F0EC", green: "#DDF0D9", amber: "#F6E8C8", rose: "#F8DDE2", violet: "#EBDDF7", sky: "#D8EAF8", stone: "#E6E1D8" },
  dark: { indigo: "#2A2D55", teal: "#17403B", green: "#21401F", amber: "#4A3A12", rose: "#4F2530", violet: "#3E2A55", sky: "#1D3A52", stone: "#2E2B26" },
  dot: { indigo: "#4A4FD8", teal: "#14877A", green: "#3C8F2F", amber: "#C98A00", rose: "#D13F5E", violet: "#8A4FD0", sky: "#2F7FC1", stone: "#7A7365" },
} as const;
export type ContactColor = keyof typeof contactColors.dot;
export const CONTACT_COLOR_KEYS = Object.keys(contactColors.dot) as ContactColor[];

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 14: 56 } as const;
export const radius = { sm: 8, md: 12, lg: 16, bubble: 20, bubbleTail: 6, full: 999 } as const;
export const size = { touchMin: 44, iconSm: 18, icon: 22, iconLg: 28, avatar: 44, inputHeight: 52, buttonHeight: 52 } as const;
export const motion = { instant: 80, fast: 140, base: 220, slow: 360 } as const;
export const type = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: "700" as const },
  h1: { fontSize: 24, lineHeight: 30, fontWeight: "700" as const },
  h2: { fontSize: 20, lineHeight: 26, fontWeight: "600" as const },
  title: { fontSize: 17, lineHeight: 22, fontWeight: "600" as const },
  body: { fontSize: 16, lineHeight: 22, fontWeight: "400" as const },
  bodySm: { fontSize: 14, lineHeight: 20, fontWeight: "400" as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "500" as const },
  mono: { fontSize: 18, lineHeight: 26, fontWeight: "500" as const, fontFamily: "Courier" },
};
