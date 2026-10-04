import { Tabs } from "expo-router";
import { Platform, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "@/theme";

const icon = (name: keyof typeof Ionicons.glyphMap) => ({ color, focused }: { color: string | import("react-native").OpaqueColorValue; focused: boolean }) => <Ionicons name={name} size={22} color={focused ? colors.accent : (color as string)} />;

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: "rgba(7,20,38,0.96)", borderTopColor: colors.line, height: Platform.OS === "ios" ? 86 : 68, paddingTop: 8 },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.faint,
        tabBarLabel: ({ color, children }) => <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 11, color, marginTop: 2 }}>{children}</Text>,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Wallet", tabBarIcon: icon("wallet-outline") }} />
      <Tabs.Screen name="p2p" options={{ title: "P2P", tabBarIcon: icon("swap-horizontal-outline") }} />
      <Tabs.Screen name="lend" options={{ title: "Lend", tabBarIcon: icon("trending-up-outline") }} />
      <Tabs.Screen name="tools" options={{ title: "Tools", tabBarIcon: icon("grid-outline") }} />
      <Tabs.Screen name="settings" options={{ title: "Settings", tabBarIcon: icon("settings-outline") }} />
    </Tabs>
  );
}
