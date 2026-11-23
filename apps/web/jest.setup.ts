const globalRef = globalThis as unknown as { ResizeObserver?: unknown };

const noop = () => undefined;
class NoopResizeObserver implements ResizeObserver {
    observe = noop;
    unobserve = noop;
    disconnect = noop;
}
globalRef.ResizeObserver = globalRef.ResizeObserver ?? NoopResizeObserver;
