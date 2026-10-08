import { Text as RNText, type TextProps } from "react-native";
import { trNode, useLang } from "./index";

/** Drop-in replacement for React Native's Text that renders its strings in the active language. */
export function Text(props: TextProps) {
  useLang(); // re-render when the language changes
  return <RNText {...props}>{trNode(props.children)}</RNText>;
}
