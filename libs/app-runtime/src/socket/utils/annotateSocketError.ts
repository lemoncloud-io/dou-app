import type { SocketKind } from '../types';

/**
 * Names the failing call on an error leaving the request/send facade — `<kind>.<action>(<type>)`.
 *
 * The SDK's own transport failures carry no caller identity: `503 SOCKET NOT CONNECTED -
 * WebSocketTransport.send()` is byte-identical whichever request raced a closed socket, so a
 * minified production stack cannot say which one it was (nor which slot). Every request funnels
 * through `SocketManager`'s facade, so it is the one place that still knows both.
 *
 * Three invariants this must not break:
 *  - The status stays LEADING — getSocketErrorCode reads the message prefix, so this only appends.
 *  - The original object is rethrown, not wrapped, so its stack and carried fields (`errorCode`)
 *    survive; only `message` gains a suffix. Non-Error rejections pass through untouched.
 *  - Skipped when the message already names the type (the SDK's `408 REQUEST TIMEOUT - <type>[mid]`
 *    already does), which also makes it idempotent under any future re-annotating retry wrapper.
 */
export const annotateSocketError = (error: unknown, kind: SocketKind, action: string, type: string): unknown => {
    if (!(error instanceof Error) || error.message.includes(type)) return error;
    error.message = `${error.message} - ${kind}.${action}(${type})`;
    return error;
};
