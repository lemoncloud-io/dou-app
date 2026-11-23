import { LemonHmacSigner } from '../../signing';

const authSigner = new LemonHmacSigner();

export const calcSignature = (
    payload: { authId: string; accountId: string; identityId: string },
    current: string,
    userAgent: string
): string => authSigner.sign(payload, { current, userAgent }).signature;
