import type {
    MessageProtocol,
    RequestType,
    EventType,
    ResponseType,
    TypedRequestMessage,
    TypedResponseMessage,
    TypedEventMessage,
} from '../common';
import { JsonProtocol } from '../common';
import type { IAppBridgeHost } from './IAppBridgeHost';

export interface AppBridgeHostConfig {
    /** 데이터를 직렬화/역직렬화할 프로토콜 (기본값: JSON) */
    protocol?: MessageProtocol;
    /** 처리된 응답이나 이벤트를 실제 Web(WebView)으로 전송(주입)하는 네이티브 콜백 함수 */
    sendToWeb: (message: string) => void;
    /** 브릿지 통신 규약 버전 */
    version?: string;
}

/**
 * 실제 모바일 디바이스(iOS, Android) 환경에서 구동되는 브릿지 호스트 구현체입니다.
 */
export class AppBridgeHost implements IAppBridgeHost {
    private protocol: MessageProtocol;
    private sendToWeb: (message: string) => void;
    private version: string;

    /** RequestType을 키로 하여 비동기 처리 함수(핸들러)를 저장하는 맵 */
    private handlers: Map<string, (payload: any) => Promise<any>> = new Map();

    constructor(config: AppBridgeHostConfig) {
        this.protocol = config.protocol ?? JsonProtocol;
        this.sendToWeb = config.sendToWeb;
        this.version = config.version ?? '2.0.0';
    }

    public async handleMessage(data: string): Promise<void> {
        try {
            // Web에서 온 메시지를 Request 객체로 파싱
            const parsed = this.protocol.decode(data) as TypedRequestMessage<RequestType>;
            if (parsed && typeof parsed.type === 'string') {
                await this.processRequest(parsed);
            }
        } catch (error) {
            console.error('[AppBridgeHost] 메시지 파싱 또는 처리 실패:', error);
        }
    }

    public registerHandler<K extends RequestType>(type: K, handler: (payload: any) => Promise<any>): void {
        this.handlers.set(type as string, handler);
    }

    public unregisterHandler(type: RequestType): void {
        this.handlers.delete(type);
    }

    public pushEvent<K extends EventType>(type: K, payload: any, version?: string): void {
        const message: TypedEventMessage<K> = {
            type,
            version: version ?? this.version,
            refId: this.generateRefId(), // 이벤트도 BaseMessage 규약(refId 필수)을 따름
            payload,
        };
        const encoded = this.protocol.encode(message);
        this.sendToWeb(encoded as string);
    }

    /** 내부 비즈니스 로직 처리 및 라우팅 */
    private async processRequest(message: TypedRequestMessage<RequestType>): Promise<void> {
        const handler = this.handlers.get(message.type);

        // 1. 등록된 핸들러가 없는 경우 에러 반환
        if (!handler) {
            this.sendErrorResponse(
                message.refId,
                message.version,
                'NOT_FOUND',
                `등록된 핸들러를 찾을 수 없습니다: ${message.type}`
            );
            return;
        }

        // 2. 핸들러 실행 및 결과 반환
        try {
            const data = await handler(message.payload);
            this.sendSuccessResponse(message.refId, message.version, data, message.type);
        } catch (error: any) {
            // 3. 실행 도중 예외 발생 시 에러 반환
            this.sendErrorResponse(
                message.refId,
                message.version,
                error?.code ?? 'INTERNAL_ERROR',
                error?.message ?? '네이티브 내부 처리 중 에러가 발생했습니다.'
            );
        }
    }

    /** 성공 응답 포맷팅 및 전송 */
    private sendSuccessResponse(refId: string, version: string, data: any, requestType: string): void {
        const response = {
            type: requestType, // Web은 refId로 추적하므로 추적 용도로 requestType 반환
            refId,
            version,
            success: true,
            data,
        } as unknown as TypedResponseMessage<ResponseType>;

        this.sendToWeb(this.protocol.encode(response) as string);
    }

    /** 실패/에러 응답 포맷팅 및 전송 */
    private sendErrorResponse(refId: string, version: string, code: string, message: string): void {
        const response = {
            type: 'ERROR',
            refId,
            version,
            success: false,
            error: { code, message },
        } as unknown as TypedResponseMessage<ResponseType>;

        this.sendToWeb(this.protocol.encode(response) as string);
    }

    /** 고유 식별자 생성기 (Event Push용) */
    private generateRefId(): string {
        return Math.random().toString(36).substring(2, 15);
    }
}
