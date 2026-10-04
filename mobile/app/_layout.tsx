import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts, Outfit_300Light, Outfit_500Medium, Outfit_600SemiBold } from "@expo-google-fonts/outfit";
import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from "@expo-google-fonts/dm-sans";
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from "@expo-google-fonts/ibm-plex-mono";
import { WalletProvider, useWallet } from "@/wallet/provider";
import { colors } from "@/theme";

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 5_000 } } });

/** Sends the user to onboarding, the lock screen or the app depending on wallet state. */
function Gate() {
  const { status } = useWallet();
  const segments = useSegments();
  const router = useRouter();
  useEffect(() => {
    if (status === "loading") return;
    const top = segments[0] as string | undefined;
    if (status === "none" && top !== "onboarding") router.replace("/onboarding");
    else if (status === "locked" && top !== "unlock") router.replace("/unlock");
    else if (status === "ready" && (top === "onboarding" || top === "unlock" || !top)) router.replace("/(tabs)");
  }, [status, segments, router]);
  return null;
}

export default function RootLayout() {
  const [loaded] = useFonts({ Outfit_300Light, Outfit_500Medium, Outfit_600SemiBold, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold, IBMPlexMono_400Regular, IBMPlexMono_500Medium });
  if (!loaded) return <View style={{ flex: 1, backgroundColor: colors.navy900, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.accent} /></View>;
  return (
    <QueryClientProvider client={qc}>
      <WalletProvider>
        <Gate />
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.navy900 }, animation: "fade" }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="unlock" />
          <Stack.Screen name="send" options={{ presentation: "modal" }} />
          <Stack.Screen name="receive" options={{ presentation: "modal" }} />
          <Stack.Screen name="activity" />
          <Stack.Screen name="token-add" options={{ presentation: "modal" }} />
          <Stack.Screen name="dapp" />
          <Stack.Screen name="backup" />
        </Stack>
      </WalletProvider>
    </QueryClientProvider>
  );
}
