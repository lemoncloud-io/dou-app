import { useCallback, useRef, useState } from 'react';

import { runtime } from '@chatic/app-runtime';
import type { PairingCheckView, PairingTarget } from '@chatic/http';

export type PairingApprovalStep =
    | { step: 'input' }
    | { step: 'checking' }
    | { step: 'confirm'; check: PairingCheckView }
    | { step: 'deciding'; check: PairingCheckView }
    | { step: 'approved' }
    | { step: 'denied' };

const PAIRING_CODE_LENGTH = 8;

/**
 * The approving device's side: a code typed (or scanned) in, looked up once it has all eight digits,
 * then approved for a chosen target or declined.
 *
 * The code keeps digits only — people paste it as shown (`0734-4168`) or with spaces — and the same
 * eight digits are never looked up twice in a row: a lookup is the relay's claim that this account saw
 * the code, so a second one for the same code only earns a 403.
 */
export const usePairingApproval = () => {
    const { pairing } = runtime.data.useRuntimeRepositories();
    const [code, setCodeState] = useState('');
    const [state, setState] = useState<PairingApprovalStep>({ step: 'input' });
    const [error, setError] = useState<runtime.session.PairingApprovalError | null>(null);
    const lastLookedUp = useRef<string | null>(null);

    const lookUp = useCallback(
        async (digits: string) => {
            lastLookedUp.current = digits;
            setError(null);
            setState({ step: 'checking' });
            try {
                setState({ step: 'confirm', check: await pairing.checkPairing(digits) });
            } catch (e) {
                setError(runtime.session.classifyPairingError('check', e));
                setState({ step: 'input' });
            }
        },
        [pairing]
    );

    const setCode = useCallback(
        (raw: string) => {
            const digits = raw.replace(/\D/g, '').slice(0, PAIRING_CODE_LENGTH);
            setCodeState(digits);
            if (digits.length < PAIRING_CODE_LENGTH) {
                lastLookedUp.current = null;
                setError(null);
                return;
            }
            if (digits !== lastLookedUp.current) void lookUp(digits);
        },
        [lookUp]
    );

    const decide = useCallback(
        async (decision: { target: PairingTarget } | 'deny') => {
            if (state.step !== 'confirm') return;
            const { check } = state;
            setError(null);
            setState({ step: 'deciding', check });
            try {
                if (decision === 'deny') {
                    await pairing.denyPairing(check.pairingId);
                    setState({ step: 'denied' });
                } else {
                    await pairing.approvePairing(check.pairingId, decision.target);
                    setState({ step: 'approved' });
                }
            } catch (e) {
                setError(runtime.session.classifyPairingError(decision === 'deny' ? 'deny' : 'approve', e));
                setState({ step: 'confirm', check });
            }
        },
        [pairing, state]
    );

    /** Looks the current code up again — after a network failure, the same eight digits are still worth asking. */
    const retry = useCallback(() => {
        if (code.length === PAIRING_CODE_LENGTH) void lookUp(code);
    }, [code, lookUp]);

    const reset = useCallback(() => {
        lastLookedUp.current = null;
        setCodeState('');
        setError(null);
        setState({ step: 'input' });
    }, []);

    return {
        code,
        setCode,
        state,
        error,
        approve: (target: PairingTarget) => decide({ target }),
        deny: () => decide('deny'),
        retry,
        reset,
    };
};
