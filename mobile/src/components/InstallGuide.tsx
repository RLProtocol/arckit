import { useEffect, useState, type ReactNode } from "react";
import { Image, Linking, Platform, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import { Text } from "../i18n/Text";
import { colors, fonts, radius } from "../theme";
import { Button, Card, Eyebrow, H1, Notice, P, Screen } from "./ui";

// The PWA only runs as an installed app: in a normal browser tab /pwa shows how to add it to the home screen.
// Chrome on Android fires beforeinstallprompt once, early, so it is caught at import time.
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
if (Platform.OS === "web" && typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as InstallEvent; listeners.forEach((f) => f()); });
}

/** True when launched from the home screen (iOS standalone or display-mode: standalone). */
export function isStandalone(): boolean {
  if (Platform.OS !== "web" || typeof window === "undefined") return true;
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Local previews skip the gate (add ?install to see the guide). */
export const gateBypassed = () => Platform.OS === "web" && typeof window !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname) && !window.location.search.includes("install");

const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1);
const isAndroid = /Android/.test(ua);
const URL_PWA = "https://www.usearckit.online/pwa";
const LOGO = require("../../assets/logo.png");

function Step({ n, icon, children }: { n: number; icon: keyof typeof Ionicons.glyphMap; children: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", gap: 14, alignItems: "center", paddingVertical: 12, borderTopWidth: n > 1 ? 1 : 0, borderTopColor: colors.line }}>
      <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }}><Text style={{ fontFamily: fonts.monoMedium, fontSize: 13, color: colors.accent }}>{String(n)}</Text></View>
      <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.text }}>{children}</Text>
      <Ionicons name={icon} size={22} color={colors.dim} />
    </View>
  );
}

export function InstallGuide() {
  const [canPrompt, setCanPrompt] = useState(!!deferred);
  const [installed, setInstalled] = useState(false);
  useEffect(() => { const f = () => setCanPrompt(true); listeners.add(f); return () => { listeners.delete(f); }; }, []);
  const install = async () => { if (!deferred) return; await deferred.prompt(); const r = await deferred.userChoice; if (r.outcome === "accepted") setInstalled(true); deferred = null; setCanPrompt(false); };

  return (
    <Screen>
      <View style={{ alignItems: "center", marginTop: 28 }}>
        <Image source={LOGO} style={{ width: 76, height: 76, borderRadius: 20 }} />
        <Eyebrow>Arc Kit app</Eyebrow>
        <H1 style={{ textAlign: "center" }}>Add Arc Kit to your home screen</H1>
        <P small style={{ textAlign: "center", marginTop: 8 }}>The full Arc Kit wallet with every tool, running as an app. It opens from your home screen, not in a browser tab.</P>
      </View>

      {isIOS ? (
        <Card>
          <Eyebrow color={colors.accent}>iPhone and iPad</Eyebrow>
          <Step n={1} icon="share-outline">Tap the Share button in the toolbar.</Step>
          <Step n={2} icon="add-circle-outline">Scroll down and tap Add to Home Screen.</Step>
          <Step n={3} icon="checkmark-circle-outline">Tap Add, then open Arc Kit from your home screen.</Step>
        </Card>
      ) : isAndroid ? (
        <Card>
          <Eyebrow color={colors.accent}>Android</Eyebrow>
          {canPrompt ? <Button title="Install Arc Kit" onPress={() => void install()} /> : null}
          {installed ? <Notice tone="aqua">Installed. Open Arc Kit from your home screen.</Notice> : null}
          <Step n={1} icon="ellipsis-vertical">Open the browser menu.</Step>
          <Step n={2} icon="download-outline">Tap Install app or Add to Home screen.</Step>
          <Step n={3} icon="checkmark-circle-outline">Open Arc Kit from your home screen.</Step>
          <P small style={{ marginTop: 10 }}>Prefer a regular app? The Android APK is on the Arc Kit homepage.</P>
        </Card>
      ) : (
        <Card style={{ alignItems: "center" }}>
          <Eyebrow color={colors.accent}>Open on your phone</Eyebrow>
          <View style={{ padding: 14, backgroundColor: "#fff", borderRadius: radius.lg, marginTop: 14 }}><QRCode value={URL_PWA} size={180} /></View>
          <P small style={{ textAlign: "center", marginTop: 12 }}>Scan with your phone's camera, then add it to your home screen.</P>
          <Text style={{ fontFamily: fonts.mono, fontSize: 13, color: colors.aqua, marginTop: 6 }}>usearckit.online/pwa</Text>
        </Card>
      )}

      <Card>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
          <Ionicons name="shield-checkmark-outline" size={22} color={colors.aqua} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text }}>Your keys stay on this phone</Text>
            <P small style={{ marginTop: 4 }}>The wallet is encrypted with your PIN and stored in this browser on this device only. Clearing this site's data removes it, so write down your recovery phrase.</P>
          </View>
        </View>
      </Card>
      <Button kind="ghost" title="Back to usearckit.online" onPress={() => void Linking.openURL("https://www.usearckit.online")} />
    </Screen>
  );
}
