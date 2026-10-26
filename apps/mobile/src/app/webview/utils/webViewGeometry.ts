import type { EdgeInsets } from 'react-native-safe-area-context';

import type { DivisionRect } from '../../bridge/DisplayRegionBridge';

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

/** Where the device fold crosses the WebView, in its CSS px: `start`/`end` are its two edges on the axis it cuts. */
export interface WebViewFold {
    /** `vertical` — the fold runs top to bottom (iPhone Duo's inner display held as a book). */
    axis: 'vertical' | 'horizontal';
    start: number;
    end: number;
}

/**
 * Turns the division UIKit reports, in window points, into the WebView's own coordinates.
 *
 * The WebView starts `leftInset` points into the window, because the shell pads it by the side
 * insets (`toWebViewInsets`), so a vertical fold moves left by that much. Nothing pads it vertically,
 * so a horizontal fold keeps its window `y`. A rect at least as tall as it is wide is a vertical fold. iOS
 * points and CSS px are the same unit in a WKWebView at its default zoom.
 */
export const toWebViewFold = (division: DivisionRect | null, leftInset: number): WebViewFold | null => {
    if (!division) return null;
    if (division.height >= division.width) {
        return { axis: 'vertical', start: division.x - leftInset, end: division.x + division.width - leftInset };
    }
    return { axis: 'horizontal', start: division.y, end: division.y + division.height };
};
