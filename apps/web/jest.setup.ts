const globalRef = globalThis as unknown as { ResizeObserver?: unknown };

// jsdom has no layout engine, so it ships no ResizeObserver — but the overlay-chrome layouts
// (KeyboardAwareLayout via useChromeInsets) construct one on mount. A no-op stub keeps those
// screens renderable in tests; heights simply stay at their initial 0, which no test asserts on.
const noop = () => undefined;
class NoopResizeObserver implements ResizeObserver {
    observe = noop;
    unobserve = noop;
    disconnect = noop;
}
globalRef.ResizeObserver = globalRef.ResizeObserver ?? NoopResizeObserver;
