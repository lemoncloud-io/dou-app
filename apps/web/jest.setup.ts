// jsdom (jest env) does not expose TextEncoder/TextDecoder, which the socket lib
// touches at import time. Polyfill globally before any test module imports it.
import { TextDecoder, TextEncoder } from 'util';

const globalRef = globalThis as unknown as {
    TextEncoder?: unknown;
    TextDecoder?: unknown;
    ResizeObserver?: unknown;
};
globalRef.TextEncoder = globalRef.TextEncoder ?? TextEncoder;
globalRef.TextDecoder = globalRef.TextDecoder ?? TextDecoder;

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
