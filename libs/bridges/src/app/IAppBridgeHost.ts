import type {
    AppMessageData,
    AppMessageType,
    WebMessageData,
    WebMessageHandlerResponse,
    WebMessageType,
} from '@chatic/bridge-messages';

export interface IAppBridgeHost {
    handleMessage(data: string): Promise<void>;

    registerHandler<K extends WebMessageType>(
        type: K,
        handler: (
            message: WebMessageData<K>
        ) => WebMessageHandlerResponse<K> | void | Promise<WebMessageHandlerResponse<K> | void>
    ): void;

    unregisterHandler(type: WebMessageType): void;

    pushEvent<K extends AppMessageType>(message: AppMessageData<K>): void;
}
