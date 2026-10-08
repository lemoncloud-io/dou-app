import {
    WEB_MESSAGE_RESPONSE_TYPE,
    type AppMessageDataMap,
    type WebMessageData,
    type WebMessageHandlerResponse,
    type WebMessageResponseType,
    type WebMessageType,
} from '@chatic/app-messages';

/**
 * What the shell answers a request with: the payload of the reply `WEB_MESSAGE_RESPONSE_TYPE` pairs
 * it with. Written as a lookup through that map rather than by hand, so renaming a reply or changing
 * its payload in `@chatic/app-messages` breaks the handlers here at compile time instead of leaving a
 * scenario that fakes a contract the app no longer speaks.
 */
export type ShellReply<K extends WebMessageType> = AppMessageDataMap[WebMessageResponseType<K>];

/**
 * A failed reply — `success: false` with an error code, the shape the mobile handlers return for a
 * domain failure (`BUSY`, `INVALID`, …). A missing handler is not this: it is the host's own
 * `NOT_FOUND`, which the table produces by leaving the type out.
 */
export class ShellFailure {
    constructor(
        readonly code: string,
        readonly message: string = code
    ) {}
}

/**
 * One message's handler. Returning nothing sends nothing — the rule the real host follows for a
 * fire-and-forget message, which has no caller waiting for a reply.
 */
export type ShellHandler<K extends WebMessageType> = (
    data: WebMessageData<K>['data'],
    message: WebMessageData<K>
) => ShellReply<K> | ShellFailure | void | Promise<ShellReply<K> | ShellFailure | void>;

/** The fake shell's handlers, keyed by request type. A type left out answers `NOT_FOUND`. */
export type ShellHandlerTable = { [K in WebMessageType]?: ShellHandler<K> };

/**
 * Wraps a table handler into the host's handler shape: the reply's `type` comes from the contract
 * map, never from the handler, so a handler cannot answer with the wrong message.
 */
export const toHostHandler =
    <K extends WebMessageType>(type: K, handler: ShellHandler<K>) =>
    async (message: WebMessageData<K>): Promise<WebMessageHandlerResponse<K> | void> => {
        const replyType = WEB_MESSAGE_RESPONSE_TYPE[type] as WebMessageResponseType<K>;
        const result = await handler(message.data, message);
        if (result === undefined) return;
        if (result instanceof ShellFailure) {
            return { type: replyType, success: false, error: { code: result.code, message: result.message } };
        }
        return { type: replyType, success: true, data: result };
    };
