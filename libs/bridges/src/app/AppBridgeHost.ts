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

        // 핸들러가 등록되지 않은 경우 즉시 에러 전송
        if (!handler) {
            const response = {
                type: 'ERROR',
                refId: message.refId,
                version: message.version,
                success: false,
                error: { code: 'NOT_FOUND', message: `등록된 핸들러를 찾을 수 없습니다: ${message.type}` },
            } as unknown as ResponseMessage;
            this.sendToWeb(this.protocol.encode(response) as string);
            return;
        }

        try {
            // 핸들러 실행
            const result = await handler(message);

            // 브릿지 메타데이터만 추가하여 전송
            const response = {
                ...result,
                refId: message.refId,
                version: message.version,
            } as unknown as ResponseMessage;

            this.sendToWeb(this.protocol.encode(response) as string);
        } catch (error: any) {
            // 핸들러 내부에서 예상치 못한 치명적 예외(Uncaught Exception)가 발생했을 때를 위한 안전망(Fallback)
            const response = {
                type: 'ERROR',
                refId: message.refId,
                version: message.version,
                success: false,
                error: {
                    code: error?.code ?? 'INTERNAL_ERROR',
                    message: error?.message ?? '네이티브 내부 처리 중 에러가 발생했습니다.',
                },
            } as unknown as ResponseMessage;

            this.sendToWeb(this.protocol.encode(response) as string);
        }
    }

    private generateRefId(): string {
        return Math.random().toString(36).substring(2, 15);
    }
}
