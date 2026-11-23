import { useCallback, useEffect, useRef, useState } from 'react';

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

    useEffect(
        () => () => {
            if (timer.current) clearTimeout(timer.current);
        },
        []
    );

    return [copied, copy];
};
