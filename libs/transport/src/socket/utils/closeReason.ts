/**
 * Why a slot's socket closed, as `socket_request` reports it on a 499.
 *
 * A closed set on purpose: it becomes a Firebase attribute, and a free-form close reason from the
 * server would open a console row per string.
 *
 * - `pong_timeout` — the SDK keep-alive missed its pongs and closed the socket.
 * - `wake_recovery` — the app's foreground kick recycled a slot that was not verified.
 * - `wake_probe` — the app's foreground liveness probe got no answer from a slot that read verified.
 * - `service_restart` — the SDK reconnect controller's `restart()`, or its connection rotation.
 * - `destroyed` — the app tore the slot down: a cloud switch, a logout, a rebind.
 * - `server` — the far end closed the connection with a close frame.
 * - `transport` — the connection ended without a clean close (network lost, the OS killed the
 *   socket), or no close was seen at all.
 * - `other` — this client closed the socket for a reason not listed above.
 */
export type SocketCloseReason =
    | 'pong_timeout'
    | 'wake_recovery'
    | 'wake_probe'
    | 'service_restart'
    | 'destroyed'
    | 'server'
    | 'transport'
    | 'other';

/** The close reasons the app itself passes to `disconnect`, so a close it caused is named after it. */
export const APP_CLOSE_REASON = {
    wakeRecovery: 'wake-recovery',
    wakeProbe: 'wake-probe',
} as const;

/**
 * Close reason strings the SDK and the app send, mapped to what they mean. chatic-sockets-lib 0.5.x
 * closes with `pong-timeout` (keep-alive) and `service-restart` (reconnect restart and connection
 * rotation); `closeReason.test.ts` drives the real client to pin both.
 */
const KNOWN_REASONS: Record<string, SocketCloseReason> = {
    'pong-timeout': 'pong_timeout',
    'service-restart': 'service_restart',
    [APP_CLOSE_REASON.wakeRecovery]: 'wake_recovery',
    [APP_CLOSE_REASON.wakeProbe]: 'wake_probe',
};

/** What the SDK transport's `close` event carries. */
export interface SocketCloseEvent {
    code?: number;
    reason?: string;
    wasClean?: boolean;
}

/**
 * Names a close from the SDK transport's `close` event.
 *
 * The transport emits the same event for a close this client asked for and for one the far end or
 * the OS made. A known reason string names the first kind outright; for the rest, `local` — the
 * client went through `closing` first, which only a close it asked for does — tells them apart. A
 * remote close that ended without a close frame is `wasClean: false`, normally code 1006.
 */
export const classifySocketClose = (event: SocketCloseEvent | undefined, local: boolean): SocketCloseReason => {
    const known = event?.reason ? KNOWN_REASONS[event.reason] : undefined;
    if (known) return known;
    if (local) return 'other';
    if (!event || event.code === undefined || event.wasClean === false || event.code === 1006) return 'transport';
    return 'server';
};
