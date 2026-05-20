import type { RequestMessage, ResponseMessage, EventMessage } from './types';
import type { BaseMessage } from '@chatic/app-messages'; // 실제 경로에 맞게 수정

/**
 * 브릿지 통신을 통해 오갈 수 있는 모든 메시지 규격의 유니온 타입입니다.
 */
export type AnyBridgeMessage = RequestMessage | ResponseMessage | EventMessage;

/**
 * Web과 App 간 메시지를 주고받을 때 데이터의 직렬화(인코딩)와 역직렬화(디코딩)를 담당하는 프로토콜 인터페이스입니다.
 */
export interface MessageProtocol {
    /**
     * [Serialize] 객체를 브릿지 전송 포맷(문자열 또는 바이너리)으로 인코딩합니다.
     * @param message 전송할 메시지 객체 (Request, Response, Event 중 하나)
     * @returns 직렬화된 문자열 또는 바이트 배열
     */
    encode(message: AnyBridgeMessage | BaseMessage): string | Uint8Array;

    /**
     * [Deserialize] 브릿지 수신 데이터(문자열 또는 바이너리)를 파싱하여 메시지 객체로 디코딩합니다.
     * @param data 수신된 직렬화 데이터
     * @returns 파싱 완료된 메시지 객체 (파싱 실패 시 null)
     */
    decode(data: string | Uint8Array): AnyBridgeMessage | null;
}

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
