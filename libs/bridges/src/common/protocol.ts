import type { MessageProtocol, AnyBridgeMessage } from './types';

/**
 * 기본적으로 제공되는 JSON 기반 직렬화/역직렬화 프로토콜 구현체입니다.
 */
export const JsonProtocol: MessageProtocol = {
    encode: message => JSON.stringify(message),

    decode: data => {
        try {
            // 데이터가 바이너리(Uint8Array) 형식으로 들어올 경우 문자열로 변환 (React Native 호환 등)
            const text = data instanceof Uint8Array ? new TextDecoder('utf-8').decode(data) : data;

            return JSON.parse(text) as AnyBridgeMessage;
        } catch (error) {
            // 웹뷰 환경에서는 외부 스크립트(확장 프로그램 등)에 의해 잘못된 포맷의 이벤트가 주입될 수 있으므로 예외 처리 필수
            console.error('[JsonProtocol] 메시지 디코딩(파싱) 실패:', error);
            return null;
        }
    },
};
