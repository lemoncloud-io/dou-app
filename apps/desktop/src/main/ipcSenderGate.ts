/**
 * The origin gate every renderer-facing IPC channel sits behind. Any frame the window ever
 * loads can reach `ipcRenderer` through the preload — a page the web navigated to, an iframe —
 * so each channel checks which frame sent the message before acting on it.
 *
 * One wrapper rather than the same `isTrustedUrl(event.senderFrame?.url)` line in each
 * handler, so a new channel cannot be registered with the check left out, and so the gate can
 * be tested here: the handlers themselves live in `index.ts`, which needs electron and cannot
 * run under jest. Deliberately imports no electron for the same reason.
 */
import { isTrustedUrl } from './webUrl';

/**
 * The part of electron's IPC event the gate reads. `senderFrame` is null once the sending
 * frame has navigated away or been destroyed, which is answered as untrusted.
 */
export interface IpcSenderEvent {
    senderFrame?: { url: string } | null;
}

/**
 * Wraps an IPC handler so it runs only for a message from a trusted frame, receiving that
 * frame's URL; any other sender gets `onUntrusted()` and the handler never runs.
 */
export const fromTrustedFrame =
    <Args extends unknown[], Result>(
        onUntrusted: () => Result,
        handler: (senderUrl: string, ...args: Args) => Result
    ) =>
    (event: IpcSenderEvent, ...args: Args): Result => {
        const senderUrl = event.senderFrame?.url;
        if (senderUrl === undefined || !isTrustedUrl(senderUrl)) return onUntrusted();
        return handler(senderUrl, ...args);
    };
