import { useCallback, useEffect, useRef, useState } from 'react';

import { copyTextWithResult } from '../lib/copyText';

/** How long the outcome stays visible. A failure lingers — it is the one worth reading. */
const COPIED_MS = 1500;
const FAILED_MS = 3000;

export type CopyState = 'idle' | 'copied' | 'failed';

export interface CopyFeedback {
    state: CopyState;
    /** Copies and records the real outcome. Safe to call again while an outcome is showing. */
    copy: (value: string | null | undefined) => Promise<void>;
}

/**
 * The "copy, then say what happened" state machine.
 *
 * A hook rather than only a button, because the panel copies from three different shapes: pill
 * buttons, whole label/value rows, and a JSON block. `CopyButton` and `CopyRow` are the two
 * shapes; anything else can hold the state itself instead of copying silently.
 *
 * The outcome is the REAL one (`copyTextWithResult` awaits both the bridge reply and the Clipboard
 * API), so 복사 실패 appears when it actually failed — a WebView with no `navigator.clipboard`, or
 * a shell that rejected the command. On a device there is no way to check the clipboard without
 * leaving the app, which is what makes a silent copy button indistinguishable from a broken one.
 */
export const useCopyFeedback = (): CopyFeedback => {
    const [state, setState] = useState<CopyState>('idle');
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    // A screen can unmount while the indicator is still showing (tab switch, panel close).
    useEffect(() => () => clearTimeout(timer.current), []);

    const copy = useCallback(async (value: string | null | undefined) => {
        const ok = await copyTextWithResult(value);
        setState(ok ? 'copied' : 'failed');
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setState('idle'), ok ? COPIED_MS : FAILED_MS);
    }, []);

    return { state, copy };
};
