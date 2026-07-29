/**
 * Trailing clearance for the two screens that sit behind the floating bottom nav (home, my page),
 * so the last row can scroll fully clear of it.
 *
 * Deliberately calc-free. The previous `pb-[calc(var(--safe-bottom,0px)+224px)]` on the scroll
 * container couples the fixed clearance to the injected inset: `--safe-bottom` is set by the native
 * shell via `style.setProperty`, which accepts ANY string, so a bad value (e.g. `undefinedpx` when
 * the inset is missing) makes the whole calc invalid at computed-value time and padding-bottom
 * silently falls back to 0 — losing all 224px, not just the inset. Splitting them means a bad inset
 * costs only the inset.
 *
 * Geometry: FloatingTabBar is 62px (pill) + 18px (bottom offset) = 80px above --safe-bottom; 224px
 * leaves ~144px of breathing room below the last row.
 */
export const BottomNavSpacer = () => (
    <div aria-hidden className="shrink-0 pb-safe-bottom">
        <div className="h-[224px]" />
    </div>
);
