import type {
    AppMessageData,
    AppMessageType,
    WebMessageData,
    WebMessageHandlerResponse,
    WebMessageType,
} from '@chatic/app-messages';

/**
 * A host interface that, in the App (Native) environment, receives and handles requests from the Web (React, etc.).
 */
export interface IAppBridgeHost {
    /**
     * [Web -> App] Parses string data that arrived over the bridge channel (WebView) and routes it to the right handler.
     */
    handleMessage(data: string): Promise<void>;

    /**
     * [Web -> App] Registers the business logic (handler) for a specific RequestType.
     * When a request of that type arrives from Web, this handler runs, and its return value is automatically sent back to Web as a response.
     *
     * Returning nothing sends no response. This is for fire-and-forget messages (`SendLog`) that
     * no one is waiting on a response for — that response would otherwise just be discarded on
     * the web side, consuming bridge bandwidth and UI-thread time for nothing. See
     * `AppBridgeHost.processRequest`.
     */
    registerHandler<K extends WebMessageType>(
        type: K,
        handler: (
            message: WebMessageData<K>
        ) => WebMessageHandlerResponse<K> | void | Promise<WebMessageHandlerResponse<K> | void>
    ): void;

    /**
     * Removes a specific registered handler.
     */
    unregisterHandler(type: WebMessageType): void;

    /**
     * [App -> Web] Pushes a one-way event that originates spontaneously from the App (Native) side, without a Web request.
     */
    pushEvent<K extends AppMessageType>(message: AppMessageData<K>): void;
}
