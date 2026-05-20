import type { EventMessage, MessageProtocol, RequestMessage, ResponseMessage } from '../common';
import { JsonProtocol } from '../common';
import type { BridgeResponseMessage } from '../common/types';
import type { AppMessageData, EventMessageType, WebMessageData, WebMessageType } from '@chatic/app-messages';
import type { IAppBridgeHost } from './IAppBridgeHost';

export interface AppBridgeHostConfig {
    protocol?: MessageProtocol;
    sendToWeb: (message: string) => void;
    version?: string;
}

export class AppBridgeHost implements IAppBridgeHost {
    private protocol: MessageProtocol;
    private sendToWeb: (message: string) => void;
    private version: string;

    private handlers: Map<string, (message: any) => Promise<any>> = new Map();

    constructor(config: AppBridgeHostConfig) {
        this.protocol = config.protocol ?? JsonProtocol;
        this.sendToWeb = config.sendToWeb;
        this.version = config.version ?? '2.0.0';
    }

    public async handleMessage(data: string): Promise<void> {
        try {
            const parsed = this.protocol.decode(data) as RequestMessage;
            if (parsed && typeof parsed.type === 'string') {
                await this.processRequest(parsed);
            }
        } catch (error) {
            console.error('[AppBridgeHost] 메시지 파싱 또는 처리 실패:', error);
        }
    }

    public registerHandler<K extends WebMessageType>(
        type: K,
        handler: (message: WebMessageData<K>) => Promise<BridgeResponseMessage<K>>
    ): void {
        this.handlers.set(type as string, handler);
    }

    public unregisterHandler(type: WebMessageType): void {
        this.handlers.delete(type as string);
    }

    public pushEvent<K extends EventMessageType>(message: AppMessageData<K>): void {
        const eventMsg = {
            ...message, // 전개 연산자를 위로 배치하여 덮어쓰기 방지
            version: this.version,
            refId: this.generateRefId(),
        } as unknown as EventMessage;

        const encoded = this.protocol.encode(eventMsg);
        this.sendToWeb(encoded as string);
    }

    private async processRequest(message: RequestMessage): Promise<void> {
        const handler = this.handlers.get(message.type);

        if (!handler) {
            this.sendErrorResponse(message, 'NOT_FOUND', `등록된 핸들러를 찾을 수 없습니다: ${message.type}`);
            return;
        }

        try {
            const result = await handler(message);
            this.sendSuccessResponse(message, result);
        } catch (error: any) {
            this.sendErrorResponse(
                message,
                error?.code ?? 'INTERNAL_ERROR',
                error?.message ?? '네이티브 내부 처리 중 에러가 발생했습니다.'
            );
        }
    }

    private sendSuccessResponse(message: RequestMessage, responsePayload: any): void {
        const response = {
            ...responsePayload, // 전개 연산자를 위로 배치
            refId: message.refId,
            version: message.version,
            nonce: message.nonce,
        } as unknown as ResponseMessage;

        this.sendToWeb(this.protocol.encode(response) as string);
    }

    private sendErrorResponse(message: RequestMessage, code: string, errorMessage: string): void {
        const response = {
            ...message,
            refId: message.refId,
            version: message.version,
            nonce: message.nonce,
            success: false,
            error: { code, message: errorMessage },
        } as unknown as ResponseMessage;

        this.sendToWeb(this.protocol.encode(response) as string);
    }

    private generateRefId(): string {
        return Math.random().toString(36).substring(2, 15);
    }
}
