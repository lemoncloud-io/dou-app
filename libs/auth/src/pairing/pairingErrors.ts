import { pairingErrorReason, pairingErrorStatus } from './pairingRequestFlow';

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
