import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Copy text to the clipboard and flag `copied` for a moment so callers can show
 * a transient "Copied" state. The flag auto-resets after `resetMs`.
 */
export const useCopyToClipboard = (resetMs = 1500): [boolean, (text: string) => void] => {
    const [copied, setCopied] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const copy = useCallback(
        (text: string) => {
            void navigator.clipboard?.writeText(text).then(() => {
                setCopied(true);
                if (timer.current) clearTimeout(timer.current);
                timer.current = setTimeout(() => setCopied(false), resetMs);
            });
        },
        [resetMs]
    );

    // Cancel a pending reset if the component unmounts mid-feedback.
    useEffect(() => () => {
        if (timer.current) clearTimeout(timer.current);
    }, []);

    return [copied, copy];
};
