import { LemonHmacSigner } from '@chatic/auth-sign';

/**
 * The socket handshake signature — `@chatic/auth-sign` called directly, no web-core shim.
 *
 * Pure in the way that matters: the signer holds no session state (it is a stateless algorithm
 * object), so one instance serves every call and the answer depends only on the arguments. It sat in
 * `sessionAuthAdapter.ts` next to its only consumer, which is also where
 * [`tokenMerge`](./tokenMerge.ts) used to be — that file's own comment cites `calcSignature` as the
 * precedent for "pure helpers are functions in `utils/`", so the two belong in the same place
 * (문서 §파일 배치 규칙).
 */
const authSigner = new LemonHmacSigner();

export const calcSignature = (
    payload: { authId: string; accountId: string; identityId: string; identityToken: string },
    current: string,
    userAgent: string
): string => authSigner.sign(payload, { current, userAgent }).signature;
