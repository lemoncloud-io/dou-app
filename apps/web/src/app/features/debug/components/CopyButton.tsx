import { useCallback, useEffect, useRef, useState } from 'react';

import { Check, Copy, TriangleAlert } from 'lucide-react';

import { copyTextWithResult } from '../lib/copyText';

/** How long the outcome stays on the button. A failure lingers — it is the one worth reading. */
const COPIED_MS = 1500;
const FAILED_MS = 3000;

type CopyState = 'idle' | 'copied' | 'failed';

const STATE_TEXT: Record<CopyState, string> = {
    idle: '복사',
    copied: '복사됨',
    failed: '복사 실패',
};

const STATE_ICON = { idle: Copy, copied: Check, failed: TriangleAlert } as const;

/**
 * Copy control with its own feedback.
 *
 * Feedback lives here rather than in each screen because the panel had drifted: eight screens
 * copied silently and only the log buffer told you it worked, with its own `copiedAt` state. A
 * silent copy button is indistinguishable from a broken one — on a device you cannot check the
 * clipboard without leaving the app.
 *
 * The outcome is the REAL one (`copyTextWithResult` awaits both the bridge reply and the Clipboard
 * API), so 복사 실패 appears when it actually failed — a WebView with no `navigator.clipboard`, or
 * a shell that rejected the command.
 *
 * `value` is a getter, not a string: these screens poll, and the snapshot has to be the one on
 * screen when the button was pressed rather than whatever the last render serialized.
 */
export const CopyButton = ({ value, label }: { value: () => string; label?: string }) => {
    const [state, setState] = useState<CopyState>('idle');
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    // A screen can unmount while the indicator is still showing (tab switch, panel close).
    useEffect(() => () => clearTimeout(timer.current), []);

    const handleClick = useCallback(async () => {
        const ok = await copyTextWithResult(value());
        setState(ok ? 'copied' : 'failed');
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setState('idle'), ok ? COPIED_MS : FAILED_MS);
    }, [value]);

    const Icon = STATE_ICON[state];

    return (
        <button
            type="button"
            onClick={() => void handleClick()}
            aria-live="polite"
            className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[12px] transition-colors ${
                state === 'failed' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'
            }`}
        >
            <Icon size={12} />
            {state === 'idle' ? (label ?? STATE_TEXT.idle) : STATE_TEXT[state]}
        </button>
    );
};
