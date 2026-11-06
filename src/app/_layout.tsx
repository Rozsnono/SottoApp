import "@/lib/polyfill"; // ELSŐ importként: véletlenszám-forrás az @noble/* könyvtáraknak
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { initI18n } from "@/i18n";
import { loadSession, session } from "@/state/session";
import { initLock, lock } from "@/state/lock";
import { startEngine } from "@/state/chat";
import { registerPush } from "@/services/push";
import { initNotify, stopNotify } from "@/services/notify";
import { purgeTemp } from "@/services/media";
import { useStore } from "@/lib/store";
import { useTheme } from "@/theme";
import { LockScreen, RecoveryCodeScreen } from "@/components/Overlays";
import { Toaster } from "@/components/Toaster";
import { DialogHost } from "@/components/DialogHost";

export default function RootLayout() {
  const { c, dark } = useTheme();
  const [booted, setBooted] = useState(false);
  const status = useStore(session, (s) => s.status);
  const code = useStore(session, (s) => s.recoveryCodeToShow);
  const locked = useStore(lock, (s) => s.locked);

  useEffect(() => {
    (async () => {
      purgeTemp(); // az előző futásból maradt visszafejtett ideiglenes fájlok
      await initI18n();
      await loadSession();
      await initLock().catch((e) => console.warn("[lock] init sikertelen", e));
      setBooted(true);
    })();
  }, []);

  useEffect(() => {
    if (status !== "ready") return;
    void startEngine();
    void registerPush();
    initNotify();
    return stopNotify;
  }, [status]);

  if (!booted || status === "loading") return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  const overlay = status === "ready" && code ? <RecoveryCodeScreen /> : status === "ready" && locked ? <LockScreen /> : null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.bg }}>
      <SafeAreaProvider>
        <StatusBar style={dark ? "light" : "dark"} />
        {overlay ?? <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
          <Stack.Protected guard={status === "anon" || status === "needs-keys"}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
          <Stack.Protected guard={status === "ready"}>
            <Stack.Screen name="(app)" />
          </Stack.Protected>
        </Stack>}
        <Toaster />
        <DialogHost />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
