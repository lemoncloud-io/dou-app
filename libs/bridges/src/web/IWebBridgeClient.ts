import type { PayloadMap } from '../common';

export interface IWebBridgeClient<
    TWebReqMap extends PayloadMap = PayloadMap,
    TAppResMap extends PayloadMap = PayloadMap,
    TAppEvtMap extends PayloadMap = PayloadMap,
> {
    /**
     * [Web -> App] 응답을 기다리지 않는 단방향 전송 (Fire-and-Forget)
     */
    post<K extends keyof TWebReqMap>(
        type: K,
        payload?: TWebReqMap[K] extends { data: infer D } ? D : TWebReqMap[K]
    ): void;

    /**
     * [Web -> App] 앱에 요청을 보내고 결과를 비동기로 대기 (Request-Response)
     */
    request<K extends keyof TWebReqMap>(
        type: K,
        payload?: TWebReqMap[K] extends { data: infer D } ? D : TWebReqMap[K],
        customTimeoutMs?: number
    ): Promise<{
        data: K extends keyof TAppResMap ? (TAppResMap[K] extends { data: infer D } ? D : TAppResMap[K]) : unknown;
    }>;

    /**
     * `request`의 별칭 (alias)
     */
    send<K extends keyof TWebReqMap>(
        message: {
            type: K;
            payload?: TWebReqMap[K] extends { data: infer D } ? D : TWebReqMap[K];
        },
        customTimeoutMs?: number
    ): Promise<{
        data: K extends keyof TAppResMap ? (TAppResMap[K] extends { data: infer D } ? D : TAppResMap[K]) : unknown;
    }>;

    /**
     * [App -> Web] 이벤트 구독
     */
    onEvent<K extends keyof TAppEvtMap>(
        type: K,
        handler: (payload: TAppEvtMap[K] extends { data: infer D } ? D : TAppEvtMap[K]) => void
    ): () => void;
}
