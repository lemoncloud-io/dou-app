import { pairingErrorReason, pairingErrorStatus } from './pairingRequestFlow';

/**
 * Why an approval-side call failed, in the words the approval screen tells apart:
 *
 * - `notFound` — no such code (`check` 404).
 * - `expired` — the code ran out (`400 … pairing expired`).
 * - `codeRefused` — `check` 403: this device asking for its own code, another account having looked it
 *   up first, or a session that is not a device session.
 * - `targetRefused` — `approve` 403: a guest approving its relay account, or nothing to delegate.
 * - `alreadyHandled` — `approve` · `deny` 409: approved or declined already.
 * - `unknown` — anything else, the network included.
 */
export type PairingApprovalError =
    | 'notFound'
    | 'expired'
    | 'codeRefused'
    | 'targetRefused'
    | 'alreadyHandled'
    | 'unknown';

export const classifyPairingError = (operation: 'check' | 'approve' | 'deny', error: unknown): PairingApprovalError => {
    const status = pairingErrorStatus(error);
    if (status === 400 && pairingErrorReason(error).includes('expired')) return 'expired';
    if (status === 404 && operation === 'check') return 'notFound';
    if (status === 403) return operation === 'check' ? 'codeRefused' : 'targetRefused';
    if (status === 409 && operation !== 'check') return 'alreadyHandled';
    return 'unknown';
};
