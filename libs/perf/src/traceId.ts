/**
 * A trace id unique enough to pair a start with its stop inside one device.
 *
 * Not a UUID: the id never leaves the device (Firebase does not see it, and the log fallback
 * does not write it), and only has to stay distinct among the handful of traces open at once.
 */
export const createPerfTraceId = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
