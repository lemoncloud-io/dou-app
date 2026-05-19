import type {
    EventMessage,
    EventMessageType,
    MessageProtocol,
    RequestMessage,
    ResponseMessage,
    WebMessageType,
} from '../common';
import { JsonProtocol } from '../common';
import type { ExtractEvtData, ExtractReqData, ExtractResData, IAppBridgeHost } from './IAppBridgeHost';

export interface AppBridgeHostConfig {
    protocol?: MessageProtocol;
    sendToWeb: (message: string) => void;
    version?: string;
}

export class AppBridgeHost implements IAppBridgeHost {
    private protocol: MessageProtocol;
    private sendToWeb: (message: string) => void;
    private version: string;

    private handlers: Map<string, (payload: any) => Promise<any>> = new Map();

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
        handler: (payload: ExtractReqData<K>) => Promise<ExtractResData<K>>
    ): void {
        this.handlers.set(type as string, handler);
    }

    public unregisterHandler(type: WebMessageType): void {
        this.handlers.delete(type as string);
    }

    public pushEvent<K extends EventMessageType>(type: K, payload: ExtractEvtData<K>, version?: string): void {
        const message = {
            type,
            version: version ?? this.version,
            refId: this.generateRefId(),
            data: payload, // 호환성을 위해 data 필드 내부에 탑재
        } as unknown as EventMessage;

        const encoded = this.protocol.encode(message);
        this.sendToWeb(encoded as string);
    }

    private async processRequest(message: RequestMessage): Promise<void> {
        const handler = this.handlers.get(message.type);

        if (!handler) {
            this.sendErrorResponse(message, 'NOT_FOUND', `등록된 핸들러를 찾을 수 없습니다: ${message.type}`);
            return;
        }

        try {
            const payload = (message as any).data !== undefined ? (message as any).data : undefined;
            const result = await handler(payload);

            this.sendSuccessResponse(message, result);
        } catch (error: any) {
            this.sendErrorResponse(
                message,
                error?.code ?? 'INTERNAL_ERROR',
                error?.message ?? '네이티브 내부 처리 중 에러가 발생했습니다.'
            );
        }
    }

    private sendSuccessResponse(message: RequestMessage, data: any): void {
        const response = {
            type: `${message.type}`,
            refId: message.refId,
            version: message.version,
            nonce: message.nonce, // 이전 버전 호환성을 위한 에코(Echo)
            success: true,
            data,
        } as unknown as ResponseMessage;

        this.sendToWeb(this.protocol.encode(response) as string);
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

        this.sendToWeb(this.protocol.encode(response) as string);
    }

    private generateRefId(): string {
        return Math.random().toString(36).substring(2, 15);
    }
}
