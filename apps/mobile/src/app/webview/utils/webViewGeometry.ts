import type { EdgeInsets } from 'react-native-safe-area-context';

/**
 * Splits the safe area between the shell and the web.
 *
 * The shell owns the horizontal insets: it pads the WebView by them, so every web surface —
 * including `position: fixed` and portalled ones that never read a CSS variable — stays clear of a
 * side inset without each one opting in. iPhone Duo's outer display needs this most, because its
 * status bar and Dynamic Island sit on the trailing edge; a phone in landscape gets the same.
 *
 * The web is then told 0 for left and right, because its viewport already starts inside the
 * padding — reporting the real values would pad the same strip twice in any component that does
 * read `--safe-left`/`--safe-right`. Top and bottom stay with the web, which draws behind the
 * status bar and home indicator on purpose.
 */
export const toWebViewInsets = (
    insets: EdgeInsets
): { padding: { paddingLeft: number; paddingRight: number }; web: EdgeInsets } => ({
    padding: { paddingLeft: insets.left, paddingRight: insets.right },
    web: { top: insets.top, bottom: insets.bottom, left: 0, right: 0 },
});
