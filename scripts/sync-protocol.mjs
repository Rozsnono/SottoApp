#!/usr/bin/env node
/**
 * A protokoll (Zod sémák, konstansok, kulcscsomagolás) forrása: ../sotto-api/src/protocol.
 * Használat:  npm run sync:protocol          → másolás ide: src/protocol
 *             npm run sync:protocol -- --check → csak ellenőrzés (eltérésnél nem-0 kilépési kód)
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "..", "sotto-api", "src", "protocol");
const dst = join(root, "src", "protocol");
const check = process.argv.includes("--check");

if (!existsSync(src)) {
  console.error(`Hiányzik a forrás: ${src}. A sotto-api projektnek a sotto-app mellett kell lennie.`);
  process.exit(2);
}
mkdirSync(dst, { recursive: true });
const header = "// AUTOMATIKUSAN MÁSOLVA a sotto-api/src/protocol-ból (npm run sync:protocol). NE szerkeszd itt.\n";
let diff = 0;
for (const f of readdirSync(src).filter((n) => n.endsWith(".ts"))) {
  const want = header + readFileSync(join(src, f), "utf8");
  const have = existsSync(join(dst, f)) ? readFileSync(join(dst, f), "utf8") : null;
  if (have === want) continue;
  diff++;
  if (check) console.error(`Eltérés: ${f}`);
  else writeFileSync(join(dst, f), want);
}
if (check && diff) { console.error("A protokoll nincs szinkronban. Futtasd: npm run sync:protocol"); process.exit(1); }
console.log(check ? "A protokoll szinkronban van." : `Protokoll szinkronizálva (${diff} fájl frissítve).`);
