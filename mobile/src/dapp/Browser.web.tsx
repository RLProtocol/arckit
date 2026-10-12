import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Text } from "../i18n/Text";
import { colors, fonts } from "../theme";
import type { BrowserHandle, BrowserProps } from "./Browser";

export type { BrowserHandle };

type FrameWindow = Window & { eval: (js: string) => unknown; ReactNativeWebView?: { postMessage: (s: string) => void } };

/**
 * PWA in-app browser: the Arc Kit page in a same-origin iframe. When it loads, the app gives it the same bridge the
 * native WebView has (window.ReactNativeWebView.postMessage) and runs the provider script inside it; the provider
 * announces itself over EIP-6963, which the site's wallet list picks up even after page start.
 */
export const Browser = forwardRef<BrowserHandle, BrowserProps>(function Browser({ uri, script, onMessage, onLoadEnd }, ref) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [blocked, setBlocked] = useState(false);
  const win = () => frame.current?.contentWindow as FrameWindow | null | undefined;
  useImperativeHandle(ref, () => ({
    inject: (js) => { try { win()?.eval(js); } catch { /* page navigated away */ } },
    reload: () => { try { win()?.location.reload(); } catch { /* cross-origin */ } },
  }), []);

  const onLoad = () => {
    try {
      const w = win()!;
      w.ReactNativeWebView = { postMessage: (s: string) => onMessage(s) };
      w.eval(script);
      setBlocked(false);
    } catch {
      // only same-origin pages can receive the wallet (true in the installed app, not in a local preview)
      setBlocked(true);
    }
    onLoadEnd();
  };

  return (
    <>
      {blocked ? <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.gold, padding: 8, backgroundColor: colors.goldSoft }}>This page cannot reach the wallet in a preview. It works in the installed app.</Text> : null}
      <iframe ref={frame} src={uri} onLoad={onLoad} title="Arc Kit" style={{ flex: 1, width: "100%", height: "100%", border: 0, backgroundColor: colors.navy900 }} />
    </>
  );
});
