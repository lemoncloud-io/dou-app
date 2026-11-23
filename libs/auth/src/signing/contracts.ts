export interface SignaturePayload {
    authId: string;
    accountId: string;
    identityId: string;
}

export interface SignatureContext {
    current: string;
    userAgent: string;
}

export interface AuthSignResult {
    signature: string;
    current: string;
}

export interface IAuthSigner {
    sign(payload: SignaturePayload, context: SignatureContext): AuthSignResult;
}
