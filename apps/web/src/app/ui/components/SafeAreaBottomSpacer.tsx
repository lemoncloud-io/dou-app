/**
 * Trailing clearance for the bottom safe-area inset, placed as the last child of a page's scroll
 * container.
 *
 * The WebView draws edge-to-edge, under the iOS home indicator and Android's navigation bar, so a
 * scroll container that ends with only a fixed padding (`pb-8`) leaves its last row under the bar
 * once it is scrolled to the end — on a 3-button Android nav bar (~48px) a 32px padding is not
 * enough. The page keeps its own fixed padding as breathing room and this adds the inset below it.
 *
 * A separate element rather than `pb-[calc(var(--safe-bottom)+…)]` on the content, for the reason
 * `BottomNavSpacer` gives: the shell sets `--safe-bottom` with `style.setProperty`, which accepts
 * any string, and a bad value invalidates a whole `calc()` — erasing the fixed padding with it. Kept
 * on its own, a bad inset costs only the inset. A child rather than padding on the scroll container
 * itself, so the clearance is always part of the scrolled content.
 */
export const SafeAreaBottomSpacer = () => <div aria-hidden className="shrink-0 pb-safe-bottom" />;
