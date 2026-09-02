export interface SignaturePayload {
    /** HMAC 1차 키. relay 소켓은 `$auth.id`, cloud 소켓·HTTP refresh는 `Token.authId` — 선택은
     * 소비자 소관(signing.md §1). 이 lib은 받은 값으로 계산만 한다. */
    authId: string;
    accountId: string;
    identityId: string;
    /** 계약 호환용 잔재 — 서명식은 이 값을 절대 읽지 않는다(data 4번째 슬롯은 `''` 고정). */
    identityToken: string;
}

export interface SignatureContext {
    /** ISO 8601. 호출자가 생성 — 서명에 들어간 값과 패킷/body의 `current`가 같아야 서버 검증이
     * 통과한다. */
    current: string;
    /** 전송 계층이 실제로 보내는 User-Agent. 전역(navigator) 읽기 금지 — 반드시 주입. */
    userAgent: string;
}

export interface AuthSignResult {
    signature: string;
    /** 입력 context.current의 에코 — SDK sign callback 반환형 {signature, current}에 맞춘 편의. */
    current: string;
}

export interface IAuthSigner {
    sign(payload: SignaturePayload, context: SignatureContext): AuthSignResult;
}
