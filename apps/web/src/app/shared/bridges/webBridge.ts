import type { IWebBridgeClient } from '@chatic/bridges';
import { NativeBridgeAdapter, WebBridgeClient } from '@chatic/bridges';

/**
 * 웹 애플리케이션 전역에서 사용될 `WebBridgeClient` 인스턴스입니다.
 * `NativeBridgeAdapter`를 사용하여 실제 네이티브 환경과 통신합니다.
 *
 * @example
 * import { webBridge } from '@/app/shared/bridges/webBridge';
 *
 * // App으로 데이터 요청
 * const userInfo = await webBridge.request('app.user.info.get');
 *
 * // App에서 오는 이벤트 수신
 * const unsubscribe = webBridge.onEvent('app.theme.changed', (payload) => {
 *   console.log('Theme changed:', payload.theme);
 * });
 */
export const webBridge: IWebBridgeClient = new WebBridgeClient({
    adapter: new NativeBridgeAdapter(),
    version: '2.0.0',
    timeoutMs: 15_000,
});
