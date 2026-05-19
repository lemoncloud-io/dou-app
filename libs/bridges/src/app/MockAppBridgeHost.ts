import type { PayloadMap, ResponseMessage } from '../common';
import type { IAppBridgeHost } from './IAppBridgeHost';

/**
 * AppBridgeHost의 Mock 구현체입니다.
 * 실제 AppBridgeHost와 동일한 로직을 가지지만,
 * 테스트 환경에서 사용하기 용이하도록 만들어졌습니다.
 */
export class MockAppBridgeHost<
    TWebReqMap extends PayloadMap = PayloadMap,
    TAppResMap extends PayloadMap = PayloadMap,
    TAppEvtMap extends PayloadMap = PayloadMap,
> implements IAppBridgeHost<TWebReqMap, TAppResMap, TAppEvtMap>
{
    private handlers: Map<string, (payload: any) => Promise<any>> = new Map();
    private sendToWeb: (message: string) => void;

    constructor(config: { sendToWeb: (message: string) => void }) {
        this.sendToWeb = config.sendToWeb;
        console.log('[MockAppBridgeHost] 초기화 및 Web으로 응답을 보낼 채널과 연결되었습니다.');
    }

    public async handleMessage(data: string): Promise<void> {
        console.log(`[MockAppBridgeHost] 메시지 수신 시도:`, data);
        try {
            const message = JSON.parse(data);
            console.log(`[MockAppBridgeHost] 메시지 파싱 성공: type=${message.type}`);

            const handler = this.handlers.get(message.type);

            if (handler) {
                console.log(`[MockAppBridgeHost] '${message.type}'에 대한 핸들러를 찾았습니다. 실행합니다.`);
                const result = await handler(message.payload);
                console.log(`[MockAppBridgeHost] 핸들러 실행 완료. 결과:`, result);
                if (message.refId) {
                    this.sendSuccessResponse(message.refId, message.version, result);
                }
            } else {
                console.warn(`[MockAppBridgeHost] '${message.type}'에 대한 핸들러를 찾을 수 없습니다.`);
                if (message.refId) {
                    this.sendErrorResponse(
                        message.refId,
                        message.version,
                        'NOT_FOUND',
                        `Handler for ${message.type} not found in MockAppBridgeHost`
                    );
                }
            }
        } catch (e: any) {
            console.error('[MockAppBridgeHost] 메시지 처리 중 오류 발생:', e);
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
        console.log(`[MockAppBridgeHost] '${String(type)}' 타입에 대한 핸들러를 등록합니다.`);
        this.handlers.set(type as string, handler as any);
    }

    public unregisterHandler(type: string): void {
        console.log(`[MockAppBridgeHost] '${type}' 타입의 핸들러를 제거합니다.`);
        this.handlers.delete(type);
    }

    public pushEvent<K extends keyof TAppEvtMap>(
        type: K,
        payload: TAppEvtMap[K] extends { data: infer D } ? D : TAppEvtMap[K],
        version = '1.0.0-mock'
    ): void {
        console.log(`[MockAppBridgeHost] PUSH_EVENT: '${String(type)}'`, { payload, version });
        const message = { type: type as string, version, payload };
        this.sendToWeb(JSON.stringify(message));
    }

    private sendSuccessResponse(refId: string, version: string, data: any): void {
        const response: ResponseMessage = { type: 'RESPONSE', refId, version, success: true, data };
        this.sendToWeb(JSON.stringify(response));
    }

    private sendErrorResponse(refId: string, version: string, code: string, message: string): void {
        const response: ResponseMessage = {
            type: 'RESPONSE',
            refId,
            version,
            success: false,
            error: { code, message },
        };
        this.sendToWeb(JSON.stringify(response));
    }
}
