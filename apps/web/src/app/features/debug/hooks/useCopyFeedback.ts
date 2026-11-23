import { useCallback, useEffect, useRef, useState } from 'react';

import { copyTextWithResult } from '../lib/copyText';

const COPIED_MS = 1500;
const FAILED_MS = 3000;

export type CopyState = 'idle' | 'copied' | 'failed';

export interface CopyFeedback {
    state: CopyState;
    copy: (value: string | null | undefined) => Promise<void>;
}

export const useCopyFeedback = (): CopyFeedback => {
    const [state, setState] = useState<CopyState>('idle');
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    useEffect(() => () => clearTimeout(timer.current), []);

    const copy = useCallback(async (value: string | null | undefined) => {
        const ok = await copyTextWithResult(value);
        setState(ok ? 'copied' : 'failed');
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setState('idle'), ok ? COPIED_MS : FAILED_MS);
    }, []);

    return { state, copy };
};
