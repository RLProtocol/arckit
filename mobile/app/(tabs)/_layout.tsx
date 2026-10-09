import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { Text } from "@/i18n/Text";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts } from "@/theme";

const icon = (name: keyof typeof Ionicons.glyphMap) => ({ color, focused }: { color: string | import("react-native").OpaqueColorValue; focused: boolean }) => <Ionicons name={name} size={22} color={focused ? colors.accent : (color as string)} />;

export default function TabsLayout() {
  // bottom inset = Android 3-button / gesture bar or the iPhone home indicator; the bar sits above it
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, Platform.OS === "android" ? 8 : 0);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: "rgba(7,20,38,0.98)", borderTopColor: colors.line, height: 60 + bottom, paddingTop: 8, paddingBottom: bottom },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.faint,
        tabBarLabel: ({ color, children }) => <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 11, color, marginTop: 2 }}>{children}</Text>,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Wallet", tabBarIcon: icon("wallet-outline") }} />
      <Tabs.Screen name="trade" options={{ title: "Trade", tabBarIcon: icon("pulse-outline") }} />
      <Tabs.Screen name="launch" options={{ title: "Launch", tabBarIcon: icon("rocket-outline") }} />
      <Tabs.Screen name="p2p" options={{ title: "P2P", tabBarIcon: icon("people-outline") }} />
      <Tabs.Screen name="lend" options={{ title: "Lend", tabBarIcon: icon("trending-up-outline") }} />
      <Tabs.Screen name="tools" options={{ title: "Tools", tabBarIcon: icon("grid-outline") }} />
      {/* reached from the gear on Wallet and Tools, not the tab bar */}
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}
