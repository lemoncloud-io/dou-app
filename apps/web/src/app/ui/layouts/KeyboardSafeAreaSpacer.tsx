/** Bottom padding the preceding CTA panel already provides (FloatingButton / footer `pb-4`). */
const CTA_BASE_PADDING = '1rem';

/**
 * Bottom spacer for full-screen dialogs whose CTA (e.g. FloatingButton) is docked at the bottom.
 * Reserves room so the CTA clears the home-indicator safe-area inset.
 *
 * The CTA panel above already pads its own bottom by `CTA_BASE_PADDING` (`pb-4`), so this spacer
 * adds only the EXTRA beyond that base — the total bottom gap collapses to `max(base, safe-bottom)`
 * rather than stacking base + inset (which over-pads on devices with a home indicator, leaving the
 * CTA floating too high). The native WebView is inset below the status bar but extends under the
 * home indicator, so only the bottom inset is applied.
 *
 * The on-screen keyboard is intentionally NOT reserved for: the docked button stays put and the
 * keyboard overlays it, rather than riding up above the keyboard as it appears. (`--keyboard-height`
 * is deliberately excluded from the height here.)
 *
 * `touch-none` + preventing touchmove stops the spacer from rubber-band scrolling the page.
 */
export const KeyboardSafeAreaSpacer = () => {
    return (
        <div
            className="shrink-0 touch-none bg-background"
            style={{
                height: `max(0px, calc(var(--safe-bottom, 0px) - ${CTA_BASE_PADDING}))`,
            }}
            onTouchMove={e => e.preventDefault()}
        />
    );
};
