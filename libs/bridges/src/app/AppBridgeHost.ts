import type { EventMessage, MessageProtocol, RequestMessage, ResponseMessage, PayloadMap } from '../common';
import { JsonProtocol } from '../common';
import type { IAppBridgeHost } from './IAppBridgeHost';

export interface AppBridgeHostConfig {
    protocol?: MessageProtocol;
    sendToWeb: (message: string) => void;
    version?: string;
}

export class AppBridgeHost<
    TWebReqMap extends PayloadMap = PayloadMap,
    TAppResMap extends PayloadMap = PayloadMap,
    TAppEvtMap extends PayloadMap = PayloadMap,
> implements IAppBridgeHost<TWebReqMap, TAppResMap, TAppEvtMap>
{
    private protocol: MessageProtocol;
    private sendToWeb: (message: string) => void;
    private handlers: Map<string, (payload: any) => Promise<any>> = new Map();

    constructor(config: AppBridgeHostConfig) {
        this.protocol = config.protocol ?? JsonProtocol;
        this.sendToWeb = config.sendToWeb;
    }

    public async handleMessage(data: string): Promise<void> {
        try {
            const parsed = this.protocol.decode(data) as RequestMessage;
            if (parsed && typeof parsed.type === 'string') {
                await this.processRequest(parsed);
            }
        } catch (error) {
            console.error('[AppBridgeHost] Failed to parse or process message:', error);
        }
    }

    public registerHandler<K extends keyof TWebReqMap>(
        type: K,
        handler: (
            payload: TWebReqMap[K] extends { data: infer D } ? D : TWebReqMap[K]
        ) => Promise<
            K extends keyof TAppResMap ? (TAppResMap[K] extends { data: infer D } ? D : TAppResMap[K]) : unknown
        >
    ): void {
        this.handlers.set(type as string, handler as any);
    }

    public unregisterHandler(type: string): void {
        this.handlers.delete(type);
    }

    public pushEvent<K extends keyof TAppEvtMap>(
        type: K,
        payload: TAppEvtMap[K] extends { data: infer D } ? D : TAppEvtMap[K],
        version = '2.0.0'
    ): void {
        const message: EventMessage = { type: type as string, version, payload };
        const encoded = this.protocol.encode(message);
        this.sendToWeb(encoded as string);
    }

    private async processRequest(message: RequestMessage): Promise<void> {
        const handler = this.handlers.get(message.type);
        if (!handler) {
            if (message.refId) {
                this.sendErrorResponse(
                    message.refId,
                    message.version,
                    'NOT_FOUND',
                    `No handler registered for type: ${message.type}`
                );
            } else {
                console.warn(`[AppBridgeHost] Unhandled fire-and-forget message type: ${message.type}`);
            }
            return;
        }

        try {
            const data = await handler(message.payload);
            if (message.refId) {
                this.sendSuccessResponse(message.refId, message.version, data);
            }
        } catch (error: any) {
            if (message.refId) {
                this.sendErrorResponse(
                    message.refId,
                    message.version,
                    error?.code ?? 'INTERNAL_ERROR',
                    error?.message ?? 'An internal error occurred'
                );
            }
        }
    }

    private sendSuccessResponse(refId: string, version: string, data: any): void {
        const response: ResponseMessage = { type: 'RESPONSE', refId, version, success: true, data };
        this.sendToWeb(this.protocol.encode(response) as string);
    }

    private sendErrorResponse(refId: string, version: string, code: string, message: string): void {
        const response: ResponseMessage = {
            type: 'RESPONSE',
            refId,
            version,
            success: false,
            error: { code, message },
        };
        this.sendToWeb(this.protocol.encode(response) as string);
    }
}
