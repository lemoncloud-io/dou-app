import { logger } from '@chatic/logger';

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
            // 웹뷰 환경에서는 외부 스크립트(확장 프로그램 등)에 의해 잘못된 포맷의 이벤트가 주입될 수 있으므로 예외 처리 필수.
            // 그래서 `error`가 아니라 `debug`다 — 대부분 우리 잘못이 아닌 잡음(확장 프로그램이
            // 주입한 이벤트)이라 서버에 기록할 가치가 없다. debug는 영속 sink 둘 다가 버리므로
            // 릴리스에서는 남지 않고, dev 콘솔에서만 보인다. 우리 메시지가 여기서 깨진다면
            // 그건 호출부가 응답을 못 받아 별도로 드러난다.
            logger.debug('BRIDGE', '[JsonProtocol] failed to decode message', { error });
            return null;
        }
    },
};
