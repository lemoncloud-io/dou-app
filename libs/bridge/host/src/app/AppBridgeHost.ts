import { logger } from '@chatic/logger';

import type { EventMessage, MessageProtocol, RequestMessage, ResponseMessage, IMessageQueue } from '../common';
import { JsonProtocol, MessageQueue } from '../common';
import {
    WEB_MESSAGE_RESPONSE_TYPE,
    type AppMessageData,
    type AppMessageType,
    type BridgeErrorResponse,
    type CacheDomainVersions,
    type SubWebViewContext,
    type SubWebViewOpenScope,
    type WebAppReadyPayload,
    type WebMessageData,
    type WebMessageHandlerResponse,
    type WebMessageType,
} from '@chatic/bridge-messages';
import type { IAppBridgeHost } from './IAppBridgeHost';
import { BRIDGE_VERSION } from '../version';

export interface AppBridgeHostConfig {
    protocol?: MessageProtocol;
    sendToWeb: (message: string) => void;
    version?: string;
    eventBuffer?: IMessageQueue<EventMessage>;
    onAppReady?: (payload: WebAppReadyPayload) => void;
    cacheSchemaVersion?: number;
    supportedCacheTypes?: string[];
    resolveCacheDomainVersions?: () => Promise<CacheDomainVersions | undefined>;
    subWebViewContext?: () => SubWebViewContext;
    subWebViewOpenScope?: SubWebViewOpenScope;
    maxMessageLength?: number;
}

export class AppBridgeHost implements IAppBridgeHost {
    private static readonly NON_READINESS_MESSAGE_TYPES = new Set([
        'SendLog',
        'StorageGet',
        'StorageSave',
        'StorageClear',
        'RuntimeHello',
        'RuntimeCall',
        'RuntimeSubscribe',
        'RuntimeUnsubscribe',
    ]);

    private protocol: MessageProtocol;
    private sendToWeb: (message: string) => void;
    private version: string;

    private handlers: Map<
        string,
        (message: any) => WebMessageHandlerResponse<any> | void | Promise<WebMessageHandlerResponse<any> | void>
    > = new Map();

    private isWebReady = false;
    private eventBuffer: IMessageQueue<EventMessage>;
    private maxMessageLength?: number;

    constructor(config: AppBridgeHostConfig) {
        this.protocol = config.protocol ?? JsonProtocol;
        this.sendToWeb = config.sendToWeb;
        this.version = config.version ?? BRIDGE_VERSION;
        this.eventBuffer = config.eventBuffer ?? new MessageQueue();
        this.maxMessageLength = config.maxMessageLength;

        this.registerHandler('WebAppReady', async message => {
            config.onAppReady?.(message.data ?? {});
            let cacheDomainVersions: CacheDomainVersions | undefined;
            try {
                cacheDomainVersions = await config.resolveCacheDomainVersions?.();
            } catch (error) {
                logger.warn('BRIDGE', '[AppBridgeHost] cache domain versions unavailable', { error });
            }
            const supportedCacheTypes = cacheDomainVersions
                ? Object.keys(cacheDomainVersions)
                : config.supportedCacheTypes;
            const supportedWebMessages = [...this.handlers.keys()] as WebMessageType[];
            return {
                type: 'OnWebAppReady',
                success: true,
                data: {
                    appVersion: this.version,
                    protocolVersion: message.version ?? this.version,
                    supportedWebMessages,
                    supportedAppMessages: [
                        ...new Set(supportedWebMessages.map(type => WEB_MESSAGE_RESPONSE_TYPE[type]).filter(Boolean)),
                    ],
                    ...(config.cacheSchemaVersion !== undefined
                        ? { cacheSchemaVersion: config.cacheSchemaVersion }
                        : {}),
                    ...(supportedCacheTypes ? { supportedCacheTypes } : {}),
                    ...(cacheDomainVersions ? { cacheDomainVersions } : {}),
                    ...(config.subWebViewContext ? { subWebView: config.subWebViewContext() } : {}),
                    ...(config.subWebViewOpenScope ? { subWebViewOpenScope: config.subWebViewOpenScope } : {}),
                },
            };
        });

        this.registerHandler('Ping', message => ({
            type: 'Pong',
            success: true,
            data: { payload: message.data?.payload ?? '' },
        }));
    }

