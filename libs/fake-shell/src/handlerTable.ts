import {
    WEB_MESSAGE_RESPONSE_TYPE,
    type AppMessageDataMap,
    type WebMessageData,
    type WebMessageHandlerResponse,
    type WebMessageResponseType,
    type WebMessageType,
} from '@chatic/bridge-messages';

export type ShellReply<K extends WebMessageType> = AppMessageDataMap[WebMessageResponseType<K>];

export class ShellFailure {
    constructor(
        readonly code: string,
        readonly message: string = code
    ) {}
}

export type ShellHandler<K extends WebMessageType> = (
    data: WebMessageData<K>['data'],
    message: WebMessageData<K>
) => ShellReply<K> | ShellFailure | void | Promise<ShellReply<K> | ShellFailure | void>;

export type ShellHandlerTable = { [K in WebMessageType]?: ShellHandler<K> };

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
