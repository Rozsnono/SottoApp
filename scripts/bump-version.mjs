#!/usr/bin/env node
/**
 * Verziónövelés: `npm run bump` (patch), `npm run bump -- minor|major`.
 * Növeli az app.json `expo.version`-jét és az Android `versionCode`-ot, és szinkronban tartja a package.json verzióját.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const kind = process.argv[2] ?? "patch";
if (!["major", "minor", "patch"].includes(kind)) { console.error("Használat: bump [major|minor|patch]"); process.exit(2); }

const appPath = join(root, "app.json");
const app = JSON.parse(readFileSync(appPath, "utf8"));
const [maj, min, pat] = app.expo.version.split(".").map(Number);
const next = kind === "major" ? [maj + 1, 0, 0] : kind === "minor" ? [maj, min + 1, 0] : [maj, min, pat + 1];
app.expo.version = next.join(".");
app.expo.android = { ...app.expo.android, versionCode: (app.expo.android?.versionCode ?? 0) + 1 };
writeFileSync(appPath, JSON.stringify(app, null, 2) + "\n");

const pkgPath = join(root, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.version = app.expo.version;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log(`Verzió: ${app.expo.version} (versionCode ${app.expo.android.versionCode})`);
