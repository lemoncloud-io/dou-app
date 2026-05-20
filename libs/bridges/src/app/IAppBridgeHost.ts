import type { WebMessageType, WebMessageData, EventMessageType, AppMessageData } from '@chatic/app-messages';
import type { BridgeResponseMessage } from '../common';

/**
 * App(Native) 환경에서 Web(React 등)의 요청을 수신하고 처리하는 호스트(Host) 인터페이스입니다.
 */
export interface IAppBridgeHost {
    /**
     * [Web -> App] 브릿지 채널(WebView)을 통해 들어온 문자열 데이터를 파싱하고 알맞은 핸들러로 라우팅합니다.
     */
    handleMessage(data: string): Promise<void>;

    /**
     * [Web -> App] 특정 RequestType에 대한 비즈니스 로직(핸들러)을 등록합니다.
     * Web에서 해당 타입의 요청이 오면 이 핸들러가 실행되며, 반환값은 자동으로 Web으로 응답(Response)됩니다.
     */
    registerHandler<K extends WebMessageType>(
        type: K,
        handler: (message: WebMessageData<K>) => Promise<BridgeResponseMessage<K>>
    ): void;

    /**
     * 등록된 특정 핸들러를 제거합니다.
     */
    unregisterHandler(type: WebMessageType): void;

    /**
     * [App -> Web] Web의 요청 없이 App(Native)에서 자발적으로 발생하는 단방향 이벤트를 푸시합니다.
     */
    pushEvent<K extends EventMessageType>(message: AppMessageData<K>): void;
}
