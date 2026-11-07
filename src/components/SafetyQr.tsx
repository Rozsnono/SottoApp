/** Biztonsági szám QR-kódja (SVG). A tartalom: `sotto:sn1:<30 számjegy>` – a két fél azonos számot kap, ezért bármelyikük kódja egyezik. */
import { useMemo } from "react";
import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import makeQr from "qrcode-generator";

export { snPayload, parseSnPayload } from "@/crypto/safety";

export function SafetyQr({ value, px = 200, fg = "#000", bg = "#fff" }: { value: string; px?: number; fg?: string; bg?: string }) {
  const d = useMemo(() => {
    const qr = makeQr(0, "M");
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let path = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) path += `M${c + 4} ${r + 4}h1v1h-1z`; // 4 modulos csendes zóna
    return { path, n: n + 8 };
  }, [value]);
  return (
    <View accessibilityLabel="QR" style={{ width: px, height: px, backgroundColor: bg, borderRadius: 12, overflow: "hidden" }}>
      <Svg width={px} height={px} viewBox={`0 0 ${d.n} ${d.n}`}><Path d={d.path} fill={fg} /></Svg>
    </View>
  );
}
