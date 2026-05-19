import type {
    RequestType,
    EventType,
    ResponseType,
    TypedRequestMessage,
    TypedResponseMessage,
    TypedEventMessage,
} from '../common';
import type { IAppBridgeHost } from './IAppBridgeHost';

/**
 * 단위 테스트 및 로컬 웹 환경에서 App 역할을 대신 수행하는 Mock 구현체입니다.
 * 네이티브 디바이스 없이도 WebClient가 정상적으로 통신하는지 검증할 수 있습니다.
 */
export class MockAppBridgeHost implements IAppBridgeHost {
    private handlers: Map<string, (payload: any) => Promise<any>> = new Map();
    private sendToWeb: (message: string) => void;
    private version = '1.0.0-mock';

    constructor(config: { sendToWeb: (message: string) => void }) {
        this.sendToWeb = config.sendToWeb;
        console.log('[MockAppBridgeHost] 초기화 완료: Web으로 응답을 보낼 Mock 채널과 연결되었습니다.');
    }

    public async handleMessage(data: string): Promise<void> {
        console.log(`[MockAppBridgeHost] Web으로부터 Request 수신:`, data);
        try {
            const message = JSON.parse(data) as TypedRequestMessage<RequestType>;
            const handler = this.handlers.get(message.type);

            if (handler) {
                console.log(`[MockAppBridgeHost] '${message.type}' 핸들러 실행 중...`);
                const result = await handler(message.payload);
                console.log(`[MockAppBridgeHost] 핸들러 실행 성공, Web으로 응답 반환:`, result);

                this.sendSuccessResponse(message.refId, message.version, result, message.type);
            } else {
                console.warn(`[MockAppBridgeHost] '${message.type}'에 대한 핸들러가 등록되어 있지 않습니다.`);
                this.sendErrorResponse(
                    message.refId,
                    message.version,
                    'NOT_FOUND',
                    `Handler for ${message.type} not found in MockAppBridgeHost`
                );
            }
        } catch (e: any) {
            console.error('[MockAppBridgeHost] 메시지 처리 중 오류 발생:', e);
        }
    }

    public registerHandler<K extends RequestType>(type: K, handler: (payload: any) => Promise<any>): void {
        console.log(`[MockAppBridgeHost] '${String(type)}' 타입 핸들러 등록 완료.`);
        this.handlers.set(type as string, handler);
    }

    public unregisterHandler(type: RequestType): void {
        console.log(`[MockAppBridgeHost] '${type}' 타입 핸들러 제거 완료.`);
        this.handlers.delete(type as string);
    }

    public pushEvent<K extends EventType>(type: K, payload: any, version?: string): void {
        console.log(`[MockAppBridgeHost] Web으로 Event Push 발송: '${String(type)}'`, payload);
        const message: TypedEventMessage<K> = {
            type,
            version: version ?? this.version,
            refId: this.generateRefId(),
            payload,
        };
        this.sendToWeb(JSON.stringify(message));
    }

    private sendSuccessResponse(refId: string, version: string, data: any, requestType: string): void {
        const response = {
            type: requestType,
            refId,
            version,
            success: true,
            data,
        } as unknown as TypedResponseMessage<ResponseType>;
        this.sendToWeb(JSON.stringify(response));
    }

    private sendErrorResponse(refId: string, version: string, code: string, message: string): void {
        const response = {
            type: 'ERROR',
            refId,
            version,
            success: false,
            error: { code, message },
        } as unknown as TypedResponseMessage<ResponseType>;
        this.sendToWeb(JSON.stringify(response));
    }

    private generateRefId(): string {
        return Math.random().toString(36).substring(2, 10);
    }
}
