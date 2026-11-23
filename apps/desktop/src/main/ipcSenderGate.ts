import { isTrustedUrl } from './webUrl';

export interface IpcSenderEvent {
    senderFrame?: { url: string } | null;
}

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