    public async handleMessage(data: string): Promise<void> {
        try {
            const parsed = this.protocol.decode(data) as RequestMessage;
            if (parsed && typeof parsed.type === 'string') {
                if (!this.isWebReady && !AppBridgeHost.NON_READINESS_MESSAGE_TYPES.has(parsed.type)) {
                    this.isWebReady = true;
                    this.flushBuffer();
                }
                if (this.maxMessageLength !== undefined && data.length > this.maxMessageLength) {
                    this.sendToWeb(
                        this.protocol.encode(
                            this.createErrorResponse(
                                parsed,
                                'TOO_LARGE',
                                `The message is over ${this.maxMessageLength} characters.`,
                                { reason: 'The message exceeds the host message size limit.', recoverable: false }
                            )
                        ) as string
                    );
                    return;
                }
                await this.processRequest(parsed);
            }
        } catch (error) {
            logger.error('BRIDGE', '[AppBridgeHost] failed to parse or process message', { error });
        }
    }

    public registerHandler<K extends WebMessageType>(
        type: K,
        handler: (
            message: WebMessageData<K>
        ) => WebMessageHandlerResponse<K> | void | Promise<WebMessageHandlerResponse<K> | void>
    ): void {
        this.handlers.set(type as string, handler);
    }

    public unregisterHandler(type: WebMessageType): void {
        this.handlers.delete(type as string);
    }

    public pushEvent<K extends AppMessageType>(message: AppMessageData<K>): void {
        const eventMsg = {
            ...message,
            version: this.version,
            refId: this.generateRefId(),
        } as unknown as EventMessage;

        if (!this.isWebReady) {
            this.eventBuffer.enqueue(eventMsg);
        } else {
            const encoded = this.protocol.encode(eventMsg);
            this.sendToWeb(encoded as string);
        }
    }

    private flushBuffer(): void {
        while (!this.eventBuffer.isEmpty()) {
            const eventMsg = this.eventBuffer.dequeue();
            if (eventMsg) {
                const encoded = this.protocol.encode(eventMsg);
                this.sendToWeb(encoded as string);
            }
        }
    }

    private async processRequest(message: RequestMessage): Promise<void> {
        const handler = this.handlers.get(message.type);

        if (!handler) {
            this.sendToWeb(
                this.protocol.encode(
                    this.createErrorResponse(
                        message,
                        'NOT_FOUND',
                        `No handler registered for message type: ${message.type}`,
                        {
                            reason: 'No handler is registered for the incoming WebMessage type.',
                            recoverable: true,
                        }
                    )
                ) as string
            );
            return;
        }

        try {
            const result = await handler(message);

            if (!result) return;

            const response = {
                ...result,
                refId: message.refId,
                version: message.version,
            } as unknown as ResponseMessage;

            this.sendToWeb(this.protocol.encode(response) as string);
        } catch (error: any) {
            this.sendToWeb(
                this.protocol.encode(
                    this.createErrorResponse(
                        message,
                        error?.code ?? 'INTERNAL_ERROR',
                        error?.message ?? 'An error occurred during native-side processing.',
                        {
                            reason: 'A registered native handler threw an uncaught exception.',
                            details: { name: error?.name },
                            recoverable: false,
                        }
                    )
                ) as string
            );
        }
    }

    private createErrorResponse(
        message: RequestMessage,
        code: string,
        errorMessage: string,
        options: Partial<BridgeErrorResponse['error']> = {}
    ): BridgeErrorResponse {
        return {
            type: 'ERROR',
            refId: message.refId,
            version: message.version,
            nonce: message.nonce,
            success: false,
            error: {
                code,
                message: errorMessage,
                traceId: this.generateRefId(),
                requestType: message.type,
                expectedResponseType: WEB_MESSAGE_RESPONSE_TYPE[message.type as WebMessageType],
                protocolVersion: message.version ?? this.version,
                appVersion: this.version,
                ...options,
            },
        };
    }

    private generateRefId(): string {
        return Math.random().toString(36).substring(2, 15);
    }
}
