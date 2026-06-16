import { MessageQueue } from './common';
import { BRIDGE_PROTOCOL_VERSION } from './version';
import { NativeBridgeAdapter, WebBridgeClient } from './web';
import type { IWebBridgeClient } from './web';

/**
 * 웹 런타임에서 공통으로 수입하여 사용하는 싱글톤 브릿지 클라이언트 인스턴스입니다.
 * 기본적으로 실제 기기 통신을 위해 NativeBridgeAdapter가 바인딩되어 있으며,
 * 테스트나 모의(Mock) 환경 구동 시 webClient.setAdapter(new InMemoryAdapter())를 호출하여 동적으로 전송 채널을 교체할 수 있습니다.
 */
export const webClient: IWebBridgeClient = new WebBridgeClient({
    adapter: new NativeBridgeAdapter(),
    version: BRIDGE_PROTOCOL_VERSION,
    timeoutMs: 15000,
    pendingBuffer: new MessageQueue<any>(),
});
