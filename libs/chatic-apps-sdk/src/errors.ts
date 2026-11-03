import type { AppErrorCode } from './types';

/**
 * What a call can fail with. The app's codes, plus five of this library's own:
 * - `NOT_SUPPORTED` — this app cannot do it: an app built before it, a permission the page's manifest
 *   does not hold, or — in a browser — no clipboard;
 * - `TIMEOUT` — the app did not answer in time;
 * - `UNSUPPORTED_PROTOCOL` — the app speaks a protocol major this library does not know;
 * - `NOT_IN_APP` — the call needs the app and the page is in a browser tab;
 * - `DISCONNECTED` — the connection was closed with `disconnect()` before the app answered.
 * A code this list does not name is still a failure of that call and nothing more.
 */
export type ChaticAppsErrorCode =
    | AppErrorCode
    | 'NOT_SUPPORTED'
    | 'TIMEOUT'
    | 'UNSUPPORTED_PROTOCOL'
    | 'NOT_IN_APP'
    | 'DISCONNECTED'
    | (string & {});

/** Every failure this library reports. Branch on `code`; `message` is English for a developer. */
export class ChaticAppsError extends Error {
    readonly code: ChaticAppsErrorCode;

    constructor(code: ChaticAppsErrorCode, message: string) {
        super(message);
        this.name = 'ChaticAppsError';
        this.code = code;
    }
}
