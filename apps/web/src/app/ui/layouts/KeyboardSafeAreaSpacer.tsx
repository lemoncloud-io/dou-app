/** Bottom padding the preceding CTA panel already provides (FloatingButton / footer `pb-4`). */
const CTA_BASE_PADDING = '1rem';

/**
 * CSS length that keeps a bottom-docked CTA clear of BOTH the home-indicator safe-area inset and
 * the on-screen keyboard: `max(safe-bottom - base, keyboard-height)`.
 *
 * - safe-area branch — the CTA panel usually pads its own bottom already (`basePadding`), so only
 *   the EXTRA beyond that base is added: the total bottom gap collapses to `max(base, safe-bottom)`
 *   instead of stacking base + inset (which over-pads on devices with a home indicator and leaves
 *   the CTA floating too high). The native WebView is inset below the status bar but extends under
 *   the home indicator, so only the bottom inset is applied.
 * - keyboard branch — while the soft keyboard is up the CTA rides above it instead of being covered.
 *
 * `max()`, never a sum: the keyboard already covers the home-indicator inset, so adding both would
 * over-pad. `--keyboard-height` / `--safe-bottom` are injected into the WebView by the native shell;
 * in a plain browser they are absent and fall back to `0px`, so this collapses to no extra space.
 * The `0px` fallback of `--keyboard-height` also floors the result, so it never goes negative.
 */
export const keyboardSafeBottom = (basePadding = '0px') =>
    `max(calc(var(--safe-bottom, 0px) - ${basePadding}), var(--keyboard-height, 0px))`;

/**
 * Bottom spacer for full-screen dialogs/pages whose CTA (e.g. FloatingButton) is docked at the
 * bottom. Reserves room so the CTA clears the home-indicator inset and rides above the on-screen
 * keyboard — see `keyboardSafeBottom` for the formula. Assumes the CTA panel right above it already
 * pads itself by `CTA_BASE_PADDING` (`pb-4`), which is the shared FloatingButton / footer contract.
 *
 * This is the dialog counterpart of KeyboardAwareLayout's footer tail spacer, which applies the same
 * rule to route pages. Dialogs cannot use that layout: DialogContent `variant="slide-up"` /
 * `"fullscreen"` already bake in `pb-safe-bottom`, so nesting the layout would double the inset.
 *
 * `touch-none` + preventing touchmove stops the spacer from rubber-band scrolling the page.
 */
export const KeyboardSafeAreaSpacer = () => {
    return (
        <div
            className="shrink-0 touch-none bg-background"
            style={{ height: keyboardSafeBottom(CTA_BASE_PADDING) }}
            onTouchMove={e => e.preventDefault()}
        />
    );
};
