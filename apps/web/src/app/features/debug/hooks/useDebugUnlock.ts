import { useCallback, useEffect, useRef, useState } from 'react';

import { DEBUG_CODE_MAX_ATTEMPTS } from '../consts';
import { verifyDebugCode } from '../lib/verifyDebugCode';
import { setDebugModeEnabled } from './useDebugMode';

const TAP_THRESHOLD = 10;
const TAP_RESET_MS = 3000;

export const useDebugUnlock = (expectedCode: string | undefined) => {
    const [isChallengeOpen, setChallengeOpen] = useState(false);
    const [hasError, setHasError] = useState(false);
    const tapCountRef = useRef(0);
    const attemptsRef = useRef(0);
    const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
        };
    }, []);

    const reset = useCallback(() => {
        tapCountRef.current = 0;
        attemptsRef.current = 0;
        setChallengeOpen(false);
        setHasError(false);
    }, []);

    const registerTap = useCallback(() => {
        tapCountRef.current += 1;
        if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
        tapTimerRef.current = setTimeout(() => {
            tapCountRef.current = 0;
        }, TAP_RESET_MS);

        if (tapCountRef.current >= TAP_THRESHOLD) {
            tapCountRef.current = 0;
            if (expectedCode) setChallengeOpen(true);
        }
    }, [expectedCode]);

    const submitCode = useCallback(
        (code: string) => {
            if (verifyDebugCode(code, expectedCode)) {
                setDebugModeEnabled(true);
                reset();
                return true;
            }

            attemptsRef.current += 1;
            if (attemptsRef.current >= DEBUG_CODE_MAX_ATTEMPTS) reset();
            else setHasError(true);
            return false;
        },
        [expectedCode, reset]
    );

    const cancelChallenge = useCallback(() => {
        reset();
    }, [reset]);

    return { isChallengeOpen, hasError, registerTap, submitCode, cancelChallenge };
};
