import type { EventMessage, MessageProtocol, RequestMessage, ResponseMessage, IMessageQueue } from '../common';
import { JsonProtocol, MessageQueue } from '../common';
import {
    WEB_MESSAGE_RESPONSE_TYPE,
    type AppMessageData,
    type AppMessageType,
    type BridgeErrorResponse,
    type WebMessageData,
    type WebMessageHandlerResponse,
    type WebMessageType,
} from '@chatic/app-messages';
import type { IAppBridgeHost } from './IAppBridgeHost';
import { BRIDGE_PROTOCOL_VERSION } from '../version';

export interface AppBridgeHostConfig {
    protocol?: MessageProtocol;
    sendToWeb: (message: string) => void;
    version?: string;
    eventBuffer?: IMessageQueue<EventMessage>;
}

export class AppBridgeHost implements IAppBridgeHost {
    private protocol: MessageProtocol;
    private sendToWeb: (message: string) => void;
    private version: string;

    private handlers: Map<
        string,
        (message: any) => WebMessageHandlerResponse<any> | Promise<WebMessageHandlerResponse<any>>
    > = new Map();

    private isWebReady = false;
    private eventBuffer: IMessageQueue<EventMessage>;

    constructor(config: AppBridgeHostConfig) {
        this.protocol = config.protocol ?? JsonProtocol;
        this.sendToWeb = config.sendToWeb;
        this.version = config.version ?? BRIDGE_PROTOCOL_VERSION;
        this.eventBuffer = config.eventBuffer ?? new MessageQueue();

        // WebAppReady는 단순 ready 신호가 아니라 웹/모바일 protocol capability를 교환하는 handshake입니다.
        this.registerHandler('WebAppReady', async message => {
            return {
                type: 'OnWebAppReady',
                success: true,
                data: {
                    appVersion: this.version,
                    protocolVersion: message.version ?? this.version,
                    supportedWebMessages: Object.keys(WEB_MESSAGE_RESPONSE_TYPE),
                    supportedAppMessages: Object.values(WEB_MESSAGE_RESPONSE_TYPE),
                    capabilities: {
                        typedResponses: true,
                        legacyWebAppReady: true,
                    },
                },
            };
        });
    }

    public async handleMessage(data: string): Promise<void> {
        try {
            const parsed = this.protocol.decode(data) as RequestMessage;
            if (parsed && typeof parsed.type === 'string') {
                if (!this.isWebReady) {
                    this.isWebReady = true;
                    this.flushBuffer();
                }
                await this.processRequest(parsed);
            }
        } catch (error) {
            console.error('[AppBridgeHost] 메시지 파싱 또는 처리 실패:', error);
        }
    }

    public registerHandler<K extends WebMessageType>(
        type: K,
        handler: (message: WebMessageData<K>) => WebMessageHandlerResponse<K> | Promise<WebMessageHandlerResponse<K>>
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

        // 핸들러가 등록되지 않은 경우 즉시 에러 전송
        if (!handler) {
            this.sendToWeb(
                this.protocol.encode(
                    this.createErrorResponse(
                        message,
                        'NOT_FOUND',
                        `등록된 핸들러를 찾을 수 없습니다: ${message.type}`,
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
            // 핸들러 실행
            const result = await handler(message);

            // handler는 도메인 응답만 반환하고, host가 request metadata를 응답에 다시 연결합니다.
            const response = {
                ...result,
                refId: message.refId,
                version: message.version,
            } as unknown as ResponseMessage;

            this.sendToWeb(this.protocol.encode(response) as string);
        } catch (error: any) {
            // 핸들러 내부에서 예상치 못한 치명적 예외(Uncaught Exception)가 발생했을 때를 위한 안전망(Fallback)
            this.sendToWeb(
                this.protocol.encode(
                    this.createErrorResponse(
                        message,
                        error?.code ?? 'INTERNAL_ERROR',
                        error?.message ?? '네이티브 내부 처리 중 에러가 발생했습니다.',
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
        // payload 전체를 details에 싣지 않고 type/version 중심의 추적 정보만 남깁니다.
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
