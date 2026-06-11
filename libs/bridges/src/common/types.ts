import type { AppMessage, BaseMessage, BridgeResponseMessage, WebMessage } from '@chatic/app-messages';

export type RequestMessage = WebMessage;
export type EventMessage = AppMessage;
export type ResponseMessage = BridgeResponseMessage;

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

export interface IMessageQueue<T> {
    enqueue(item: T): void;
    dequeue(): T | undefined;
    isEmpty(): boolean;
    size(): number;
    clear(): void;
    getAll(): T[];
}

export interface BridgeFailureConfig {
    code?: string;
    message?: string;
    recoverable?: boolean;
}

export interface EnvironmentConfig {
    /** Web -> App -> Web 왕복 지연 시간입니다. */
    rttDelayMs?: number;
    /** true면 App host를 거치지 않고 모든 request에 bridge-level 실패 응답을 반환합니다. */
    forceFailure?: boolean | BridgeFailureConfig;
    /** true면 request를 App host로 보내지 않아 WebBridgeClient timeout을 검증할 수 있습니다. */
    timeoutMode?: boolean;
    /** 0~1 사이 값. 해당 확률로 메시지를 드롭합니다. */
    dropRate?: number;
    /** true면 response type mismatch를 강제로 발생시킵니다. */
    responseTypeMismatch?: boolean | string;
    /** true면 malformed bridge response를 강제로 발생시킵니다. */
    malformedResponse?: boolean;
    random?: () => number;
}
