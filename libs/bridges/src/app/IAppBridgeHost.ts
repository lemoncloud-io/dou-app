import type { PayloadMap } from '../common';

export interface IAppBridgeHost<
    TWebReqMap extends PayloadMap = PayloadMap,
    TAppResMap extends PayloadMap = PayloadMap,
    TAppEvtMap extends PayloadMap = PayloadMap,
> {
    /**
     * Web에서 온 메시지(문자열)를 수신하여 처리합니다.
     */
    handleMessage(data: string): Promise<void>;

    /**
     * 특정 타입의 요청을 처리할 핸들러를 등록합니다.
     */
    registerHandler<K extends keyof TWebReqMap>(
        type: K,
        handler: (
            payload: TWebReqMap[K] extends { data: infer D } ? D : TWebReqMap[K]
        ) => Promise<
            K extends keyof TAppResMap ? (TAppResMap[K] extends { data: infer D } ? D : TAppResMap[K]) : unknown
        >
    ): void;

    /**
     * 등록된 핸들러를 제거합니다.
     */
    unregisterHandler(type: string): void;

    /**
     * Web으로 이벤트를 푸시합니다.
     */
    pushEvent<K extends keyof TAppEvtMap>(
        type: K,
        payload: TAppEvtMap[K] extends { data: infer D } ? D : TAppEvtMap[K],
        version?: string
    ): void;
}
