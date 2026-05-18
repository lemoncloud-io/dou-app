export interface BaseMessage {
    type: string;
    refId?: string;
    version: string;
}

export interface RequestMessage<TPayload = unknown> extends BaseMessage {
    payload?: TPayload;
}

export interface BridgeError {
    code: string;
    message: string;
    details?: unknown;
}

export type ResponseMessage<TData = unknown> = BaseMessage & {
    refId: string;
} & ({ success: true; data: TData } | { success: false; error: BridgeError });

export interface EventMessage<TPayload = unknown> extends BaseMessage {
    payload: TPayload;
}

/**
 * MessageMap 타입 제약: 키는 문자열, 값은 페이로드(데이터) 타입
 */
export type PayloadMap = Record<string, any>;
