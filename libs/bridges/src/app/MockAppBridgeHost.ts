import type { EventMessage, RequestMessage, ResponseMessage } from '../common';
import type { BridgeResponseMessage } from '../common/types';
import type { IAppBridgeHost } from './IAppBridgeHost';
import type { WebMessageType, WebMessageData, EventMessageType, AppMessageData } from '@chatic/app-messages';

export class MockAppBridgeHost implements IAppBridgeHost {
    private handlers: Map<string, (message: any) => Promise<any>> = new Map();
    private sendToWeb: (message: string) => void;
    private version = '1.0.0-mock';

    constructor(config: { sendToWeb: (message: string) => void }) {
        this.sendToWeb = config.sendToWeb;
        console.log('[MockAppBridgeHost] 초기화 완료: Web으로 응답을 보낼 Mock 채널과 연결되었습니다.');
    }

    public async handleMessage(data: string): Promise<void> {
        console.log(`[MockAppBridgeHost] Web으로부터 Request 수신:`, data);
        try {
            const message = JSON.parse(data) as RequestMessage;
            const handler = this.handlers.get(message.type);

            if (handler) {
                console.log(`[MockAppBridgeHost] '${message.type}' 핸들러 실행 중...`);
                const result = await handler(message);
                console.log(`[MockAppBridgeHost] 핸들러 실행 성공, Web으로 응답 반환:`, result);

                this.sendSuccessResponse(message, result);
            } else {
                console.warn(`[MockAppBridgeHost] '${message.type}'에 대한 핸들러가 등록되어 있지 않습니다.`);
                this.sendErrorResponse(
                    message,
                    'NOT_FOUND',
                    `Handler for ${message.type} not found in MockAppBridgeHost`
                );
            }
        } catch (e: any) {
            console.error('[MockAppBridgeHost] 메시지 처리 중 오류 발생:', e);
        }
    }

    public registerHandler<K extends WebMessageType>(
        type: K,
        handler: (message: WebMessageData<K>) => Promise<BridgeResponseMessage<K>>
    ): void {
        console.log(`[MockAppBridgeHost] '${String(type)}' 타입 핸들러 등록 완료.`);
        this.handlers.set(type as string, handler);
    }

    public unregisterHandler(type: WebMessageType): void {
        console.log(`[MockAppBridgeHost] '${type}' 타입 핸들러 제거 완료.`);
        this.handlers.delete(type as string);
    }

    public pushEvent<K extends EventMessageType>(message: AppMessageData<K>): void {
        console.log(`[MockAppBridgeHost] Web으로 Event Push 발송:`, message);
        const eventMsg = {
            ...message,
            version: this.version,
            refId: this.generateRefId(),
        } as unknown as EventMessage;
        this.sendToWeb(JSON.stringify(eventMsg));
    }

    private sendSuccessResponse(message: RequestMessage, responsePayload: any): void {
        const response = {
            refId: message.refId,
            version: message.version,
            nonce: message.nonce,
            ...responsePayload,
        } as unknown as ResponseMessage;
        this.sendToWeb(JSON.stringify(response));
    }

    private sendErrorResponse(message: RequestMessage, code: string, errorMessage: string): void {
        const response = {
            type: 'ERROR',
            refId: message.refId,
            version: message.version,
            nonce: message.nonce,
            success: false,
            error: { code, message: errorMessage },
        } as unknown as ResponseMessage;
        this.sendToWeb(JSON.stringify(response));
    }

    private generateRefId(): string {
        return Math.random().toString(36).substring(2, 10);
    }
}
