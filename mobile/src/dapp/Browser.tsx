import { forwardRef, useImperativeHandle, useRef } from "react";
import { WebView } from "react-native-webview";
import { colors } from "../theme";

export type BrowserHandle = { inject: (js: string) => void; reload: () => void };
export type BrowserProps = { uri: string; script: string; onMessage: (raw: string) => void; onLoadEnd: () => void };

/** Native in-app browser: a WebView with the wallet provider injected before any page script. (Browser.web.tsx: PWA.) */
export const Browser = forwardRef<BrowserHandle, BrowserProps>(function Browser({ uri, script, onMessage, onLoadEnd }, ref) {
  const web = useRef<WebView>(null);
  useImperativeHandle(ref, () => ({ inject: (js) => web.current?.injectJavaScript(js), reload: () => web.current?.reload() }), []);
  return (
    <WebView ref={web} source={{ uri }} injectedJavaScriptBeforeContentLoaded={script} onMessage={(e) => onMessage(e.nativeEvent.data)} onLoadEnd={onLoadEnd}
      originWhitelist={["https://*"]} allowsBackForwardNavigationGestures setSupportMultipleWindows={false} style={{ backgroundColor: colors.navy900 }} />
  );
});
