/**
 * 브릿지 통신에서 사용되는 모든 메시지의 최상위 기본 규격(Base)입니다.
 */
export type BaseMessage = {
    refId?: string;
    version?: string;
    nonce?: string;
};
