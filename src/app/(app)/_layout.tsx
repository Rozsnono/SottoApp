import { Stack } from "expo-router";
import { useTheme } from "@/theme";

export default function AppLayout() {
  const { c } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="camera" options={{ presentation: "fullScreenModal", animation: "fade" }} />
      <Stack.Screen name="viewer" options={{ presentation: "fullScreenModal", animation: "fade" }} />
      <Stack.Screen name="add-friend" options={{ presentation: "modal" }} />
    </Stack>
  );
}
