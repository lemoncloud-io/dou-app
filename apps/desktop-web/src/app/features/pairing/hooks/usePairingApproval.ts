import { useCallback, useRef, useState } from 'react';

import { runtime } from '@chatic/app-runtime';

import { PAIRING_CODE_LENGTH, normalizePairingCode } from '../utils/pairingCode';
import type { PairingCheck, PairingTarget } from '../utils/types';

export type PairingApprovalError = ReturnType<typeof runtime.session.classifyPairingError>;

export type PairingApprovalStep =
    | { step: 'input' }
    | { step: 'checking' }
    | { step: 'confirm'; check: PairingCheck }
    | { step: 'deciding'; check: PairingCheck };

type LookupResult = { check: PairingCheck } | { error: PairingApprovalError };

/**
 * The approving device's side of a pairing: a code typed or pasted in, looked up once it has all eight
 * digits, then approved for a chosen target or declined.
 *
 * Each code is looked up at most once per visit. A lookup is the relay's record that this account saw
 * the code, so a second one for the same code only earns a refusal; editing the field and typing the
 * same code back shows what the first lookup said instead. The one exception is a lookup that failed
 * for no reason the relay gave (the network, most likely), where trying again is the remedy.
 *
 * `onDecided` runs after the relay accepted the approval or the refusal — the screen leaves from there.
 */
export const usePairingApproval = ({ onDecided }: { onDecided: (decision: 'approved' | 'denied') => void }) => {
    const { pairing } = runtime.data.useRuntimeRepositories();
    const [code, setCodeState] = useState('');
    const [state, setState] = useState<PairingApprovalStep>({ step: 'input' });
    const [error, setError] = useState<PairingApprovalError | null>(null);
    const results = useRef(new Map<string, LookupResult>());
    // The code the field holds now; a lookup answering for a code that is no longer there is dropped.
    const current = useRef('');

    const show = useCallback((result: LookupResult) => {
        if ('check' in result) {
            setError(null);
            setState({ step: 'confirm', check: result.check });
        } else {
            setError(result.error);
            setState({ step: 'input' });
        }
    }, []);

    const lookUp = useCallback(
        async (digits: string) => {
            setError(null);
            setState({ step: 'checking' });
            let result: LookupResult;
            try {
                result = { check: await pairing.checkPairing(digits) };
            } catch (e) {
                result = { error: runtime.session.classifyPairingError('check', e) };
            }
            if (!('error' in result) || result.error !== 'unknown') results.current.set(digits, result);
            if (current.current === digits) show(result);
        },
        [pairing, show]
    );

    const setCode = useCallback(
        (raw: string) => {
            const digits = normalizePairingCode(raw);
            current.current = digits;
            setCodeState(digits);
            if (digits.length < PAIRING_CODE_LENGTH) {
                setError(null);
                setState({ step: 'input' });
                return;
            }
            const known = results.current.get(digits);
            if (known) show(known);
            else void lookUp(digits);
        },
        [lookUp, show]
    );

    const decide = useCallback(
        async (decision: { target: PairingTarget } | 'deny') => {
            if (state.step !== 'confirm') return;
            const { check } = state;
            setError(null);
            setState({ step: 'deciding', check });
            try {
                if (decision === 'deny') await pairing.denyPairing(check.pairingId);
                else await pairing.approvePairing(check.pairingId, decision.target);
            } catch (e) {
                setError(runtime.session.classifyPairingError(decision === 'deny' ? 'deny' : 'approve', e));
                setState({ step: 'confirm', check });
                return;
            }
            onDecided(decision === 'deny' ? 'denied' : 'approved');
        },
        [pairing, state, onDecided]
    );

    /** Back to an empty field, for another code. What was looked up stays remembered. */
    const reset = useCallback(() => {
        current.current = '';
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
        reset,
    };
};
