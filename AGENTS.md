This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

---
# Sotto-specifikus információk (a projektszintű leírás: ../AGENTS.md)
**Külső projekt (nem KEDD).** Mobil kliens a `sotto-api` backendhez; Expo SDK 58, Expo Router, TypeScript strict, npm, külön git repó.

- **Protokoll:** forrása `../sotto-api/src/protocol`; `npm run sync:protocol` másolja ide (`src/protocol`, NE szerkeszd), `npm run check:protocol` ellenőriz.
- **Konfiguráció:** `EXPO_PUBLIC_API_URL` (lásd `.env.example`; valós eszközön a gép LAN címe). Titok nincs a repóban; a média API kulcsot a szerver az eszköz publikus kulcsára zárva adja.
- **Felépítés:** `src/crypto` (recovery, kulcsok, üzenet-E2EE, STREAM média, safety number), `src/state` (session, chat motor, lock, reveal), `src/services` (média NAS, push), `src/lib` (api, secure, meta), `src/components`, `src/app` (Expo Router: `(auth)`, `(app)/(tabs)`, chat/[id], viewer, camera).
- **Adatkezelés:** a nyílt szöveg csak memóriában él (újraindításkor a szerverről szinkronizál + visszafejt); privát kulcsok és tokenek SecureStore-ban; nem titkos metaadat (olvasottság, kulcs-rögzítés) a `sotto-meta.json` fájlban; visszafejtett média ideiglenesen a cache `sotto-tmp` mappájában, bezáráskor/zároláskor/induláskor törlődik.
- **Tesztelés:** `npm test` (vitest, kripto), `SOTTO_LIVE_API=http://localhost:3002 npm test` (élő együttműködés a futó API-val), `npm run typecheck`, `npx eslint src tests scripts`. Natív funkciók (kamera, biometria, push, fájlrendszer) csak development buildben/eszközön próbálhatók.
- **Kulcstár és kilépés:** fiókonkénti bejegyzés a SecureStore-ban (`sotto.k.<hex(felhasználónév)>`: identitás- és eszközkulcs + ha ismert, a helyreállító kód). Kilépéskor csak a munkamenet törlődik, a kulcstár marad; ugyanazzal a fiókkal újra belépve (több fiók váltogatása mellett is) nem kell kód. A kód regisztrációkor és megadáskor mentődik; a Fiók beállításokban megtekinthető (biometrikus zárnál hitelesítéssel). Fióktörlés a fiók bejegyzését törli. A régi egyfiókos tárolást az app indításkor/belépéskor átviszi.
- **Rendszer-események:** a reakció (6 emoji, hosszú nyomás) és a beszélgetés-téma váltása titkosított `event` típusú üzenet (nincs push, nem buborék); a téma és a reakciók az eseményekből számolódnak (`src/lib/events.ts`), a témák: `src/theme/chatThemes.ts`. Régi backend `event`-et nem fogad: a kliens ezt a szerververziót igényli.
- **Válasz és reakció:** a válasz (`payload.reply`: idézett üzenet azonosítója + rövid kivonat, rejtett üzenetnél kivonat nélkül) húzással indítható (mások üzenetén jobbra, sajátomon balra) vagy a hosszú nyomás menüből; reakció a hosszú nyomással vagy az üzenet melletti ikonnal. Médiára válaszolni (kamera/galéria küldésnél) még nem lehet.
- **Értesítések (toast):** `src/state/toast.ts` + `components/Toaster.tsx`: hiba/siker/info sáv a képernyő TETEJÉN (nem középen), a root layoutban él; használat: `toast.fail(e)`, `toast.success(text)`. Megerősítő/választó párbeszédablak: `src/state/dialog.ts` (`confirmDialog`, `showDialog`) + `components/DialogHost.tsx` (RN Modal, minden képernyő fölött). Natív `Alert` NEM használható; csak az OS saját engedélykérései (kamera, értesítés, biometria) natívak.
- **Logó és ikonok:** forrás `../docs/design/logo.svg`; az `assets/images/` ikonjait (icon, adaptive foreground/background/monochrome, notification-icon, splash, favicon) a logóból generáltuk (sharp, egyszeri szkript, nem része a repónak); a backend `src/app/icon.svg` + `apple-icon.png`, az admin felületen `components/admin/Logo.tsx`.
- **Fiókbeállítás:** `settings/profile.tsx` (kereshetőség, ki jelölhet, jelszócsere) a `/api/account/settings` és `/api/account/password` végpontokat használja.
- **Ismert hiányok:** kimenő üzenet-sor nincs lemezre mentve (újraindításkor a függő üzenet elvész); SendMenu csak koppintással választ (húzás-elengedés nincs); safety number QR nincs; Manrope/Inter betűtípus nincs beépítve (rendszerfont); fiók-kereshetőség beállítás nincs (nincs API); Expo push csak valós eszközön/EAS projectId-val; valós NAS feltöltés nem volt kipróbálva.

## Android release build (helyben)
`source ~/.sotto-signing/env.sh` (helyi keystore, repón kívül, soha nem commitolható) → `EXPO_PUBLIC_API_URL=<url> npx expo prebuild --platform android --no-install` → `cd android && NODE_ENV=production ./gradlew assembleRelease`. Kimenet: `android/app/build/outputs/apk/release/app-release.apk`. Csomagnév: `com.sotto.app` (nyitott döntés, még nem végleges). A keystore elvesztése = a későbbi frissítések nem telepíthetők ugyanerre az appra: készíts róla biztonsági mentést. Az API URL a buildbe égetve; éles: `https://api.sotto.commandos.rozsnorbert.hu` (HTTPS, cleartext tiltva).

**Verzió:** minden változtatásnál `npm run bump` (lásd ../AGENTS.md); a Beállítások alján a verzió és az API verziója látszik.
