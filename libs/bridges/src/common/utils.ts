/**
 * 현재 실행 환경이 네이티브 앱(WebView) 내부인지 확인합니다.
 * Android, iOS(WebKit), React Native WebView 등 기기별 브릿지 주입 여부를 탐지합니다.
 */
export const isNative = (): boolean =>
    typeof window !== 'undefined' &&
    !!(
        window.ReactNativeWebView?.postMessage ||
        window.ChaticMessageHandler?.postMessage ||
        window.webkit?.messageHandlers?.ChaticMessageHandler?.postMessage
    );
