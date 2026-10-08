import { Pressable, View } from "react-native";
import { Text } from "../i18n/Text";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts } from "../theme";

/** Six dots and a numeric keypad; `onChange` receives the new value on every tap. */
export function PinPad({ value, onChange, disabled, extra }: { value: string; onChange: (v: string) => void; disabled?: boolean; extra?: { label: string; onPress: () => void } }) {
  const tap = (k: string) => {
    if (disabled) return;
    if (Platform.OS !== "web") void Haptics.selectionAsync();
    if (k === "⌫") return onChange(value.slice(0, -1));
    if (value.length < 6) onChange(value + k);
  };
  const insets = useSafeAreaInsets();
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", extra ? "•" : "", "0", "⌫"];
  return (
    <View style={{ flex: 1, justifyContent: "flex-end", paddingBottom: 30 + insets.bottom }}>
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 14, marginBottom: 34 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => <View key={i} style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: colors.accentLine, backgroundColor: i < value.length ? colors.accent : "transparent" }} />)}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", rowGap: 14 }}>
        {keys.map((k, i) => (
          <Pressable key={i} aria-label={k === "•" ? extra?.label : k === "⌫" ? "pin delete" : k ? `pin ${k}` : undefined} accessibilityRole="button" disabled={!k || disabled} onPress={() => (k === "•" ? extra?.onPress() : tap(k))} style={({ pressed }) => ({ width: "30%", alignItems: "center", justifyContent: "center", height: 64, opacity: pressed ? 0.6 : 1 })}>
            {k === "•" ? <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.accent }}>{extra?.label}</Text> : <Text style={{ fontFamily: fonts.display, fontSize: k === "⌫" ? 22 : 28, color: colors.text }}>{k}</Text>}
          </Pressable>
        ))}
      </View>
    </View>
  );
}
